import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Users, Clock, CheckCircle, ChevronRight, Archive, ArrowLeft, Trophy, Coins, Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import type { Json } from '@/integrations/supabase/types';
import CoinRain from '@/components/CoinRain';

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

export default function SondagePage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SondageSession[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<SondageSession[]>([]);
  const [participationCounts, setParticipationCounts] = useState<Record<string, number>>({});
  const [userParticipations, setUserParticipations] = useState<Record<string, Participation>>({});
  const [selectedSession, setSelectedSession] = useState<SondageSession | null>(null);
  const [view, setView] = useState<View>('list');
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);

  // Vote form state
  const [selectedVote, setSelectedVote] = useState('');
  const [pronostic, setPronostic] = useState('');
  const [betAmount, setBetAmount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showCoinRain, setShowCoinRain] = useState(false);

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
      const [countsRes, myRes] = await Promise.all([
        supabase.from('game_participations').select('session_id').in('session_id', allIds),
        user ? supabase.from('game_participations').select('*').in('session_id', allIds).eq('user_id', user.id) : Promise.resolve({ data: [] }),
      ]);
      const counts: Record<string, number> = {};
      (countsRes.data || []).forEach((p: any) => { counts[p.session_id] = (counts[p.session_id] || 0) + 1; });
      setParticipationCounts(counts);
      const uMap: Record<string, Participation> = {};
      ((myRes as any).data || []).forEach((p: any) => { uMap[p.session_id] = p; });
      setUserParticipations(uMap);
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

  const openDetail = (s: SondageSession) => {
    setSelectedSession(s);
    setView('detail');
    setRevealStep(-1);
    setRevealDone(false);
    const existing = userParticipations[s.id];
    if (existing) {
      setSelectedVote(existing.data?.vote || '');
      setPronostic(existing.data?.pronostic || '');
      setBetAmount(existing.data?.bet_amount || 1);
    } else {
      setSelectedVote('');
      setPronostic('');
      setBetAmount(1);
    }
  };

  const maxBet = useMemo(() => {
    if (!selectedSession) return 0;
    const existing = userParticipations[selectedSession.id];
    const effectiveBal = balance + (existing?.data?.bet_amount || 0);
    return Math.floor(effectiveBal * 0.20);
  }, [balance, selectedSession, userParticipations]);


  const submitVote = async () => {
    if (!user || !selectedSession || !selectedVote || !pronostic || betAmount < 1) return;
    setSubmitting(true);
    const { data } = await supabase.rpc('place_sondage_vote', {
      p_user_id: user.id,
      p_session_id: selectedSession.id,
      p_vote: selectedVote,
      p_pronostic: pronostic,
      p_bet_amount: betAmount,
    });
    setSubmitting(false);
    const result = data as any;
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(userParticipations[selectedSession.id] ? 'Vote modifié ! 🔄' : 'Vote enregistré ! 🎉');
    fetchSessions();
  };

  const proposeSession = async () => {
    if (!user || !proposeTitle.trim()) return;
    const config: Record<string, unknown> = {};
    if (proposeOptions.trim()) {
      config.options = proposeOptions.split('\n').map(o => o.trim()).filter(Boolean);
    }
    if (proposeEndDate) config.end_date = new Date(proposeEndDate).toISOString();

    const { error } = await supabase.from('game_sessions').insert([{
      game_type: 'sondage' as any,
      title: proposeTitle.trim(),
      status: 'active' as any,
      config: config as Json,
      created_by: user.id,
    }] as any);

    if (error) {
      toast.error('Erreur lors de la création');
      return;
    }

    // Gazette
    await supabase.from('gazette_messages').insert({
      content: `🗳️ Nouveau sondage : "${proposeTitle.trim()}" — Venez voter !`,
      is_system_message: true,
    });

    toast.success('Sondage publié ! 🎉');
    setProposeTitle('');
    setProposeOptions('');
    setProposeEndDate('');
    setShowPropose(false);
    fetchSessions();
  };

  // Reveal animation for closed sondage
  const startReveal = () => {
    if (!selectedSession) return;
    const results = selectedSession.config?.results as any[];
    if (!results || results.length === 0) return;
    // Reveal from weakest to strongest (results already sorted DESC, so reverse)
    const reversed = [...results].reverse();
    let step = 0;
    setRevealStep(0);
    const interval = setInterval(() => {
      step++;
      if (step >= reversed.length) {
        clearInterval(interval);
        setRevealDone(true);
        // Check if user won
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

  // DETAIL VIEW
  if (view === 'detail' && selectedSession) {
    const config = selectedSession.config;
    const options = (config?.options as string[]) || [];
    const count = participationCounts[selectedSession.id] || 0;
    const myPart = userParticipations[selectedSession.id];
    const isOpen = selectedSession.status === 'active' || selectedSession.status === 'voting';
    const isClosed = selectedSession.status === 'closed' || selectedSession.status === 'archived';
    const results = (config?.results as any[]) || [];
    const winnerOption = config?.winner_option as string;

    // Check if voting window still open (20 min before end)
    const endDate = config?.end_date ? new Date(config.end_date as string) : null;
    const now = new Date();
    const votingClosed = endDate ? now > new Date(endDate.getTime() - 20 * 60000) : false;

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
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
            <div className="space-y-3">
              {revealStep < 0 ? (
                <Button onClick={startReveal} className="gold-gradient w-full">
                  🎉 Révéler les résultats
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Résultats :</p>
                  {[...results].reverse().map((r: any, i: number) => {
                    const maxCount = results[0]?.count || 1;
                    const pct = Math.round((r.count / maxCount) * 100);
                    const isWinner = r.option === winnerOption;
                    const visible = i <= revealStep;
                    if (!visible) return null;
                    return (
                      <motion.div
                        key={r.option}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`rounded-lg border p-3 ${isWinner && revealDone ? 'border-primary bg-primary/10 animate-pulse' : 'border-border bg-secondary/30'}`}
                      >
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-semibold">{isWinner && revealDone ? '🏆 ' : ''}{r.option}</span>
                          <span className="text-muted-foreground">{r.count} vote{r.count > 1 ? 's' : ''}</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </motion.div>
                    );
                  })}
                  {revealDone && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-2">
                      {myPart && (
                        <div className="text-sm space-y-1">
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
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-2">
                        <p>Pot total : {config?.total_pot || 0} DC • Part par gagnant : {config?.winner_share || 0} DC</p>
                        <p>Bonus pronostic : {config?.bonus_per_user || 0} DC ({config?.pronostic_correct_count || 0} pronostic{(config?.pronostic_correct_count || 0) > 1 ? 's' : ''} correct{(config?.pronostic_correct_count || 0) > 1 ? 's' : ''})</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* OPEN — Voting */}
          {isOpen && (
            <>
              {votingClosed ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Lock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Les votes sont fermés (20 min avant la fin)</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Step 1: Pronostic */}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">🔮 Ton pronostic secret : quel choix sera le #1 ?</p>
                    {options.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {options.map(opt => (
                          <Button key={opt} size="sm"
                            variant={pronostic === opt ? 'default' : 'outline'}
                            onClick={() => setPronostic(opt)}>
                            {opt}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <Input placeholder="Tape ton pronostic..." value={pronostic} onChange={e => setPronostic(e.target.value)} />
                    )}
                  </div>

                  {/* Step 2: Vote */}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">🗳️ Ton vote :</p>
                    {options.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {options.map(opt => (
                          <Button key={opt} size="sm"
                            variant={selectedVote === opt ? 'default' : 'outline'}
                            onClick={() => setSelectedVote(opt)}>
                            {opt}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <Input placeholder="Ton vote..." value={selectedVote} onChange={e => setSelectedVote(e.target.value)} />
                    )}
                  </div>

                  {/* Step 3: Bet */}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">💰 Ta mise (max {maxBet} DC — 20% de ton solde) :</p>
                    <div className="flex items-center gap-3">
                      <Slider
                        value={[betAmount]}
                        onValueChange={([v]) => setBetAmount(v)}
                        min={1}
                        max={Math.max(1, maxBet)}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-sm font-bold w-16 text-right">{betAmount} DC</span>
                    </div>
                  </div>

                  <Button
                    className="gold-gradient w-full"
                    disabled={!selectedVote || !pronostic || betAmount < 1 || submitting}
                    onClick={submitVote}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    {myPart ? '🔄 Modifier mon vote' : '✅ Valider mon vote'}
                  </Button>

                  {myPart && (
                    <p className="text-xs text-primary flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Tu as déjà voté. Tu peux modifier tant que le sondage est ouvert.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ARCHIVES VIEW
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
            <motion.button
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => openDetail(s)}
              className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-all flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{s.title}</h3>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span><Users className="w-3 h-3 inline" /> {participationCounts[s.id] || 0}</span>
                  <span>🏆 {(s.config?.winner_option as string) || '—'}</span>
                  {s.closed_at && <span>{new Date(s.closed_at).toLocaleDateString('fr-FR')}</span>}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </motion.button>
          ))
        )}
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <p className="text-4xl">🗳️</p>
        <h2 className="text-xl font-display mt-1">Daimocratie — Sondages</h2>
        <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">
          Bienvenue dans Daimocratie — Sondages ! Réponds aux sondages proposés et parie des DaimCoins sur l'option que tu penses être la plus populaire. Si ton pronostic secret est le bon, tu recevras un bonus de DaimCoins !
        </p>
      </div>

      <div className="flex justify-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setView('archives')}>
          <Archive className="w-3 h-3 mr-1" /> Archives
        </Button>
        <Button size="sm" className="gold-gradient" onClick={() => setShowPropose(!showPropose)}>
          + Proposer un sondage
        </Button>
      </div>

      {showPropose && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <p className="text-sm font-semibold">Proposer un sondage</p>
          <Input placeholder="Question du sondage" value={proposeTitle} onChange={e => setProposeTitle(e.target.value)} />
          <Textarea placeholder="Options (une par ligne)" value={proposeOptions} onChange={e => setProposeOptions(e.target.value)} rows={3} />
          <Input type="datetime-local" value={proposeEndDate} onChange={e => setProposeEndDate(e.target.value)} />
          <Button className="gold-gradient" disabled={!proposeTitle.trim()} onClick={proposeSession}>Publier 🚀</Button>
        </div>
      )}

      {sessions.length === 0 && !showPropose && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-5xl mb-3">🗳️</p>
          <p>Aucun sondage actif pour le moment.</p>
        </div>
      )}

      {sessions.map((s, i) => {
        const count = participationCounts[s.id] || 0;
        const myPart = userParticipations[s.id];
        return (
          <motion.button
            key={s.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => openDetail(s)}
            className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:bg-secondary/30 transition-all flex items-center gap-4"
          >
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{s.title}</h3>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {count}</span>
                <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px]">🟢 En cours</span>
                {myPart && (
                  <span className="flex items-center gap-0.5 text-primary"><CheckCircle className="w-3 h-3" /> Voté</span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </motion.button>
        );
      })}
    </div>
  );
}
