import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, TrendingUp, Users, Timer, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { calculatePariMutuelOdds, calculateEstimatedNetGain, maxBetAmount, DEFAULT_ODDS, PROMO_NAMES } from '@/lib/pari-mutuel';
import { useCountdown } from '@/hooks/useCountdown';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import type { BetWithOptions } from '@/components/BetCard';
import type { Tables } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type WagerRow = Tables<'wagers'>;

type TierceSortMode = 'volume' | 'cote_asc' | 'cote_desc' | 'alpha';

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return format(new Date(dateStr), "d MMM yyyy · HH'h'mm", { locale: fr });
}

export default function BetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [bet, setBet] = useState<BetWithOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [pools, setPools] = useState<Record<string, number>>({});
  const [totalPool, setTotalPool] = useState(0);
  const [wagerCount, setWagerCount] = useState(0);
  const [myWagers, setMyWagers] = useState<(WagerRow & { option_label?: string })[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [placing, setPlacing] = useState(false);
  const [tierceSort, setTierceSort] = useState<TierceSortMode>('volume');

  const fetchBet = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('bets')
      .select('*, bet_options(*)')
      .eq('id', id)
      .single();
    if (error || !data) { toast.error('Pari introuvable'); setLoading(false); return; }
    setBet(data as BetWithOptions);

    // Fetch wagers
    const { data: wagers } = await supabase
      .from('wagers')
      .select('*')
      .eq('bet_id', id)
      .eq('is_retracted', false);
    if (wagers) {
      const p: Record<string, number> = {};
      let total = 0;
      const userIds = new Set<string>();
      const mine: (WagerRow & { option_label?: string })[] = [];
      for (const w of wagers) {
        p[w.option_id] = (p[w.option_id] || 0) + w.montant_dc;
        total += w.montant_dc;
        userIds.add(w.user_id);
        if (user && w.user_id === user.id) {
          const opt = (data as BetWithOptions).bet_options.find(o => o.id === w.option_id);
          mine.push({ ...w, option_label: opt?.label });
        }
      }
      setPools(p);
      setTotalPool(total);
      setWagerCount(userIds.size);
      setMyWagers(mine);
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => { fetchBet(); }, [fetchBet]);

  // Realtime
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`bet-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wagers', filter: `bet_id=eq.${id}` }, () => fetchBet())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets', filter: `id=eq.${id}` }, () => fetchBet())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, fetchBet]);

  const isOpen = bet?.status === 'ouvert';
  const isClosed = bet?.status === 'cloture_en_attente';
  const isSuspended = bet?.status === 'suspendu';
  const isLongTerm = bet?.is_long_terme ?? false;
  const isTierce = bet?.type === 'tierce_du_daim';
  const max = maxBetAmount(profile?.balance || 0, isLongTerm);
  const numAmount = parseInt(amount) || 0;

  const selectedOption = bet?.bet_options.find(o => o.id === selectedOptionId);
  const selectedOdds = selectedOptionId
    ? (totalPool > 0 && (pools[selectedOptionId] || 0) > 0
      ? calculatePariMutuelOdds(totalPool, pools[selectedOptionId] || 0)
      : DEFAULT_ODDS)
    : DEFAULT_ODDS;
  const estimatedNet = numAmount > 0 ? calculateEstimatedNetGain(numAmount, selectedOdds) : 0;
  const profit = estimatedNet - numAmount;
  const canPlace = numAmount > 0 && numAmount <= max && numAmount <= (profile?.balance || 0) && !!selectedOptionId;
  const hasTierceWager = isTierce && myWagers.length > 0;

  // Sort options for tiercé
  const sortedOptions = useMemo(() => {
    if (!bet) return [];
    const opts = [...bet.bet_options];
    if (!isTierce) return opts;
    switch (tierceSort) {
      case 'volume': return opts.sort((a, b) => (pools[b.id] || 0) - (pools[a.id] || 0));
      case 'cote_asc': return opts.sort((a, b) => a.cote_actuelle - b.cote_actuelle);
      case 'cote_desc': return opts.sort((a, b) => b.cote_actuelle - a.cote_actuelle);
      case 'alpha': return opts.sort((a, b) => a.label.localeCompare(b.label));
      default: return opts;
    }
  }, [bet?.bet_options, pools, tierceSort, isTierce]);

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;
  if (!bet) return <div className="text-center py-20 text-muted-foreground">Pari introuvable</div>;

  const handlePlace = async () => {
    if (!canPlace || !selectedOptionId || !user) return;
    setPlacing(true);
    const { data, error } = await supabase.rpc('place_wager', {
      p_user_id: user.id, p_bet_id: bet.id, p_option_id: selectedOptionId, p_montant_dc: numAmount,
    });
    if (error) { toast.error('Erreur lors de la mise'); setPlacing(false); return; }
    const result = data as { error?: string; success?: boolean };
    if (result.error) { toast.error(result.error); setPlacing(false); return; }
    toast.success('Mise placée ! 🦌');
    setAmount('');
    setSelectedOptionId(null);
    setPlacing(false);
    await Promise.all([fetchBet(), refreshProfile()]);
  };

  const handleRetract = async (wagerId: string) => {
    if (!user) return;
    const { data, error } = await supabase.rpc('retract_wager', { p_wager_id: wagerId, p_user_id: user.id });
    if (error) { toast.error('Erreur'); return; }
    const result = data as { error?: string; success?: boolean };
    if (result.error) { toast.error(result.error); return; }
    toast.success('Mise rétractée — remboursement effectué');
    await Promise.all([fetchBet(), refreshProfile()]);
  };

  // sortedOptions already computed above hooks

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl pb-20 md:pb-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Left column — Info */}
        <div className="md:col-span-3 space-y-4">
          <h1 className="text-3xl font-display tracking-[0.05em]">{bet.emoji || '🎲'} {bet.title}</h1>
          {bet.description && <p className="text-muted-foreground">{bet.description}</p>}

          <div className="flex flex-wrap gap-2 text-xs">
            <StatusBadge status={bet.status} />
            <span className="bg-secondary px-2 py-1 rounded-full text-muted-foreground">{bet.type.replace(/_/g, ' ')}</span>
            {isLongTerm && <span className="bg-accent/10 text-accent px-2 py-1 rounded-full">📅 Long terme · Mise max 15%</span>}
          </div>

          <CountdownBanner bet={bet} />

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>📅 Fin du pari : <span className="text-foreground">{formatDate(bet.end_date)}</span></span>
            <span>🔒 Mises closes à : <span className="text-foreground">{formatDate(bet.close_date)}</span></span>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {totalPool > 0 && (
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> Cagnotte : <span className="text-primary font-bold">{totalPool}</span>
                <img src={daimcoinLogo} alt="" className="w-3.5 h-3.5 rounded-full" />
              </span>
            )}
            {wagerCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> {wagerCount} parieur{wagerCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Tiercé sort */}
          {isTierce && (
            <div className="flex gap-2 flex-wrap">
              {([
                { v: 'volume' as const, l: '🔥 Par volume' },
                { v: 'cote_asc' as const, l: '📈 Cote ↑' },
                { v: 'cote_desc' as const, l: '📉 Cote ↓' },
                { v: 'alpha' as const, l: '🔤 A-Z' },
              ]).map(s => (
                <button
                  key={s.v}
                  onClick={() => setTierceSort(s.v)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${tierceSort === s.v ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                >
                  {s.l}
                </button>
              ))}
            </div>
          )}

          {/* All options */}
          <div className="space-y-2">
            {sortedOptions.map(opt => {
              const optPool = pools[opt.id] || 0;
              const odds = totalPool > 0 && optPool > 0 ? calculatePariMutuelOdds(totalPool, optPool) : DEFAULT_ODDS;
              const pct = totalPool > 0 ? ((optPool / totalPool) * 100).toFixed(0) : '0';
              const isResolved = bet.status === 'resolu';
              const isWinnerOpt = isResolved && opt.is_winner === true;
              const isLoserOpt = isResolved && opt.is_winner === false;
              return (
                <div
                  key={opt.id}
                  onClick={() => isOpen && !isSuspended && !hasTierceWager && setSelectedOptionId(opt.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                    isWinnerOpt
                      ? 'border-green-500/50 bg-green-500/10'
                      : isLoserOpt
                        ? 'border-border/30 bg-secondary/30 opacity-60'
                        : selectedOptionId === opt.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border/50 bg-secondary/50 hover:border-primary/30'
                  } ${isOpen && !isSuspended && !hasTierceWager ? 'cursor-pointer' : ''}`}
                >
                  <div>
                    <span className="font-medium">
                      {isWinnerOpt && '✅ '}{opt.label}
                      {isWinnerOpt && <span className="text-green-500 ml-1 text-sm font-semibold">a gagné !</span>}
                    </span>
                    <div className="text-xs text-muted-foreground">{pct}% · {optPool} DC</div>
                  </div>
                  <div className="text-center">
                    <span className={`font-bold text-sm px-2 py-1 rounded ${isWinnerOpt ? 'text-green-500 bg-green-500/10' : 'text-primary bg-primary/10'}`}>
                      x{odds.toFixed(2)}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {isResolved ? 'Cote définitive' : isClosed ? 'Cote définitive' : 'Cote estimée'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* My wagers */}
          {myWagers.length > 0 && (
            <div className="mt-6">
              <h3 className="font-display text-lg tracking-[0.05em] mb-2">🦌 Mes mises sur ce pari</h3>
              <div className="space-y-2">
                {myWagers.map(w => {
                  const wOdds = totalPool > 0 && (pools[w.option_id] || 0) > 0
                    ? calculatePariMutuelOdds(totalPool, pools[w.option_id] || 0) : DEFAULT_ODDS;
                  const estNet = calculateEstimatedNetGain(w.montant_dc, wOdds);
                  return (
                    <div key={w.id} className="bg-secondary/50 border border-border rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{w.option_label || '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {w.montant_dc} DC · Cote à la mise : x{Number(w.cote_au_moment_mise).toFixed(2)} · Gain estimé : <span className="text-primary">{estNet} DC</span>
                        </p>
                      </div>
                      {isOpen && (
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => handleRetract(w.id)}>
                          Annuler
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column — Betting interface */}
        <div className="md:col-span-2">
          <div className="sticky top-20 bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-display text-lg tracking-[0.05em]">Placer une mise</h3>

            {isSuspended && <p className="text-sm text-amber-500 text-center">⏸️ Pari suspendu</p>}
            {isClosed && <p className="text-sm text-muted-foreground text-center">Mises closes — résultat à venir</p>}
            {hasTierceWager && (
              <p className="text-sm text-muted-foreground text-center">
                Tu as déjà misé sur <span className="text-primary font-semibold">{myWagers[0]?.option_label}</span> pour ce pari.
              </p>
            )}

            {isOpen && !isSuspended && !hasTierceWager && (
              <>
                {!selectedOptionId ? (
                  <p className="text-sm text-muted-foreground text-center">← Sélectionne une option à gauche</p>
                ) : (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Option :</p>
                      <p className="font-display text-xl text-primary tracking-[0.05em]">{selectedOption?.label}</p>
                      <p className="text-xs text-muted-foreground">Cote estimée : <span className="text-primary font-bold">x{selectedOdds.toFixed(2)}</span></p>
                    </div>

                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">Combien tu mises ? (DC)</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={max}
                          value={amount}
                          onChange={e => setAmount(e.target.value)}
                          placeholder="0"
                          className="text-center text-lg h-12"
                        />
                        <img src={daimcoinLogo} alt="" className="w-5 h-5 rounded-full" />
                      </div>
                      <div className="flex gap-2 mt-2">
                        {[10, 50].map(q => (
                          <button key={q} onClick={() => setAmount(String(Math.min(q, max)))} className="flex-1 text-xs py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">{q} DC</button>
                        ))}
                        <button onClick={() => setAmount(String(max))} className="flex-1 text-xs py-1.5 rounded-lg bg-primary/10 text-primary font-semibold hover:bg-primary/20 transition-colors">MAX</button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Maximum : {isLongTerm ? '15%' : '30%'} de ton solde = <span className="text-primary font-semibold">{max} DC</span>
                      </p>
                    </div>

                    {numAmount > 0 && (
                      <div className="bg-secondary/50 border border-border rounded-xl p-3 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Gain estimé (après rake 5%)</span>
                          <span className="text-primary font-bold">{estimatedNet} DC</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Profit potentiel</span>
                          <span className={profit > 0 ? 'text-green-500 font-bold' : 'text-muted-foreground'}>
                            {profit > 0 ? '+' : ''}{profit} DC
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          Montants provisoires — les cotes évoluent avec les mises des autres.
                        </p>
                      </div>
                    )}

                    {numAmount > (profile?.balance || 0) && (
                      <p className="text-xs text-destructive text-center">Solde insuffisant (solde actuel : {profile?.balance || 0} DC).</p>
                    )}

                    <Button className="w-full gold-gradient text-base font-semibold h-12" disabled={!canPlace || placing} onClick={handlePlace}>
                      {placing ? 'Placement...' : 'Placer ma mise 🦌'}
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ouvert: { label: '🔥 Ouvert', cls: 'bg-primary/10 text-primary' },
    cloture_en_attente: { label: '⏳ En attente', cls: 'bg-secondary text-muted-foreground' },
    suspendu: { label: '⏸️ Suspendu', cls: 'bg-amber-500/10 text-amber-500' },
    resolu: { label: '✅ Résolu', cls: 'bg-green-500/10 text-green-500' },
  };
  const s = map[status] || map.ouvert;
  return <span className={`px-2 py-1 rounded-full ${s.cls}`}>{s.label}</span>;
}

function CountdownBanner({ bet }: { bet: BetWithOptions }) {
  const closeDate = bet.close_date ? new Date(bet.close_date) : null;
  const countdown = useCountdown(bet.status === 'ouvert' && closeDate ? closeDate : null);
  if (!countdown?.isUrgent) return null;
  return (
    <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
      <Timer className="w-4 h-4 text-destructive animate-pulse" />
      <span className="text-sm font-semibold text-destructive">Fin des mises dans {countdown.text}</span>
    </div>
  );
}
