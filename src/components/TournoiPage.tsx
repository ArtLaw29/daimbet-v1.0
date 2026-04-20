import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Users, Clock, CheckCircle, ChevronRight, Archive, Trophy, Loader2, Plus, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import type { Json } from '@/integrations/supabase/types';
import CoinRain from '@/components/CoinRain';
import ContactFooter from '@/components/ContactFooter';
import PendingProposalsSection from '@/components/PendingProposalsSection';
import ProposeNewDialog from '@/components/ProposeNewDialog';

interface TournoiSession {
  id: string;
  game_type: string;
  title: string;
  subtitle: string | null;
  status: string;
  config: Record<string, any>;
  created_at: string;
  closed_at: string | null;
  created_by: string | null;
}

interface Participation {
  id: string;
  session_id: string;
  user_id: string;
  data: Record<string, any>;
  created_at: string;
}

interface Duel {
  id: number;
  a: string | null;
  b: string | null;
  winner: string | null;
  votes: Record<string, string>; // { user_id: chosen_option }
}

interface Round {
  round: number;
  duels: Duel[];
  status: 'pending' | 'voting' | 'resolved';
}

type View = 'list' | 'detail' | 'archives' | 'propose';

export default function TournoiPage() {
  const { user, profile } = useAuth();
  const [sessions, setSessions] = useState<TournoiSession[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<TournoiSession[]>([]);
  const [participationCounts, setParticipationCounts] = useState<Record<string, number>>({});
  const [userParticipations, setUserParticipations] = useState<Record<string, Participation>>({});
  const [selectedSession, setSelectedSession] = useState<TournoiSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [showCoinRain, setShowCoinRain] = useState<number | null>(null);

  // Propose form
  const [propTitle, setPropTitle] = useState('');
  const [propOptions, setPropOptions] = useState('');

  // Bet form
  const [betPrediction, setBetPrediction] = useState('');
  const [betAmount, setBetAmount] = useState(10);
  const [submittingBet, setSubmittingBet] = useState(false);

  // Vote state
  const [submittingVote, setSubmittingVote] = useState(false);

  const fetchSessions = async () => {
    const [activeRes, archivedRes] = await Promise.all([
      supabase.from('game_sessions').select('*').eq('game_type', 'tournoi')
        .in('status', ['active', 'voting']).order('created_at', { ascending: false }),
      supabase.from('game_sessions').select('*').eq('game_type', 'tournoi')
        .in('status', ['closed', 'archived']).order('closed_at', { ascending: false }).limit(20),
    ]);
    const items = (activeRes.data || []) as TournoiSession[];
    setSessions(items);
    setArchivedSessions((archivedRes.data || []) as TournoiSession[]);

    if (items.length > 0) {
      const ids = items.map(s => s.id);
      const [countsRes, myRes] = await Promise.all([
        supabase.from('game_participations').select('session_id').in('session_id', ids),
        user ? supabase.from('game_participations').select('*').in('session_id', ids).eq('user_id', user.id) : null,
      ]);
      const counts: Record<string, number> = {};
      (countsRes.data || []).forEach(p => { counts[p.session_id] = (counts[p.session_id] || 0) + 1; });
      setParticipationCounts(counts);
      if (myRes?.data) {
        const map: Record<string, Participation> = {};
        (myRes.data as Participation[]).forEach(p => { map[p.session_id] = p; });
        setUserParticipations(map);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();
    const channel = supabase
      .channel('tournoi-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions' }, () => fetchSessions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_participations' }, () => fetchSessions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Refresh selected session when sessions update
  useEffect(() => {
    if (selectedSession) {
      const updated = [...sessions, ...archivedSessions].find(s => s.id === selectedSession.id);
      if (updated) setSelectedSession(updated);
    }
  }, [sessions, archivedSessions]);

  const rounds: Round[] = useMemo(() => {
    if (!selectedSession?.config?.rounds) return [];
    return (selectedSession.config.rounds as any[]).map(r => ({
      round: r.round,
      status: r.status || 'pending',
      duels: (r.duels || []).map((d: any) => ({
        id: d.id,
        a: d.a || null,
        b: d.b || null,
        winner: d.winner || null,
        votes: d.votes || {},
      })),
    }));
  }, [selectedSession]);

  const currentRound = useMemo(() => {
    return rounds.find(r => r.status === 'voting') || null;
  }, [rounds]);

  const options: string[] = useMemo(() => {
    if (!selectedSession?.config?.options) return [];
    return selectedSession.config.options as string[];
  }, [selectedSession]);

  const tournamentWinner = selectedSession?.config?.tournament_winner as string | null;
  const totalPot = selectedSession?.config?.total_pot as number | undefined;
  const myParticipation = selectedSession ? userParticipations[selectedSession.id] : null;
  const bettingOpen = selectedSession?.status === 'active' && !currentRound;

  const handlePlaceBet = async () => {
    if (!user || !selectedSession || !betPrediction) return;
    setSubmittingBet(true);
    const { data } = await supabase.rpc('place_tournoi_bet', {
      p_user_id: user.id,
      p_session_id: selectedSession.id,
      p_predicted_winner: betPrediction,
      p_bet_amount: betAmount,
    });
    setSubmittingBet(false);
    const result = data as any;
    if (result?.error) { toast.error(result.error); return; }
    toast.success('Pronostic enregistré ! 🎯');
    fetchSessions();
  };

  const handleVote = async (duelId: number, choice: string) => {
    if (!user || !selectedSession || !currentRound) return;
    setSubmittingVote(true);

    // Store vote in config via an edge function or direct update
    // We'll update the session config directly via a custom approach
    const updatedRounds = rounds.map(r => {
      if (r.round !== currentRound.round) return r;
      return {
        ...r,
        duels: r.duels.map(d => {
          if (d.id !== duelId) return d;
          return { ...d, votes: { ...d.votes, [user.id]: choice } };
        }),
      };
    });

    const { error } = await supabase.from('game_sessions').update({
      config: { ...selectedSession.config, rounds: updatedRounds } as unknown as Json,
    }).eq('id', selectedSession.id);

    setSubmittingVote(false);
    if (error) { toast.error('Erreur lors du vote'); return; }
    toast.success('Vote enregistré ! ⚔️');
    fetchSessions();
  };

  const proposeTournoi = async () => {
    if (!user || !propTitle.trim()) return;
    const config: Record<string, any> = {};
    if (propOptions.trim()) {
      config.options = propOptions.split('\n').map(o => o.trim()).filter(Boolean);
    }
    const { error } = await supabase.from('game_sessions').insert([{
      game_type: 'tournoi' as any,
      title: propTitle.trim(),
      status: 'active' as any,
      config,
      created_by: user.id,
    }] as any);
    if (error) { toast.error('Erreur'); return; }
    // Gazette
    await supabase.from('gazette_messages').insert({
      content: `⚔️ Nouveau tournoi : "${propTitle.trim()}" — Venez voter !`,
      is_system_message: true,
    } as any);
    toast.success('Tournoi proposé ! ⚔️');
    setPropTitle('');
    setPropOptions('');
    setView('list');
    fetchSessions();
  };

  // ── Helpers ──
  const getDuelVoteCount = (duel: Duel, option: string) => {
    return Object.values(duel.votes).filter(v => v === option).length;
  };
  const getTotalDuelVotes = (duel: Duel) => Object.keys(duel.votes).length;
  const userVotedInDuel = (duel: Duel) => user ? !!duel.votes[user.id] : false;

  // ── RENDER ──
  if (loading) return <div className="text-center py-12 text-muted-foreground">Chargement...</div>;

  // ── PROPOSE VIEW ──
  if (view === 'propose') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('list')} className="text-sm text-primary hover:underline">← Retour</button>
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-display text-lg">Proposer un tournoi ⚔️</h3>
          <Input placeholder="Thème / Question du tournoi" value={propTitle} onChange={e => setPropTitle(e.target.value)} />
          <Textarea placeholder="Choix (un par ligne, optionnel)" value={propOptions} onChange={e => setPropOptions(e.target.value)} rows={4} />
          <Button className="gold-gradient" disabled={!propTitle.trim()} onClick={proposeTournoi}>Publier le tournoi 🚀</Button>
        </div>
      </div>
    );
  }

  // ── ARCHIVES VIEW ──
  if (view === 'archives') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('list')} className="text-sm text-primary hover:underline">← Retour</button>
        <h2 className="text-xl font-display text-center">📁 Archives des tournois</h2>
        {archivedSessions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Aucun tournoi archivé.</p>
        ) : archivedSessions.map(session => (
          <button key={session.id} onClick={() => { setSelectedSession(session); setView('detail'); }}
            className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-all flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{session.title}</h3>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {session.config?.tournament_winner && (
                  <span className="flex items-center gap-1 text-primary"><Trophy className="w-3 h-3" /> {session.config.tournament_winner as string}</span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (view === 'detail' && selectedSession) {
    const config = selectedSession.config;
    const isClosed = selectedSession.status === 'closed' || selectedSession.status === 'archived';
    const myPrediction = myParticipation?.data?.predicted_winner as string | undefined;
    const myBetAmt = myParticipation?.data?.bet_amount as number | undefined;
    const wonBet = isClosed && tournamentWinner && myPrediction === tournamentWinner;

    return (
      <div className="space-y-4">
        {showCoinRain !== null && <CoinRain amount={showCoinRain} onComplete={() => setShowCoinRain(null)} />}
        <button onClick={() => { setSelectedSession(null); setView('list'); }} className="text-sm text-primary hover:underline">
          ← Retour aux tournois
        </button>

        <div className="rounded-xl border border-border bg-card p-5 card-glow space-y-4">
          <h2 className="text-xl font-display">{selectedSession.title}</h2>
          {selectedSession.subtitle && <p className="text-sm text-muted-foreground">{selectedSession.subtitle}</p>}
          {config?.description && <p className="text-sm">{String(config.description)}</p>}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {participationCounts[selectedSession.id] || 0} participant(s)</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {isClosed ? 'Terminé' : currentRound ? `Tour ${currentRound.round}` : 'Phase de mise'}
            </span>
          </div>

          {/* Winner banner */}
          {isClosed && tournamentWinner && (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="rounded-xl bg-primary/10 border border-primary/30 p-4 text-center space-y-2">
              <Trophy className="w-8 h-8 text-primary mx-auto" />
              <p className="text-lg font-display text-primary">🏆 {tournamentWinner}</p>
              <p className="text-xs text-muted-foreground">Vainqueur du tournoi</p>
              {totalPot !== undefined && <p className="text-xs">Pot total : {totalPot} DC</p>}
              {wonBet && (
                <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}
                  className="text-primary font-semibold text-sm">
                  🎉 Ton pronostic était correct ! +{config?.winner_share || 0} DC
                </motion.p>
              )}
            </motion.div>
          )}

          {/* My prediction display */}
          {myPrediction && (
            <div className="rounded-lg bg-secondary/50 border border-border p-3 text-sm">
              <p className="font-semibold">🎯 Ton pronostic : {myPrediction}</p>
              {myBetAmt && <p className="text-xs text-muted-foreground">Mise : {myBetAmt} DC</p>}
            </div>
          )}

          {/* Betting phase */}
          {bettingOpen && !isClosed && options.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="font-semibold text-sm">🎯 Ton pronostic du tournoi</h3>
              <p className="text-xs text-muted-foreground">Qui va gagner le tournoi ? Mise entre 10 DC et 10% de ton solde.</p>
              <div className="flex flex-wrap gap-2">
                {options.map(opt => (
                  <Button key={opt} size="sm" variant={betPrediction === opt ? 'default' : 'outline'}
                    onClick={() => setBetPrediction(opt)}>
                    {opt}
                  </Button>
                ))}
              </div>
              {betPrediction && profile && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Mise : {betAmount} DC (max {Math.floor(profile.balance * 0.1)} DC)
                  </p>
                  <Slider min={10} max={Math.max(10, Math.floor(profile.balance * 0.1))}
                    step={1} value={[betAmount]} onValueChange={v => setBetAmount(v[0])} />
                  <Button className="gold-gradient" disabled={submittingBet} onClick={handlePlaceBet}>
                    {submittingBet ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Valider mon pronostic 🎯'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* BRACKET */}
          {rounds.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="font-semibold text-sm mb-3">📊 Bracket du tournoi</h3>
              <div className="overflow-x-auto pb-4">
                <div className="flex gap-6 min-w-max">
                  {rounds.map((round, ri) => (
                    <div key={round.round} className="flex flex-col gap-4 min-w-[200px]">
                      <p className="text-xs font-semibold text-center text-muted-foreground">
                        {ri === rounds.length - 1 ? '🏆 Finale' : `Tour ${round.round}`}
                      </p>
                      {round.duels.map(duel => {
                        const isVoting = round.status === 'voting';
                        const hasVoted = userVotedInDuel(duel);
                        const totalVotes = getTotalDuelVotes(duel);
                        const isBye = !duel.b;
                        const myVote = user ? duel.votes[user.id] : null;

                        return (
                          <div key={duel.id}
                            className={`rounded-lg border p-3 space-y-2 transition-all ${
                              duel.winner ? 'border-primary/30 bg-primary/5' :
                              isVoting ? 'border-primary/50 bg-card shadow-md' :
                              'border-border bg-muted/30'
                            }`}>
                            {isBye ? (
                              <div className="text-center">
                                <p className="font-semibold text-sm">{duel.a}</p>
                                <p className="text-[10px] text-muted-foreground italic">Qualifié d'office</p>
                              </div>
                            ) : (
                              <>
                                {/* Option A */}
                                <DuelOption
                                  label={duel.a || '?'}
                                  isWinner={duel.winner === duel.a}
                                  isVoting={isVoting && !hasVoted && !duel.winner}
                                  isSelected={myVote === duel.a}
                                  showResults={hasVoted || !!duel.winner}
                                  votes={getDuelVoteCount(duel, duel.a!)}
                                  total={totalVotes}
                                  onVote={() => handleVote(duel.id, duel.a!)}
                                  disabled={submittingVote}
                                />
                                <div className="text-center text-[10px] text-muted-foreground font-bold">VS</div>
                                {/* Option B */}
                                <DuelOption
                                  label={duel.b || '?'}
                                  isWinner={duel.winner === duel.b}
                                  isVoting={isVoting && !hasVoted && !duel.winner}
                                  isSelected={myVote === duel.b}
                                  showResults={hasVoted || !!duel.winner}
                                  votes={getDuelVoteCount(duel, duel.b!)}
                                  total={totalVotes}
                                  onVote={() => handleVote(duel.id, duel.b!)}
                                  disabled={submittingVote}
                                />
                              </>
                            )}
                            {/* Connector line hint */}
                            {duel.winner && (
                              <p className="text-[10px] text-primary text-center font-semibold">
                                ✓ {duel.winner}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* No bracket yet */}
          {rounds.length === 0 && options.length > 0 && !isClosed && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Swords className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Le bracket sera généré quand l'admin lancera le premier tour.</p>
              <p className="text-xs mt-1">{options.length} choix inscrits</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <p className="text-4xl">⚔️</p>
        <h2 className="text-xl font-display mt-1">You Decide — Tournois</h2>
        <p className="text-xs text-muted-foreground max-w-md mx-auto mt-2">
          Bienvenue dans You Decide — Tournois ! Les choix s'affrontent en duels successifs façon coupe du monde.
          Vote pour ton favori à chaque duel et parie sur le vainqueur final pour gagner des DAIMcoins !
        </p>
      </div>

      <div className="flex justify-center gap-2 mb-4 flex-wrap">
        <ProposeNewDialog kind="tournoi" onSubmitted={fetchSessions} buttonLabel="Proposer un tournoi" />
        <Button size="sm" variant="outline" onClick={() => setView('archives')}>
          <Archive className="w-3 h-3 mr-1" /> Archives
        </Button>
      </div>

      <PendingProposalsSection kind="tournoi" />


      {sessions.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-5xl">⚔️</p>
          <p className="text-muted-foreground text-sm">Aucun tournoi actif. Revenez bientôt ! 🦌</p>
        </div>
      ) : (
        sessions.map((session, i) => {
          const count = participationCounts[session.id] || 0;
          const hasBet = !!userParticipations[session.id];
          const cr = (session.config?.rounds as any[])?.find((r: any) => r.status === 'voting');
          return (
            <motion.button key={session.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => { setSelectedSession(session); setView('detail'); }}
              className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:bg-secondary/30 transition-all flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{session.title}</h3>
                {session.subtitle && <p className="text-xs text-muted-foreground truncate">{session.subtitle}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {count}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    cr ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {cr ? `⚔️ Tour ${cr.round}` : '🎯 Phase de mise'}
                  </span>
                  {hasBet && <span className="flex items-center gap-0.5 text-primary"><CheckCircle className="w-3 h-3" /> Pronostic</span>}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </motion.button>
          );
        })
      )}
      <ContactFooter />
    </div>
  );
}

// ── Duel Option Component ──
function DuelOption({ label, isWinner, isVoting, isSelected, showResults, votes, total, onVote, disabled }: {
  label: string;
  isWinner: boolean;
  isVoting: boolean;
  isSelected: boolean;
  showResults: boolean;
  votes: number;
  total: number;
  onVote: () => void;
  disabled: boolean;
}) {
  const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
  return (
    <div className={`relative rounded-lg px-3 py-2 text-sm transition-all ${
      isWinner ? 'bg-primary/20 border border-primary/40 font-semibold' :
      isSelected ? 'bg-primary/10 border border-primary/30' :
      'bg-secondary/50 border border-transparent'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        {isVoting && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onVote} disabled={disabled}>
            Voter
          </Button>
        )}
        {isWinner && <Trophy className="w-3 h-3 text-primary flex-shrink-0" />}
      </div>
      {showResults && total > 0 && (
        <div className="mt-1">
          <Progress value={pct} className="h-1.5" />
          <p className="text-[10px] text-muted-foreground mt-0.5">{votes} vote{votes > 1 ? 's' : ''} ({pct}%)</p>
        </div>
      )}
    </div>
  );
}
