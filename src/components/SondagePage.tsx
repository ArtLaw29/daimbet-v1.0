import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Users, Clock, CheckCircle, ChevronRight, Archive, ArrowLeft, Trophy, Coins, Lock, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import type { Json } from '@/integrations/supabase/types';
import CoinRain from '@/components/CoinRain';
import ContactFooter from '@/components/ContactFooter';
import { PROMO_NAMES } from '@/lib/pari-mutuel';
import { fetchHiddenNames, filterNames } from '@/lib/visibility';
import PendingProposalsSection from '@/components/PendingProposalsSection';
import ProposeNewDialog from '@/components/ProposeNewDialog';

const COMBO_MOTIFS = [
  'Trafic d\'influence', 'Délit d\'initié', 'Fraude fiscale', 'Blanchiment',
  'Trafic d\'organes', 'Corruption', 'Abus de biens sociaux',
  'Faux et usage de faux', 'Escroquerie', 'Recel',
];

interface SondageSession {
  id: string;
  game_type: string;
  title: string;
  subtitle: string | null;
  status: string;
  config: Record<string, any>;
  created_at: string;
  closed_at: string | null;
}

interface Participation {
  id: string;
  session_id: string;
  user_id: string;
  data: Record<string, any>;
  created_at: string;
}

type View = 'list' | 'detail' | 'archives';
type SondageFormat = 'simple' | 'combinaison' | 'predefined_libre';

