import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Flag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useBeforeUnloadGame } from '@/hooks/useBeforeUnloadGame';

const KB_ROWS = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];
const MAX_ERRORS = 7;
const INACTIVITY_MS = 5 * 60 * 1000;

function HangmanSVG({ errors }: { errors: number }) {
  return (
    <svg viewBox="0 0 200 220" className="w-40 h-44 mx-auto">
      <line x1="20" y1="210" x2="120" y2="210" stroke="hsl(var(--foreground))" strokeWidth="3" />
      <line x1="50" y1="210" x2="50" y2="20" stroke="hsl(var(--foreground))" strokeWidth="3" />
      <line x1="50" y1="20" x2="130" y2="20" stroke="hsl(var(--foreground))" strokeWidth="3" />
      {errors >= 1 && <line x1="130" y1="20" x2="130" y2="50" stroke="hsl(var(--foreground))" strokeWidth="3" />}
      {errors >= 2 && <circle cx="130" cy="65" r="15" stroke="hsl(var(--foreground))" strokeWidth="3" fill="none" />}
      {errors >= 3 && <line x1="130" y1="80" x2="130" y2="140" stroke="hsl(var(--foreground))" strokeWidth="3" />}
      {errors >= 4 && <line x1="130" y1="95" x2="105" y2="120" stroke="hsl(var(--foreground))" strokeWidth="3" />}
      {errors >= 5 && <line x1="130" y1="95" x2="155" y2="120" stroke="hsl(var(--foreground))" strokeWidth="3" />}
      {errors >= 6 && <line x1="130" y1="140" x2="110" y2="170" stroke="hsl(var(--foreground))" strokeWidth="3" />}
      {errors >= 7 && <line x1="130" y1="140" x2="150" y2="170" stroke="hsl(var(--foreground))" strokeWidth="3" />}
    </svg>
  );
}

