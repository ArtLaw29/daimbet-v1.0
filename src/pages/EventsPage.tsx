import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Flame, Clock, CheckCircle, XCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { calculatePariMutuelOdds, maxBetAmount, calculateEstimatedNetGain, DEFAULT_ODDS, STARTING_BALANCE } from '@/lib/pari-mutuel';
import { INTRO_PARIS } from '@/components/TabIntro';
import type { Tables } from '@/integrations/supabase/types';

type BetOption = Tables<'bet_options'>;
type BetRow = Tables<'bets'>;

interface BetWithOptions extends BetRow {
  bet_options: BetOption[];
}

export default function EventsPage() {
  const { user, profile } = useAuth();
  const [bets, setBets] = useState<BetWithOptions[]>([]);
  const [betAmounts, setBetAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [wagerPools, setWagerPools] = useState<Record<string, Record<string, number>>>({});
  const [betTotals, setBetTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchBets();
  }, []);

  const fetchBets = async () => {
    const { data, error } = await supabase
      .from('bets')
      .select('*, bet_options(*)')
      .in('status', ['ouvert', 'cloture_en_attente'])
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Erreur chargement des paris');
    } else {
      const items = (data as BetWithOptions[]) || [];
      setBets(items);
      if (items.length > 0) {
        const betIds = items.map(b => b.id);
        const { data: wagers } = await supabase
          .from('wagers')
          .select('bet_id, option_id, montant_dc, is_retracted')
          .in('bet_id', betIds);
        if (wagers) {
          const pools: Record<string, Record<string, number>> = {};
          const totals: Record<string, number> = {};
          for (const w of wagers) {
            if (!w.is_retracted) {
              if (!pools[w.bet_id]) pools[w.bet_id] = {};
              pools[w.bet_id][w.option_id] = (pools[w.bet_id][w.option_id] || 0) + w.montant_dc;
              totals[w.bet_id] = (totals[w.bet_id] || 0) + w.montant_dc;
            }
          }
          setWagerPools(pools);
          setBetTotals(totals);
        }
      }
    }
    setLoading(false);
  };

  const placeWager = async (betId: string, optionId: string) => {
    const amount = betAmounts[optionId] || 10;
    if (!user || !profile) return;

    const bet = bets.find(b => b.id === betId);
    if (!bet || bet.status !== 'ouvert') {
      toast.error('Les mises sont clôturées pour ce pari');
      return;
    }

    const isLongTerm = bet.is_long_terme;
    const maxBet = maxBetAmount(profile.balance, isLongTerm);
    const pctLabel = isLongTerm ? '15%' : '30%';

    if (amount > maxBet) {
      toast.error(`Mise max : ${maxBet} DC (${pctLabel} de ton capital) 💸`);
      return;
    }
    if (amount > profile.balance) {
      toast.error('Pas assez de DAIMcoins ! 💸');
      return;
    }
    if (amount < 1) {
      toast.error('Mise minimum : 1 DC');
      return;
    }

    const totalPool = (betTotals[betId] || 0) + amount;
    const optionPool = ((wagerPools[betId] || {})[optionId] || 0) + amount;
    const estimatedOdds = calculatePariMutuelOdds(totalPool, optionPool);

    const { error } = await supabase.from('wagers').insert({
      user_id: user.id,
      bet_id: betId,
      option_id: optionId,
      montant_dc: amount,
      cote_au_moment_mise: estimatedOdds,
    });

    if (error) {
      toast.error('Erreur lors de la mise');
    } else {
      await supabase
        .from('profiles')
        .update({ balance: profile.balance - amount })
        .eq('user_id', user.id);
      
      await supabase.from('solde_history').insert({
        user_id: user.id,
        delta_dc: -amount,
        reason: `Mise sur: ${bet.title}`,
      });

      const estimatedNet = calculateEstimatedNetGain(amount, estimatedOdds);
      toast.success(`Mise placée ! 🎰 Cote estimée : x${estimatedOdds.toFixed(2)} · Gain estimé (après rake 5%) : ${estimatedNet} DC`);
      window.location.reload();
    }
  };

  const statusConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    ouvert: { icon: Flame, label: 'Mises ouvertes 🔥', color: 'text-primary' },
    cloture_en_attente: { icon: Clock, label: 'Mises clôturées', color: 'text-muted-foreground' },
    resolu: { icon: CheckCircle, label: 'Résolu ✅', color: 'text-success' },
    supprime: { icon: XCircle, label: 'Supprimé', color: 'text-destructive' },
  };

  const categoryEmojis: Record<string, string> = {
    urgent: '⚡',
    long_terme: '🔮',
    culture_daim: '🦌',
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="text-center mb-4">
        <h1 className="text-4xl font-display gold-text">Les Paris du Moment</h1>
        <p className="text-muted-foreground mt-1">Place tes DAIMcoins sur les événements de la promo 🦌</p>
        <p className="text-xs text-muted-foreground mt-2 bg-secondary/50 inline-block px-3 py-1 rounded-full">
          💡 Système Pari Mutuel : les cotes évoluent en temps réel selon les mises !
        </p>
      </div>

      <div className="bg-secondary/30 border border-border rounded-lg p-3 mb-6 text-center">
        <p className="text-sm text-muted-foreground">
          🔄 Les {STARTING_BALANCE} DC sont <span className="text-primary font-semibold">réinitialisés chaque mois</span>.
          Mise max : <span className="text-primary font-semibold">30% du capital</span> (15% pour les paris long terme).
          Rake : <span className="text-primary font-semibold">5% sur les gains nets</span>.
        </p>
      </div>

      {bets.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Aucun pari pour le moment.</p>
          <p className="text-sm mt-1">Propose-en un dans l'onglet "Proposer" !</p>
        </div>
      )}

      <div className="space-y-6">
        {bets.map((bet, i) => {
          const status = statusConfig[bet.status] || statusConfig.ouvert;
          const StatusIcon = status.icon;
          const emoji = categoryEmojis[bet.category] || '🎲';
          const totalPool = betTotals[bet.id] || 0;
          const pools = wagerPools[bet.id] || {};
          const isLongTerm = bet.is_long_terme;

          return (
            <motion.div
              key={bet.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-xl border border-border bg-card p-5 card-glow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-xl font-display tracking-wider">
                    {emoji} {bet.emoji || ''} {bet.title}
                  </h2>
                  {bet.description && (
                    <p className="text-sm text-muted-foreground mt-1">{bet.description}</p>
                  )}
                  {bet.category === 'urgent' && (
                    <span className="inline-flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded-full mt-1">
                      <AlertTriangle className="w-3 h-3" /> Pari urgent
                    </span>
                  )}
                  {bet.is_long_terme && (
                    <span className="inline-flex items-center gap-1 text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full mt-1">
                      🔮 Pari long terme · Mise max 15%
                    </span>
                  )}
                </div>
                <span className={`flex items-center gap-1 text-xs font-medium ${status.color}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {status.label}
                </span>
              </div>

              {totalPool > 0 && (
                <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Cagnotte totale : <span className="text-primary font-bold">{totalPool}</span>
                  <img src={daimcoinLogo} alt="" className="w-3.5 h-3.5 rounded-full" />
                </div>
              )}

              <div className="space-y-2">
                {bet.bet_options.map((option) => {
                  const optionPool = pools[option.id] || 0;
                  const liveOdds = totalPool > 0 && optionPool > 0 ? calculatePariMutuelOdds(totalPool, optionPool) : DEFAULT_ODDS;
                  const percentage = totalPool > 0 ? ((optionPool / totalPool) * 100).toFixed(0) : '0';
                  const currentBetAmount = betAmounts[option.id] || 10;
                  const estimatedNet = calculateEstimatedNetGain(currentBetAmount, liveOdds);

                  return (
                    <div key={option.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
                      <div className="flex-1">
                        <span className="font-medium">{option.label}</span>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {optionPool > 0 ? (
                            <>{percentage}% des mises · {optionPool} DC</>
                          ) : (
                            <>Aucune mise pour l'instant</>
                          )}
                        </div>
                        {bet.status === 'ouvert' && (
                          <div className="text-xs text-primary/80 mt-0.5">
                            Gain estimé (après rake de 5%) : {estimatedNet} DC
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <span className="text-primary font-bold text-sm px-2 py-1 rounded bg-primary/10 block">
                          x{liveOdds.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Cote estimée</span>
                      </div>
                      {bet.status === 'ouvert' && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={maxBetAmount(profile?.balance || 0, isLongTerm)}
                            value={betAmounts[option.id] || 10}
                            onChange={(e) =>
                              setBetAmounts({ ...betAmounts, [option.id]: parseInt(e.target.value) || 0 })
                            }
                            className="w-20 h-8 text-center text-sm"
                          />
                          <img src={daimcoinLogo} alt="" className="w-4 h-4 rounded-full" />
                          <Button
                            size="sm"
                            className="gold-gradient text-xs font-semibold"
                            onClick={() => placeWager(bet.id, option.id)}
                          >
                            Parier
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