export default function SondagePage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SondageSession[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<SondageSession[]>([]);
  const [participationCounts, setParticipationCounts] = useState<Record<string, number>>({});
  const [userParticipations, setUserParticipations] = useState<Record<string, Participation>>({});
  const [allParticipations, setAllParticipations] = useState<Record<string, Participation[]>>({});
  const [selectedSession, setSelectedSession] = useState<SondageSession | null>(null);
  const [view, setView] = useState<View>('list');
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [hiddenSondageNames, setHiddenSondageNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchHiddenNames('visible_in_sondages').then(setHiddenSondageNames);
  }, []);

  const visiblePromoNames = useMemo(
    () => filterNames(PROMO_NAMES, hiddenSondageNames),
    [hiddenSondageNames]
  );

  // Vote form state
  const [selectedVote, setSelectedVote] = useState('');
  const [pronostic, setPronostic] = useState('');
  const [betAmount, setBetAmount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showCoinRain, setShowCoinRain] = useState(false);

  // Combo format state
  const [comboPrenom, setComboPrenom] = useState('');
  const [comboMotif, setComboMotif] = useState('');
  const [comboVoteOther, setComboVoteOther] = useState('');
  const [pronosticFirst, setPronosticFirst] = useState('');
  const [pronosticSecond, setPronosticSecond] = useState('');

  // Add option state
  const [newOptionText, setNewOptionText] = useState('');
  const [addingFromPromo, setAddingFromPromo] = useState('');

  // Reveal animation
  const [revealStep, setRevealStep] = useState(-1);
  const [revealDone, setRevealDone] = useState(false);

  // Proposal
  const [showPropose, setShowPropose] = useState(false);
  const [proposeTitle, setProposeTitle] = useState('');
  const [proposeOptions, setProposeOptions] = useState('');
  const [proposeEndDate, setProposeEndDate] = useState('');

  const fetchSessions = async () => {
    const [activeRes, archivedRes] = await Promise.all([
      supabase.from('game_sessions').select('*').eq('game_type', 'sondage').in('status', ['active', 'voting']).order('created_at', { ascending: false }),
      supabase.from('game_sessions').select('*').eq('game_type', 'sondage').in('status', ['closed', 'archived']).order('closed_at', { ascending: false }).limit(50),
    ]);
    const active = (activeRes.data || []) as SondageSession[];
    const archived = (archivedRes.data || []) as SondageSession[];
    setSessions(active);
    setArchivedSessions(archived);

    const allIds = [...active, ...archived].map(s => s.id);
    if (allIds.length > 0) {
      const [countsRes, myRes, combosRes] = await Promise.all([
        (supabase as any).rpc('get_session_participation_counts', { p_session_ids: allIds }),
        user ? supabase.from('game_participations').select('*').in('session_id', allIds).eq('user_id', user.id) : Promise.resolve({ data: [] }),
        // Combos publics (sans pronostic ni mise) — un appel par session combo
        Promise.all(
          [...active, ...archived]
            .filter(s => (s.config as any)?.format === 'combinaison')
            .map(s => (supabase as any).rpc('get_sondage_combos_public', { p_session_id: s.id })
              .then((r: any) => ({ id: s.id, rows: r.data || [] })))
        ),
      ]);
      const counts: Record<string, number> = {};
      ((countsRes as any).data || []).forEach((p: any) => { counts[p.session_id] = Number(p.participant_count) || 0; });
      setParticipationCounts(counts);
      const uMap: Record<string, Participation> = {};
      ((myRes as any).data || []).forEach((p: any) => { uMap[p.session_id] = p; });
      setUserParticipations(uMap);
      const aMap: Record<string, Participation[]> = {};
      (combosRes as any[]).forEach((entry: any) => {
        aMap[entry.id] = (entry.rows || []).map((r: any) => ({
          session_id: entry.id,
          user_id: r.user_id,
          data: { combo: r.combo },
        })) as any;
      });
      setAllParticipations(aMap);
    }

    if (user) {
      const { data: prof } = await supabase.from('profiles').select('balance').eq('user_id', user.id).single();
      if (prof) setBalance(prof.balance);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();
    const channel = supabase
      .channel('sondage-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions' }, () => fetchSessions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_participations' }, () => fetchSessions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const getFormat = (s: SondageSession): SondageFormat => (s.config?.format as SondageFormat) || 'simple';

  const openDetail = (s: SondageSession) => {
    setSelectedSession(s);
    setView('detail');
    setRevealStep(-1);
    setRevealDone(false);
    const existing = userParticipations[s.id];
    const fmt = getFormat(s);
    if (fmt === 'combinaison') {
      setComboPrenom(existing?.data?.combo?.split(' — ')[0] || '');
      setComboMotif(existing?.data?.combo?.split(' — ')[1] || '');
      setComboVoteOther('');
      setPronosticFirst(existing?.data?.pronostic_first || '');
      setPronosticSecond(existing?.data?.pronostic_second || '');
      setBetAmount(existing?.data?.bet_amount || 1);
    } else {
      setSelectedVote(existing?.data?.vote || '');
      setPronostic(existing?.data?.pronostic || '');
      setBetAmount(existing?.data?.bet_amount || 1);
    }
    setNewOptionText('');
    setAddingFromPromo('');
  };

  const maxBet = useMemo(() => {
    if (!selectedSession) return 0;
    const existing = userParticipations[selectedSession.id];
    const effectiveBal = balance + (existing?.data?.bet_amount || 0);
    return Math.floor(effectiveBal * 0.20);
  }, [balance, selectedSession, userParticipations]);

  const submitVote = async () => {
    if (!user || !selectedSession || betAmount < 1) return;
    const fmt = getFormat(selectedSession);

    let voteParam: string;
    let pronosticParam: string;

    if (fmt === 'combinaison') {
      const myCombo = `${comboPrenom} — ${comboMotif}`;
      if (!comboPrenom || !comboMotif || !pronosticFirst || !pronosticSecond) {
        toast.error('Remplis tous les champs');
        return;
      }
      const votes = [myCombo];
      if (comboVoteOther && comboVoteOther !== myCombo) votes.push(comboVoteOther);
      voteParam = JSON.stringify({ combo: myCombo, votes });
      pronosticParam = JSON.stringify({ first: pronosticFirst, second: pronosticSecond });
    } else {
      if (!selectedVote || !pronostic) return;
      voteParam = selectedVote;
      pronosticParam = pronostic;
    }

    setSubmitting(true);
    const { data } = await supabase.rpc('place_sondage_vote', {
      p_user_id: user.id,
      p_session_id: selectedSession.id,
      p_vote: voteParam,
      p_pronostic: pronosticParam,
      p_bet_amount: betAmount,
    });
    setSubmitting(false);
    const result = data as any;
    if (result?.error) { toast.error(result.error); return; }
    toast.success(userParticipations[selectedSession.id] ? 'Vote modifié ! 🔄' : 'Vote enregistré ! 🎉');
    fetchSessions();
  };

  const addOption = async (opt: string) => {
    if (!selectedSession || !opt.trim()) return;
    const current = (selectedSession.config?.options as string[]) || [];
    if (current.includes(opt.trim())) { toast.error('Cette option existe déjà'); return; }
    const newOpts = [...current, opt.trim()];
    await supabase.from('game_sessions').update({ config: { ...selectedSession.config, options: newOpts } }).eq('id', selectedSession.id);
    toast.success('Option ajoutée !');
    setNewOptionText('');
    setAddingFromPromo('');
    fetchSessions();
  };

  const proposeSession = async () => {
    if (!user || !proposeTitle.trim()) return;
    const config: Record<string, unknown> = { format: 'simple' };
    if (proposeOptions.trim()) config.options = proposeOptions.split('\n').map(o => o.trim()).filter(Boolean);
    if (proposeEndDate) config.end_date = new Date(proposeEndDate).toISOString();

    const { error } = await supabase.from('game_sessions').insert([{
      game_type: 'sondage' as any,
      title: proposeTitle.trim(),
      status: 'active' as any,
      config: config as Json,
      created_by: user.id,
    }] as any);
    if (error) { toast.error('Erreur'); return; }
    await supabase.from('gazette_messages').insert({ content: `🗳️ Nouveau sondage : "${proposeTitle.trim()}" — Venez voter !`, is_system_message: true });
    toast.success('Sondage publié ! 🎉');
    setProposeTitle(''); setProposeOptions(''); setProposeEndDate('');
    setShowPropose(false);
    fetchSessions();
  };

  const startReveal = () => {
    if (!selectedSession) return;
    const results = selectedSession.config?.results as any[];
    if (!results || results.length === 0) return;
    let step = 0;
    setRevealStep(0);
    const interval = setInterval(() => {
      step++;
      if (step >= results.length) {
        clearInterval(interval);
        setRevealDone(true);
        const myPart = userParticipations[selectedSession.id];
        if (myPart && myPart.data?.vote === selectedSession.config?.winner_option) {
          setShowCoinRain(true);
          setTimeout(() => setShowCoinRain(false), 3000);
        }
      } else {
        setRevealStep(step);
      }
    }, 800);
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Chargement...</div>;

  // ═══════════════ DETAIL VIEW ═══════════════
  if (view === 'detail' && selectedSession) {
    const config = selectedSession.config;
    const fmt = getFormat(selectedSession);
    const options = (config?.options as string[]) || [];
    const count = participationCounts[selectedSession.id] || 0;
    const myPart = userParticipations[selectedSession.id];
    const isOpen = selectedSession.status === 'active' || selectedSession.status === 'voting';
    const isClosed = selectedSession.status === 'closed' || selectedSession.status === 'archived';
    const results = (config?.results as any[]) || [];
    const winnerOption = config?.winner_option as string;
    const winnerOption2 = config?.winner_option_2 as string;
    const endDate = config?.end_date ? new Date(config.end_date as string) : null;
    const now = new Date();
    const votingClosed = endDate ? now > new Date(endDate.getTime() - 20 * 60000) : false;

    // For combo: get all combos from other users
    const sessionParts = allParticipations[selectedSession.id] || [];
    const otherCombos = sessionParts
      .filter(p => p.user_id !== user?.id && p.data?.combo)
      .map(p => p.data.combo as string);

    return (
      <div className="space-y-4">
        {showCoinRain && <CoinRain amount={10} />}
        <button onClick={() => { setView('list'); setSelectedSession(null); }} className="text-sm text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Retour
        </button>

        <div className="rounded-xl border border-border bg-card p-6 card-glow space-y-4">
          <div>
            <h2 className="text-xl font-display">{selectedSession.title}</h2>
            {selectedSession.subtitle && <p className="text-sm text-muted-foreground mt-1">{selectedSession.subtitle}</p>}
            {fmt === 'predefined_libre' && <p className="text-xs text-muted-foreground mt-1">N'hésite pas à ajouter les sports et les athlètes de ton choix !</p>}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {count} participant{count > 1 ? 's' : ''}</span>
            {endDate && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> Fin : {endDate.toLocaleDateString('fr-FR')} {endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {isOpen && <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]">🟢 En cours</span>}
            {isClosed && <span className="px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive text-[10px]">🔴 Terminé</span>}
          </div>

          {/* CLOSED — Results reveal */}
          {isClosed && results.length > 0 && (
            <ResultsReveal
              results={results}
              revealStep={revealStep}
              revealDone={revealDone}
              startReveal={startReveal}
              winnerOption={winnerOption}
              winnerOption2={winnerOption2}
              myPart={myPart}
              config={config}
              format={fmt}
            />
          )}

          {/* OPEN — Voting */}
          {isOpen && (
            <>
              {votingClosed ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Lock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Les votes sont fermés (20 min avant la fin)</p>
                </div>
              ) : fmt === 'combinaison' ? (
                <ComboVoteForm
                  comboPrenom={comboPrenom} setComboPrenom={setComboPrenom}
                  comboMotif={comboMotif} setComboMotif={setComboMotif}
                  comboVoteOther={comboVoteOther} setComboVoteOther={setComboVoteOther}
                  pronosticFirst={pronosticFirst} setPronosticFirst={setPronosticFirst}
                  pronosticSecond={pronosticSecond} setPronosticSecond={setPronosticSecond}
                  betAmount={betAmount} setBetAmount={setBetAmount}
                  maxBet={maxBet}
                  otherCombos={otherCombos}
                  options={options}
                  submitting={submitting}
                  myPart={myPart}
                  onSubmit={submitVote}
                  promoNames={visiblePromoNames}
                />
              ) : (
                <SimpleVoteForm
                  options={options}
                  selectedVote={selectedVote} setSelectedVote={setSelectedVote}
                  pronostic={pronostic} setPronostic={setPronostic}
                  betAmount={betAmount} setBetAmount={setBetAmount}
                  maxBet={maxBet}
                  submitting={submitting}
                  myPart={myPart}
                  onSubmit={submitVote}
                  format={fmt}
                  onAddOption={addOption}
                  newOptionText={newOptionText} setNewOptionText={setNewOptionText}
                  addingFromPromo={addingFromPromo} setAddingFromPromo={setAddingFromPromo}
                  promoNames={visiblePromoNames}
                />
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════ ARCHIVES VIEW ═══════════════
  if (view === 'archives') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('list')} className="text-sm text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Retour aux sondages actifs
        </button>
        <div className="text-center mb-4">
          <p className="text-4xl">📁</p>
          <h2 className="text-xl font-display mt-1">Archives des sondages</h2>
        </div>
        {archivedSessions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Aucun sondage archivé.</p>
        ) : (
          archivedSessions.map((s, i) => (
            <motion.button key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              onClick={() => openDetail(s)}
              className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-all flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{s.title}</h3>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span><Users className="w-3 h-3 inline" /> {participationCounts[s.id] || 0}</span>
                  <span>🏆 {(s.config?.winner_option as string) || '—'}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </motion.button>
          ))
        )}
      </div>
    );
  }

  // ═══════════════ LIST VIEW ═══════════════
  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <p className="text-4xl">🗳️</p>
        <h2 className="text-xl font-display mt-1">Daimocratie — Sondages</h2>
        <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">
          Bienvenue dans Daimocratie — Sondages, où tu réponds aux questions en exprimant ton choix personnel via un vote classique tout en pariant sur l'option que tu penses être la plus populaire. Ce pronostic secret reste invisible des autres et te permet de miser tes DaimCoins sur le résultat collectif final. Toute la subtilité repose sur le décalage stratégique : tu peux voter selon ton cœur tout en pariant sur une autre option si tu penses que la majorité fera un choix différent. Si ton pronostic secret est le bon, tu reçois un bonus de DaimCoins.
        </p>
      </div>

      <div className="flex justify-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => setView('archives')}>
          <Archive className="w-3 h-3 mr-1" /> Archives
        </Button>
        <ProposeNewDialog kind="sondage" onSubmitted={fetchSessions} buttonLabel="Proposer un sondage" />
      </div>

      <PendingProposalsSection kind="sondage" />


      {sessions.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-5xl mb-3">🗳️</p>
          <p>Aucun sondage actif pour le moment.</p>
        </div>
      )}

      {sessions.map((s, i) => {
        const count = participationCounts[s.id] || 0;
        const myP = userParticipations[s.id];
        const fmt = getFormat(s);
        const fmtLabel = fmt === 'combinaison' ? '🔗 Combo' : fmt === 'predefined_libre' ? '📋 Choix libres' : '📝 Simple';
        return (
          <motion.button key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            onClick={() => openDetail(s)}
            className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:bg-secondary/30 transition-all flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{s.title}</h3>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {count}</span>
                <span className="px-1.5 py-0.5 rounded-full bg-secondary text-[10px]">{fmtLabel}</span>
                <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]">🟢 En cours</span>
                {myP && <span className="flex items-center gap-0.5 text-primary"><CheckCircle className="w-3 h-3" /> Voté</span>}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </motion.button>
        );
      })}
      <ContactFooter />
    </div>
  );
}

// ═══════════════ SUB-COMPONENTS ═══════════════

function SimpleVoteForm({ options, selectedVote, setSelectedVote, pronostic, setPronostic, betAmount, setBetAmount, maxBet, submitting, myPart, onSubmit, format, onAddOption, newOptionText, setNewOptionText, addingFromPromo, setAddingFromPromo, promoNames }: {
  options: string[]; selectedVote: string; setSelectedVote: (v: string) => void;
  pronostic: string; setPronostic: (v: string) => void;
  betAmount: number; setBetAmount: (v: number) => void;
  maxBet: number; submitting: boolean; myPart: Participation | undefined;
  onSubmit: () => void; format: SondageFormat;
  onAddOption: (opt: string) => void;
  newOptionText: string; setNewOptionText: (v: string) => void;
  addingFromPromo: string; setAddingFromPromo: (v: string) => void;
  promoNames: string[];
}) {
  return (
    <div className="space-y-5">
      {/* Pronostic */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">🔮 Ton pronostic secret : quel choix sera le #1 ?</p>
        {options.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {options.map(opt => (
              <Button key={opt} size="sm" variant={pronostic === opt ? 'default' : 'outline'} onClick={() => setPronostic(opt)}>
                {opt}
              </Button>
            ))}
          </div>
        ) : (
          <Input placeholder="Tape ton pronostic..." value={pronostic} onChange={e => setPronostic(e.target.value)} />
        )}
      </div>

      {/* Vote */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">🗳️ Ton vote :</p>
        {options.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {options.map(opt => (
              <Button key={opt} size="sm" variant={selectedVote === opt ? 'default' : 'outline'} onClick={() => setSelectedVote(opt)}>
                {opt}
              </Button>
            ))}
          </div>
        ) : (
          <Input placeholder="Ton vote..." value={selectedVote} onChange={e => setSelectedVote(e.target.value)} />
        )}

        {/* Add option — for simple & predefined_libre */}
        <div className="border-t border-border pt-3 mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">➕ Ajouter un choix :</p>
          <div className="flex gap-2">
            <select className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={addingFromPromo} onChange={e => { setAddingFromPromo(e.target.value); if (e.target.value) onAddOption(e.target.value); }}>
              <option value="">Élève de la promo...</option>
              {promoNames.filter(n => !options.includes(n)).map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Ou tape un nom libre..." value={newOptionText} onChange={e => setNewOptionText(e.target.value)} className="flex-1" />
            <Button size="sm" variant="outline" disabled={!newOptionText.trim()} onClick={() => onAddOption(newOptionText)}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Bet */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">💰 Ta mise (max {maxBet} DC — 20 % de ton solde) :</p>
        <div className="flex items-center gap-3">
          <Slider value={[betAmount]} onValueChange={([v]) => setBetAmount(v)} min={1} max={Math.max(1, maxBet)} step={1} className="flex-1" />
          <span className="text-sm font-bold w-16 text-right">{betAmount} DC</span>
        </div>
      </div>

      <Button className="gold-gradient w-full" disabled={!selectedVote || !pronostic || betAmount < 1 || submitting} onClick={onSubmit}>
        {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
        {myPart ? '🔄 Modifier mon vote' : '✅ Valider mon vote'}
      </Button>

      {myPart && (
        <p className="text-xs text-primary flex items-center gap-1">
          <CheckCircle className="w-3 h-3" /> Tu as déjà voté. Tu peux modifier tant que le sondage est ouvert.
        </p>
      )}
    </div>
  );
}

function ComboVoteForm({ comboPrenom, setComboPrenom, comboMotif, setComboMotif, comboVoteOther, setComboVoteOther, pronosticFirst, setPronosticFirst, pronosticSecond, setPronosticSecond, betAmount, setBetAmount, maxBet, otherCombos, options, submitting, myPart, onSubmit, promoNames }: {
  comboPrenom: string; setComboPrenom: (v: string) => void;
  comboMotif: string; setComboMotif: (v: string) => void;
  comboVoteOther: string; setComboVoteOther: (v: string) => void;
  pronosticFirst: string; setPronosticFirst: (v: string) => void;
  pronosticSecond: string; setPronosticSecond: (v: string) => void;
  betAmount: number; setBetAmount: (v: number) => void;
  maxBet: number; otherCombos: string[]; options: string[];
  submitting: boolean; myPart: Participation | undefined;
  onSubmit: () => void;
  promoNames: string[];
}) {
  const myCombo = comboPrenom && comboMotif ? `${comboPrenom} — ${comboMotif}` : '';
  const allCombos = [...new Set([...options, ...otherCombos, myCombo].filter(Boolean))];

  return (
    <div className="space-y-5">
      {/* Step 1: Create combo */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">🔗 Crée ta combinaison (Élève + Motif) :</p>
        <div className="flex gap-2">
          <select className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={comboPrenom} onChange={e => setComboPrenom(e.target.value)}>
            <option value="">Élève...</option>
            {promoNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={comboMotif} onChange={e => setComboMotif(e.target.value)}>
            <option value="">Motif...</option>
            {COMBO_MOTIFS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {myCombo && <p className="text-xs text-primary">Ta combinaison : {myCombo} ✓ (vote automatique)</p>}
      </div>

      {/* Step 2: Vote for 1 other combo */}
      {otherCombos.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">🗳️ Vote pour 1 autre combinaison :</p>
          <div className="flex flex-wrap gap-2">
            {otherCombos.map(c => (
              <Button key={c} size="sm" variant={comboVoteOther === c ? 'default' : 'outline'} onClick={() => setComboVoteOther(c)}>
                {c}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Dual pronostic */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">🔮 Pronostic secret : qui sera #1 ET #2 ?</p>
        <div className="space-y-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">#1 (le plus voté) :</p>
            <div className="flex flex-wrap gap-2">
              {allCombos.map(c => (
                <Button key={c} size="sm" variant={pronosticFirst === c ? 'default' : 'outline'} onClick={() => setPronosticFirst(c)} className="text-xs">
                  {c}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">#2 (le deuxième plus voté) :</p>
            <div className="flex flex-wrap gap-2">
              {allCombos.filter(c => c !== pronosticFirst).map(c => (
                <Button key={c} size="sm" variant={pronosticSecond === c ? 'default' : 'outline'} onClick={() => setPronosticSecond(c)} className="text-xs">
                  {c}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bet */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">💰 Ta mise (max {maxBet} DC) :</p>
        <div className="flex items-center gap-3">
          <Slider value={[betAmount]} onValueChange={([v]) => setBetAmount(v)} min={1} max={Math.max(1, maxBet)} step={1} className="flex-1" />
          <span className="text-sm font-bold w-16 text-right">{betAmount} DC</span>
        </div>
      </div>

      <Button className="gold-gradient w-full"
        disabled={!myCombo || !pronosticFirst || !pronosticSecond || betAmount < 1 || submitting}
        onClick={onSubmit}>
        {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
        {myPart ? '🔄 Modifier' : '✅ Valider'}
      </Button>

      {myPart && <p className="text-xs text-primary flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Tu peux modifier tant que le sondage est ouvert.</p>}
    </div>
  );
}

function ResultsReveal({ results, revealStep, revealDone, startReveal, winnerOption, winnerOption2, myPart, config, format }: {
  results: any[]; revealStep: number; revealDone: boolean;
  startReveal: () => void; winnerOption: string; winnerOption2?: string;
  myPart: Participation | undefined; config: Record<string, any>;
  format: SondageFormat;
}) {
  // Stable shuffle: deterministic order based on option labels (hash) — must be before any early return
  const shuffled = useMemo(() => {
    const arr = [...results];
    const hash = (s: string) => {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return h;
    };
    arr.sort((a, b) => hash(String(a.option)) - hash(String(b.option)));
    return arr;
  }, [results.map((r: any) => r.option).join('|')]);
  const totalVotes = results.reduce((s, r) => s + (r.count || 0), 0) || 1;

  if (revealStep < 0) {
    return <Button onClick={startReveal} className="gold-gradient w-full">🎉 Révéler les résultats</Button>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Résultats :</p>
      {shuffled.map((r: any, i: number) => {
        const pct = Math.round((r.count / totalVotes) * 100);
        const isWinner = r.option === winnerOption;
        if (i > revealStep) return null;
        return (
          <motion.div key={r.option} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            className={`rounded-lg border p-3 ${isWinner && revealDone ? 'border-primary/60 bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]' : 'border-border bg-secondary/30'}`}>
            <div className="flex justify-between text-sm">
              <span className="font-semibold">{r.option}</span>
              <span className={isWinner && revealDone ? 'text-primary font-bold' : 'text-muted-foreground'}>{pct}%</span>
            </div>
          </motion.div>
        );
      })}

      {revealDone && myPart && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-2">
          <div className="text-sm space-y-1">
            {format === 'combinaison' ? (
              <>
                {myPart.data?.pronostic_first === winnerOption && myPart.data?.pronostic_second === winnerOption2 ? (
                  <p className="text-primary flex items-center gap-1"><Coins className="w-4 h-4" /> Pronostic #1 ET #2 corrects ! Bonus : {config?.bonus_per_user || 0} DC 🎉</p>
                ) : (
                  <p className="text-muted-foreground">Pronostic : #{myPart.data?.pronostic_first} / #{myPart.data?.pronostic_second} — pas les bons cette fois.</p>
                )}
              </>
            ) : (
              <>
                {myPart.data?.vote === winnerOption ? (
                  <p className="text-primary flex items-center gap-1"><Trophy className="w-4 h-4" /> Tu as voté pour le #1 ! Gain : {config?.winner_share || 0} DC</p>
                ) : (
                  <p className="text-muted-foreground">Tu as voté pour "{myPart.data?.vote}" — pas le #1 cette fois.</p>
                )}
                {myPart.data?.pronostic === winnerOption ? (
                  <p className="text-primary flex items-center gap-1"><Coins className="w-4 h-4" /> Pronostic correct ! Bonus : {config?.bonus_per_user || 0} DC</p>
                ) : (
                  <p className="text-muted-foreground">Ton pronostic "{myPart.data?.pronostic}" n'était pas le #1.</p>
                )}
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            <p>Pot total : {config?.total_pot || 0} DC • Part par gagnant : {config?.winner_share || 0} DC</p>
            <p>Bonus pronostic : {config?.bonus_per_user || 0} DC ({config?.pronostic_correct_count || 0} correct{(config?.pronostic_correct_count || 0) > 1 ? 's' : ''})</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