export default function PenduPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [wordInput, setWordInput] = useState('');
  const [opponentOnline, setOpponentOnline] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const channelRef = useRef<any>(null);

  useBeforeUnloadGame(!!session && session.status === 'en_cours');

  const isP1 = user?.id === session?.player1_id;
  const opponentId = isP1 ? session?.player2_id : session?.player1_id;
  const state = session?.game_state || {};
  const phase: string = state.phase || 'word_setup';
  const word: string = (state.word || '').toUpperCase();
  const guessed: string[] = state.guessed_letters || [];
  const wrong: string[] = state.wrong_letters || [];
  const errors = wrong.length;

  // Load + subscribe
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const { data } = await supabase.from('games_sessions').select('*').eq('id', sessionId).maybeSingle();
      setSession(data);
      setLoading(false);
    })();

    const ch = supabase.channel(`pendu-${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games_sessions', filter: `id=eq.${sessionId}` },
        (payload) => setSession(payload.new))
      .on('presence', { event: 'sync' }, () => {
        const st = ch.presenceState() as any;
        const others = Object.values(st).flat().filter((p: any) => p.user_id && p.user_id !== user?.id);
        setOpponentOnline(others.length > 0);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && user) await ch.track({ user_id: user.id, online_at: new Date().toISOString() });
      });
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, user?.id]);

  const updateState = async (patch: any) => {
    const newState = { ...state, ...patch, last_action_at: Date.now() / 1000 };
    await supabase.from('games_sessions').update({ game_state: newState, updated_at: new Date().toISOString() }).eq('id', sessionId);
  };

  const submitWord = async () => {
    const w = wordInput.trim().toUpperCase();
    if (w.length < 4 || w.length > 12 || !/^[A-Z]+$/.test(w)) return toast.error('Mot de 4 à 12 lettres (A-Z)');
    await updateState({ word: w, phase: 'playing' });
  };

  const guessLetter = async (l: string) => {
    if (phase !== 'playing' || !isP1 === false || isP1) return; // Only J2 guesses
    if (guessed.includes(l) || wrong.includes(l)) return;
    // Letters at position 0 and word.length-1 stay masked, so we only consider middle letters for the win check
    const middle = word.slice(1, -1);
    if (word.includes(l)) {
      const newGuessed = [...guessed, l];
      const allFound = middle.split('').every((c) => newGuessed.includes(c));
      await updateState({ guessed_letters: newGuessed });
      if (allFound) {
        await supabase.rpc('finish_duel', { p_session_id: sessionId, p_winner_id: user!.id });
        await refreshProfile();
        toast.success('🏆 Tu as gagné !');
      }
    } else {
      const newWrong = [...wrong, l];
      await updateState({ wrong_letters: newWrong });
      if (newWrong.length >= MAX_ERRORS) {
        await supabase.rpc('finish_duel', { p_session_id: sessionId, p_winner_id: session.player1_id });
        await refreshProfile();
        toast.error('💀 Pendu ! Tu as perdu.');
      }
    }
  };

  const forfeit = async () => {
    setConfirmForfeit(false);
    await supabase.rpc('finish_duel', { p_session_id: sessionId, p_winner_id: opponentId });
    await refreshProfile();
    toast.error('Forfait déclaré');
  };

  // Inactivity timeout
  useEffect(() => {
    if (!session || session.status === 'termine') return;
    const lastAction = (state.last_action_at || 0) * 1000;
    if (!lastAction) return;
    const t = setInterval(async () => {
      if (Date.now() - lastAction > INACTIVITY_MS) {
        // The opponent gets the win if they are the one waiting
        // J1 waits during playing phase; J2 waits during word_setup
        const inactivePlayer = phase === 'word_setup' ? session.player1_id : session.player2_id;
        if (user?.id !== inactivePlayer) {
          await supabase.rpc('finish_duel', { p_session_id: sessionId, p_winner_id: user!.id });
          await refreshProfile();
          toast.success('Victoire par inactivité');
        }
      }
    }, 10000);
    return () => clearInterval(t);
  }, [session, state.last_action_at, phase, user?.id, sessionId, refreshProfile]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement…</div>;
  if (!session) return <div className="p-8 text-center text-muted-foreground">Session introuvable</div>;
  if (!user || (user.id !== session.player1_id && user.id !== session.player2_id)) {
    return <div className="p-8 text-center text-muted-foreground">Tu ne participes pas à ce duel.</div>;
  }

  const display = phase === 'playing'
    ? word.split('').map((c, i) => {
        if (i === 0 || i === word.length - 1) return '_';
        return guessed.includes(c) ? c : '_';
      }).join(' ')
    : '';

  const isFinished = session.status === 'termine';
  const winnerIsMe = session.winner_id === user.id;

  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6 max-w-md">
      <button onClick={() => navigate('/jeux/duels')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" /> Retour aux duels
      </button>
      <div className="text-center mb-4">
        <h1 className="text-3xl font-display gold-text">🪢 Pendu</h1>
        <p className="text-xs text-muted-foreground mt-1">Mise : {session.mise_player1 + session.mise_player2} DC · Pot total</p>
        <div className="flex items-center justify-center gap-2 mt-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${opponentOnline ? 'bg-success' : 'bg-destructive'}`}></span>
          <span className="text-muted-foreground">Adversaire {opponentOnline ? 'en ligne' : 'hors ligne'}</span>
        </div>
      </div>

      {isFinished ? (
        <Card className={`p-6 text-center ${winnerIsMe ? 'border-success' : 'border-destructive'}`}>
          <p className="text-5xl mb-2">{winnerIsMe ? '🏆' : session.winner_id ? '💀' : '🤝'}</p>
          <p className="font-display text-xl">
            {winnerIsMe ? `Victoire ! +${session.mise_player1 + session.mise_player2} DC` :
             session.winner_id ? 'Défaite' : 'Match nul'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Mot : <b>{word}</b></p>
        </Card>
      ) : phase === 'word_setup' ? (
        isP1 ? (
          <Card className="p-5 space-y-3">
            <p className="text-sm text-center">Choisis le mot que ton adversaire devra deviner</p>
            <Input value={wordInput} onChange={(e) => setWordInput(e.target.value.toUpperCase())} placeholder="Mot de 4 à 12 lettres"
              maxLength={12} className="uppercase font-mono text-lg tracking-widest text-center" />
            <Button onClick={submitWord} className="w-full">Valider le mot</Button>
          </Card>
        ) : (
          <Card className="p-5 text-center">
            <p className="text-4xl mb-2">⏳</p>
            <p className="text-sm">En attente du mot choisi par ton adversaire…</p>
          </Card>
        )
      ) : (
        <>
          <HangmanSVG errors={errors} />
          <p className="text-3xl font-mono tracking-widest text-center my-4 gold-text">{display}</p>
          <p className="text-xs text-center text-muted-foreground mb-4">
            Erreurs : {errors}/{MAX_ERRORS} · Lettres ratées : {wrong.join(' ') || '—'}
          </p>
          {!isP1 ? (
            <div className="space-y-1.5">
              {KB_ROWS.map((row, ri) => (
                <div key={ri} className="flex gap-1 justify-center">
                  {row.split('').map((l) => {
                    const used = guessed.includes(l) || wrong.includes(l);
                    return (
                      <button key={l} onClick={() => guessLetter(l)} disabled={used}
                        className={`flex-1 h-11 rounded-md text-sm font-semibold transition ${
                          guessed.includes(l) ? 'bg-success text-success-foreground' :
                          wrong.includes(l) ? 'bg-destructive/40 text-muted-foreground' :
                          'bg-card border border-border hover:bg-secondary'
                        }`}>{l}</button>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">En attente des propositions de l'adversaire…</p>
          )}
        </>
      )}

      {!isFinished && (
        <Button variant="outline" className="w-full mt-6" onClick={() => setConfirmForfeit(true)}>
          <Flag className="w-4 h-4 mr-2" /> Forfait
        </Button>
      )}

      <Dialog open={confirmForfeit} onOpenChange={setConfirmForfeit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer le forfait ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Ton adversaire remportera le pot ({session.mise_player1 + session.mise_player2} DC).</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmForfeit(false)}>Annuler</Button>
            <Button variant="destructive" onClick={forfeit}>Déclarer forfait</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}