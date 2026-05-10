import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Coins, Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const ROWS = 6;
const COLS = 5;
const KB_ROWS = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];

type LetterState = 'correct' | 'present' | 'absent' | 'empty';

function evaluate(guess: string, target: string): LetterState[] {
  const res: LetterState[] = Array(COLS).fill('absent');
  const tArr = target.split('');
  const gArr = guess.split('');
  const used = Array(COLS).fill(false);
  for (let i = 0; i < COLS; i++) {
    if (gArr[i] === tArr[i]) { res[i] = 'correct'; used[i] = true; }
  }
  for (let i = 0; i < COLS; i++) {
    if (res[i] === 'correct') continue;
    for (let j = 0; j < COLS; j++) {
      if (!used[j] && gArr[i] === tArr[j]) { res[i] = 'present'; used[j] = true; break; }
    }
  }
  return res;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function WordlePage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<any>(null);
  const [target, setTarget] = useState<string>('');
  const [rewards, setRewards] = useState<number[]>([]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [finished, setFinished] = useState<'won' | 'lost' | null>(null);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [scores, setScores] = useState<any[]>([]);
  const [startedAt] = useState<number>(Date.now());

  // Load today's content + check if already played
  useEffect(() => {
    (async () => {
      const { data: dc } = await supabase
        .from('daily_content')
        .select('*')
        .eq('type', 'wordle')
        .eq('scheduled_date', todayStr())
        .eq('status', 'actif')
        .maybeSingle();
      if (!dc) { setLoading(false); return; }
      setContent(dc);
      const data = dc.data as any;
      setTarget(String(data.word || '').toUpperCase());
      setRewards(Array.isArray(data.rewards) ? data.rewards : []);
      if (user) {
        const { data: existing } = await supabase
          .from('daily_scores').select('*')
          .eq('content_id', dc.id).eq('user_id', user.id).maybeSingle();
        if (existing) setAlreadyPlayed(true);
      }
      await loadScores(dc.id);
      setLoading(false);
    })();
  }, [user]);

  const loadScores = async (contentId: string) => {
    const { data } = await supabase
      .from('daily_scores')
      .select('*, profiles!inner(display_name, emoji)')
      .eq('content_id', contentId)
      .order('finished_at', { ascending: true })
      .limit(20);
    setScores(data || []);
  };

  const submitGuess = useCallback(async () => {
    if (current.length !== COLS || finished || alreadyPlayed) return;
    const guess = current.toUpperCase();
    const newGuesses = [...guesses, guess];
    setGuesses(newGuesses);
    setCurrent('');
    if (guess === target) {
      setFinished('won');
      // Save score
      if (user && content) {
        const { data: ranking } = await supabase
          .from('daily_scores').select('id')
          .eq('content_id', content.id).order('finished_at', { ascending: true });
        const rank = (ranking?.length || 0) + 1;
        const reward = rewards[rank - 1] || 0;
        await supabase.from('daily_scores').insert({
          user_id: user.id, content_id: content.id, rank, rewarded: reward > 0,
        });
        if (reward > 0) {
          const { data: prof } = await supabase.from('profiles').select('balance').eq('user_id', user.id).single();
          await supabase.from('profiles').update({ balance: (prof?.balance || 0) + reward }).eq('user_id', user.id);
          await supabase.from('solde_history').insert({
            user_id: user.id, delta_dc: reward, reason: `Wordle du jour — ${rank}e place`,
          });
          await refreshProfile();
          toast.success(`🏆 ${rank}e place ! +${reward} DC`);
        } else {
          toast.success(`🎉 Trouvé ! ${rank}e place (pas de récompense)`);
        }
        await loadScores(content.id);
        setAlreadyPlayed(true);
      }
    } else if (newGuesses.length >= ROWS) {
      setFinished('lost');
      if (user && content) {
        await supabase.from('daily_scores').insert({
          user_id: user.id, content_id: content.id, rank: null, rewarded: false,
        });
        setAlreadyPlayed(true);
      }
    }
  }, [current, finished, alreadyPlayed, guesses, target, user, content, rewards, refreshProfile]);

  const pressKey = useCallback((k: string) => {
    if (finished || alreadyPlayed) return;
    if (k === 'ENTER') { submitGuess(); return; }
    if (k === 'BACK') { setCurrent(c => c.slice(0, -1)); return; }
    if (current.length < COLS && /^[A-Z]$/.test(k)) setCurrent(c => c + k);
  }, [current, finished, alreadyPlayed, submitGuess]);

  // Physical keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') pressKey('ENTER');
      else if (e.key === 'Backspace') pressKey('BACK');
      else if (/^[a-zA-Z]$/.test(e.key)) pressKey(e.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pressKey]);

  // Per-letter state for keyboard
  const letterStates: Record<string, LetterState> = {};
  guesses.forEach(g => {
    const ev = evaluate(g, target);
    g.split('').forEach((l, i) => {
      const prev = letterStates[l];
      const cur = ev[i];
      const rank = { correct: 3, present: 2, absent: 1, empty: 0 } as const;
      if (!prev || rank[cur] > rank[prev]) letterStates[l] = cur;
    });
  });

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement…</div>;

  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6 max-w-md">
      <button onClick={() => navigate('/jeux')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" /> Retour aux jeux
      </button>
      <div className="text-center mb-6">
        <h1 className="text-4xl font-display gold-text">🔠 Wordle du jour</h1>
        <p className="text-sm text-muted-foreground mt-1">6 essais pour trouver le mot de 5 lettres</p>
      </div>

      {!content ? (
        <Card className="p-8 text-center">
          <p className="text-5xl mb-3">🌙</p>
          <p className="font-display text-xl">Aucun mot disponible aujourd'hui, reviens demain</p>
        </Card>
      ) : (
        <>
          {alreadyPlayed && !finished && (
            <Card className="p-4 mb-4 text-center border-primary/30">
              <p className="text-sm">Tu as déjà joué aujourd'hui. Reviens demain ! 🦌</p>
            </Card>
          )}

          {/* Grid */}
          <div className="grid gap-1.5 mb-5">
            {Array.from({ length: ROWS }).map((_, r) => {
              const guess = guesses[r] || (r === guesses.length ? current : '');
              const ev = guesses[r] ? evaluate(guesses[r], target) : null;
              return (
                <div key={r} className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: COLS }).map((_, c) => {
                    const letter = guess[c] || '';
                    const state: LetterState = ev ? ev[c] : 'empty';
                    return (
                      <motion.div key={c}
                        initial={false}
                        animate={ev ? { rotateX: [0, 90, 0] } : {}}
                        transition={{ delay: c * 0.1, duration: 0.4 }}
                        className={`aspect-square flex items-center justify-center rounded-md text-2xl font-bold uppercase border-2 ${
                          state === 'correct' ? 'bg-success text-success-foreground border-success' :
                          state === 'present' ? 'bg-warning text-warning-foreground border-warning' :
                          state === 'absent' ? 'bg-muted text-muted-foreground border-muted' :
                          letter ? 'border-primary/50 bg-card' : 'border-border bg-card'
                        }`}>
                        {letter}
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {finished === 'won' && (
            <Card className="p-4 mb-4 text-center border-success bg-success/10">
              <p className="text-3xl mb-1">🏆</p>
              <p className="font-display text-lg">Bravo ! Tu as trouvé le mot.</p>
            </Card>
          )}
          {finished === 'lost' && (
            <Card className="p-4 mb-4 text-center border-destructive bg-destructive/10">
              <p className="text-3xl mb-1">💀</p>
              <p className="font-display text-lg">Perdu ! Le mot était : <span className="gold-text">{target}</span></p>
            </Card>
          )}

          {/* Keyboard */}
          {!finished && !alreadyPlayed && (
            <div className="space-y-1.5">
              {KB_ROWS.map((row, ri) => (
                <div key={ri} className="flex gap-1 justify-center">
                  {ri === 2 && (
                    <Button onClick={() => pressKey('ENTER')} variant="secondary" className="h-12 px-2 text-xs">OK</Button>
                  )}
                  {row.split('').map(l => {
                    const st = letterStates[l];
                    return (
                      <button key={l} onClick={() => pressKey(l)}
                        className={`flex-1 h-12 rounded-md text-sm font-semibold transition-colors ${
                          st === 'correct' ? 'bg-success text-success-foreground' :
                          st === 'present' ? 'bg-warning text-warning-foreground' :
                          st === 'absent' ? 'bg-muted text-muted-foreground' :
                          'bg-card border border-border hover:bg-secondary'
                        }`}>
                        {l}
                      </button>
                    );
                  })}
                  {ri === 2 && (
                    <Button onClick={() => pressKey('BACK')} variant="secondary" className="h-12 px-2 text-xs">⌫</Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Rewards */}
          {rewards.length > 0 && (
            <div className="mt-6 p-3 rounded-lg bg-card border border-primary/20 text-xs flex items-center justify-center gap-3 flex-wrap">
              <Coins className="w-4 h-4 text-primary" />
              {rewards.map((r, i) => (
                <span key={i}><b>{i + 1}{i === 0 ? 'er' : 'e'}</b> : {r} DC</span>
              ))}
            </div>
          )}

          {/* Leaderboard */}
          <div className="mt-8">
            <h2 className="text-xl font-display flex items-center gap-2 mb-3"><Trophy className="w-5 h-5 text-primary" /> Classement du jour</h2>
            {scores.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sois le premier à finir !</p>
            ) : (
              <div className="space-y-1.5">
                {scores.filter(s => s.rank).map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-2.5 rounded-md bg-card border border-border text-sm">
                    <span className="flex items-center gap-2">
                      <span className="font-bold w-6 text-center">{s.rank}</span>
                      <span>{s.profiles?.emoji || '🦌'} {s.profiles?.display_name || '?'}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.finished_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}