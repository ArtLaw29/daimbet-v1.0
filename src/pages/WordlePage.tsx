import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Coins, Trophy, Crown, CheckCircle2, Lock, Library } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { todayStr, useRevealCountdown } from '@/lib/dailyReveal';

const ROWS = 6;
const KB_ROWS = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];

type LetterState = 'correct' | 'present' | 'absent' | 'empty';

const VARIANTS: { key: string; label: string; short: string; emoji: string; difficulty: string; color: string; elite?: boolean }[] = [
  { key: '5', label: 'Défi 5 lettres', short: '5', emoji: '🟢', difficulty: 'Facile', color: 'border-success/60 bg-success/5' },
  { key: '6', label: 'Défi 6 lettres', short: '6', emoji: '🔵', difficulty: 'Moyen', color: 'border-blue-500/60 bg-blue-500/5' },
  { key: '7', label: 'Défi 7 lettres', short: '7', emoji: '🟣', difficulty: 'Costaud', color: 'border-purple-500/60 bg-purple-500/5' },
  { key: '8', label: 'Défi 8 lettres', short: '8', emoji: '🟠', difficulty: 'Hardcore', color: 'border-warning/60 bg-warning/5' },
  { key: '9', label: 'Défi 9 lettres', short: '9', emoji: '🔴', difficulty: 'Démoniaque', color: 'border-destructive/60 bg-destructive/5' },
  { key: 'culture', label: 'Défi Culture', short: 'C', emoji: '👑', difficulty: 'Élite', color: 'border-primary/80 bg-primary/10', elite: true },
];

function evaluate(guess: string, target: string): LetterState[] {
  const cols = target.length;
  const res: LetterState[] = Array(cols).fill('absent');
  const tArr = target.split('');
  const gArr = guess.split('');
  const used = Array(cols).fill(false);
  for (let i = 0; i < cols; i++) {
    if (gArr[i] === tArr[i]) { res[i] = 'correct'; used[i] = true; }
  }
  for (let i = 0; i < cols; i++) {
    if (res[i] === 'correct') continue;
    for (let j = 0; j < cols; j++) {
      if (!used[j] && gArr[i] === tArr[j]) { res[i] = 'present'; used[j] = true; break; }
    }
  }
  return res;
}

const lsKey = (date: string, variant: string) => `wordle:${date}:${variant}`;

export default function WordlePage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<any>(null);
  const [completed, setCompleted] = useState<Record<string, { rank: number | null; amount: number }>>({});
  const [activeVariant, setActiveVariant] = useState<string | null>(null);

  // Per-variant game state
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [finished, setFinished] = useState<'won' | 'lost' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [retrying, setRetrying] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const today = todayStr();

  // Load today's content + user's completion status for each variant
  useEffect(() => {
    (async () => {
      const { data: dc } = await supabase
        .from('daily_content')
        .select('*')
        .eq('type', 'wordle')
        .eq('scheduled_date', today)
        .eq('status', 'actif')
        .maybeSingle();
      setContent(dc);
      if (user) {
        const { data: scores } = await supabase
          .from('daily_scores').select('variant,rank,amount_earned')
          .eq('game_type', 'wordle')
          .eq('played_on', today)
          .eq('user_id', user.id);
        const map: Record<string, { rank: number | null; amount: number }> = {};
        (scores || []).forEach((s: any) => {
          if (s.variant) map[s.variant] = { rank: s.rank, amount: Number(s.amount_earned || 0) };
        });
        setCompleted(map);
      }
      setLoading(false);
    })();
  }, [user, today]);

  // Public leaderboard for the active variant
  const loadLeaderboard = useCallback(async () => {
    if (!activeVariant) return;
    const { data } = await supabase.rpc('get_wordle_leaderboard' as any, {
      p_variant: activeVariant,
      p_date: today,
    });
    setLeaderboard(Array.isArray(data) ? data : []);
  }, [activeVariant, today]);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard, completed]);

  const target = useMemo(() => {
    if (!content || !activeVariant) return '';
    return String((content.data as any)?.['word_' + activeVariant] || '').toUpperCase();
  }, [content, activeVariant]);

  // Load saved progress for active variant
  useEffect(() => {
    if (!activeVariant) return;
    setStartedAt(Date.now());
    setCurrent('');
    try {
      const raw = localStorage.getItem(lsKey(today, activeVariant));
      if (raw) {
        const saved = JSON.parse(raw);
        setGuesses(Array.isArray(saved.guesses) ? saved.guesses : []);
        setFinished(saved.finished ?? null);
        return;
      }
    } catch {}
    setGuesses([]);
    setFinished(null);
  }, [activeVariant, today]);

  // Persist progress
  useEffect(() => {
    if (!activeVariant) return;
    try {
      localStorage.setItem(lsKey(today, activeVariant), JSON.stringify({ guesses, finished }));
    } catch {}
  }, [guesses, finished, activeVariant, today]);

  const alreadyDone = activeVariant ? !!completed[activeVariant] : false;

  const submitGuess = useCallback(async () => {
    if (!activeVariant || !target) return;
    if (current.length !== target.length || finished || alreadyDone || submitting) return;
    const guess = current.toUpperCase();
    const newGuesses = [...guesses, guess];
    setGuesses(newGuesses);
    setCurrent('');
    if (guess === target) {
      setFinished('won');
      if (user) {
        setSubmitting(true);
        const { data: claim } = await supabase.rpc('submit_wordle_variant' as any, {
          p_variant: activeVariant,
          p_score: { won: true, attempts: newGuesses.length, duration_ms: Date.now() - startedAt },
          p_completed: true,
        });
        const c: any = claim || {};
        if (c.error) { toast.error(c.error); setSubmitting(false); return; }
        const rank = c.rank as number | null;
        const amount = Number(c.amount_earned ?? 0);
        if (amount > 0) await refreshProfile();
        if (rank) {
          const ord = rank === 1 ? '1er' : `${rank}ème`;
          toast.success(`Bravo ! ${ord} sur ce défi.${amount > 0 ? ` +${amount} DC` : ''}`);
        }
        setCompleted((m) => ({ ...m, [activeVariant]: { rank, amount } }));
        setSubmitting(false);
      }
    } else if (newGuesses.length >= ROWS) {
      setFinished('lost');
      if (user) {
        await supabase.rpc('submit_wordle_variant' as any, {
          p_variant: activeVariant,
          p_score: { won: false, attempts: newGuesses.length, duration_ms: Date.now() - startedAt },
          p_completed: false,
        });
        setCompleted((m) => ({ ...m, [activeVariant]: { rank: null, amount: 0 } }));
      }
    }
  }, [activeVariant, target, current, finished, alreadyDone, submitting, guesses, user, refreshProfile, startedAt]);

  const pressKey = useCallback((k: string) => {
    if (!activeVariant || !target) return;
    if (finished || alreadyDone) return;
    if (k === 'ENTER') { submitGuess(); return; }
    if (k === 'BACK') { setCurrent(c => c.slice(0, -1)); return; }
    if (current.length < target.length && /^[A-Z]$/.test(k)) setCurrent(c => c + k);
  }, [activeVariant, target, current, finished, alreadyDone, submitGuess]);

  const handleRetry = useCallback(async () => {
    if (!activeVariant || retrying) return;
    setRetrying(true);
    const { data, error } = await supabase.rpc('wordle_retry' as any, { p_variant: activeVariant });
    const r: any = data || {};
    if (error || r.error) {
      toast.error(r.error || error?.message || 'Erreur');
      setRetrying(false);
      return;
    }
    toast.success('Nouvelle tentative ! -50 DC');
    await refreshProfile();
    setCompleted((m) => {
      const n = { ...m };
      delete n[activeVariant];
      return n;
    });
    setGuesses([]);
    setCurrent('');
    setFinished(null);
    setStartedAt(Date.now());
    try { localStorage.removeItem(lsKey(today, activeVariant)); } catch {}
    setRetrying(false);
  }, [activeVariant, retrying, refreshProfile, today]);

  useEffect(() => {
    if (!activeVariant) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') pressKey('ENTER');
      else if (e.key === 'Backspace') pressKey('BACK');
      else if (/^[a-zA-Z]$/.test(e.key)) pressKey(e.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pressKey, activeVariant]);

  const letterStates: Record<string, LetterState> = {};
  if (target) {
    guesses.forEach(g => {
      const ev = evaluate(g, target);
      g.split('').forEach((l, i) => {
        const prev = letterStates[l];
        const cur = ev[i];
        const rank = { correct: 3, present: 2, absent: 1, empty: 0 } as const;
        if (!prev || rank[cur] > rank[prev]) letterStates[l] = cur;
      });
    });
  }

  const reveal = useRevealCountdown((content as any)?.reveal_at, today);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement…</div>;

  // ── Selection screen ──
  if (!activeVariant) {
    return (
      <div className="container mx-auto px-4 py-6 pb-20 md:pb-6 max-w-2xl">
        <button onClick={() => navigate('/jeux')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm">
          <ArrowLeft className="w-4 h-4" /> Retour aux jeux
        </button>
        <div className="text-center mb-6">
          <h1 className="text-4xl font-display gold-text">🔠 Mot du jour</h1>
          <p className="text-sm text-muted-foreground mt-1">6 défis indépendants — choisis ton challenge</p>
        </div>

        {!content ? (
          <Card className="p-8 text-center">
            <p className="text-5xl mb-3">🌙</p>
            <p className="font-display text-xl">Aucun défi disponible aujourd'hui, reviens demain</p>
          </Card>
        ) : !reveal.revealed ? (
          <Card className="p-8 text-center">
            <p className="text-5xl mb-3">⏳</p>
            <p className="font-display text-xl">Disponible dans</p>
            <p className="text-4xl font-mono gold-text mt-2 tabular-nums">{reveal.countdown}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {VARIANTS.map((v) => {
              const word = String((content.data as any)?.['word_' + v.key] || '');
              const done = completed[v.key];
              const won = done && done.rank !== null;
              const lost = done && done.rank === null;
              const noWord = !word;
              return (
                <button
                  key={v.key}
                  disabled={noWord}
                  onClick={() => setActiveVariant(v.key)}
                  className={`relative p-4 rounded-lg border-2 text-left transition hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed ${v.color} ${
                    v.elite ? 'shadow-[0_0_20px_hsl(var(--primary)/0.3)]' : ''
                  }`}
                >
                  {v.elite && (
                    <Badge variant="default" className="absolute top-2 right-2 text-[9px] px-1.5 py-0 gap-0.5">
                      <Crown className="w-2.5 h-2.5" /> Élite
                    </Badge>
                  )}
                  <div className="text-3xl mb-1">{v.emoji}</div>
                  <div className="font-display text-base">{v.label}</div>
                  <div className="text-[11px] text-muted-foreground">{v.difficulty}</div>
                  {v.elite && (
                    <div className="text-[10px] text-muted-foreground/80 italic mt-1 leading-snug">
                      Histoire, géographie, arts, sports… Teste ta culture générale.
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-1 text-xs">
                    {noWord ? (
                      <><Lock className="w-3 h-3" /> <span className="text-muted-foreground">À venir</span></>
                    ) : won ? (
                      <><CheckCircle2 className="w-3.5 h-3.5 text-success" /> <span className="text-success font-semibold">Trouvé · #{done!.rank}</span></>
                    ) : lost ? (
                      <span className="text-destructive font-semibold">💀 Raté</span>
                    ) : (
                      <span className="text-primary font-semibold">À jouer →</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Game screen ──
  if (!target) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-md text-center">
        <p className="text-muted-foreground">Mot indisponible</p>
        <Button variant="outline" className="mt-4" onClick={() => setActiveVariant(null)}>Retour aux défis</Button>
      </div>
    );
  }

  const COLS = target.length;
  const variantMeta = VARIANTS.find((v) => v.key === activeVariant)!;
  const gridCellSize = COLS >= 9 ? 'text-base' : COLS >= 7 ? 'text-xl' : 'text-2xl';
  const containerWidth = COLS >= 9 ? 'max-w-lg' : COLS >= 7 ? 'max-w-md' : 'max-w-md';

  return (
    <div className={`container mx-auto px-4 py-6 pb-20 md:pb-6 ${containerWidth}`}>
      <button onClick={() => setActiveVariant(null)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" /> Retour aux défis
      </button>
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          {variantMeta.elite && <Crown className="w-5 h-5 text-primary" />}
          <h1 className="text-3xl font-display gold-text">{variantMeta.label}</h1>
        </div>
        <p className="text-xs text-muted-foreground">6 essais · mot de {COLS} lettres</p>
      </div>

      {variantMeta.elite && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          <Library className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <span className="font-display tracking-wide">
            Ce mot est tiré de la culture générale&nbsp;: histoire, géographie, arts, sports, etc. Il peut s'agir d'un nom propre ou d'un événement marquant.
          </span>
        </div>
      )}

      {alreadyDone && completed[activeVariant!]?.rank !== null && (
        <Card className="p-3 mb-3 text-center border-success bg-success/10">
          <p className="text-sm">Tu as terminé ce défi {completed[activeVariant!]!.rank === 1 ? '1er' : `${completed[activeVariant!]!.rank}ème`}.
            {completed[activeVariant!]!.amount > 0 && ` +${completed[activeVariant!]!.amount} DC`}</p>
        </Card>
      )}
      {alreadyDone && completed[activeVariant!]?.rank === null && (
        <Card className="p-3 mb-3 text-center border-destructive bg-destructive/10">
          <p className="text-sm">Tu as déjà tenté ce défi aujourd'hui.</p>
        </Card>
      )}

      {/* Grid */}
      <div className="grid gap-1.5 mb-5">
        {Array.from({ length: ROWS }).map((_, r) => {
          const guess = guesses[r] || (r === guesses.length ? current : '');
          const ev = guesses[r] ? evaluate(guesses[r], target) : null;
          return (
            <div key={r} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
              {Array.from({ length: COLS }).map((_, c) => {
                const letter = guess[c] || '';
                const state: LetterState = ev ? ev[c] : 'empty';
                return (
                  <motion.div key={c}
                    initial={false}
                    animate={ev ? { rotateX: [0, 90, 0] } : {}}
                    transition={{ delay: c * 0.08, duration: 0.4 }}
                    className={`aspect-square flex items-center justify-center rounded-md ${gridCellSize} font-bold uppercase border-2 ${
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

      {finished === 'won' && !alreadyDone && (
        <Card className="p-4 mb-4 text-center border-success bg-success/10">
          <p className="text-3xl mb-1">🏆</p>
          <p className="font-display text-lg">Bravo ! Tu as trouvé le mot.</p>
        </Card>
      )}
      {finished === 'lost' && (
        <Card className="p-4 mb-4 text-center border-destructive bg-destructive/10">
          <p className="text-3xl mb-1">💀</p>
          <p className="font-display text-lg">Perdu ! Le mot reste secret…</p>
          <p className="text-xs text-muted-foreground mt-1">Tu peux retenter ta chance pour 50 DC.</p>
          <Button onClick={handleRetry} disabled={retrying} className="mt-3" variant="default">
            <Coins className="w-4 h-4 mr-1" /> Nouvelle tentative · 50 DC
          </Button>
        </Card>
      )}
      {alreadyDone && completed[activeVariant!]?.rank === null && finished !== 'lost' && (
        <Card className="p-3 mb-4 text-center border-primary/40">
          <p className="text-sm mb-2">Tu as raté ce défi. Une seconde chance ?</p>
          <Button onClick={handleRetry} disabled={retrying} size="sm">
            <Coins className="w-4 h-4 mr-1" /> Retenter pour 50 DC
          </Button>
        </Card>
      )}

      {/* Keyboard */}
      {!finished && !alreadyDone && (
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

      <div className="mt-6 p-3 rounded-lg bg-card border border-primary/20 text-xs flex items-center justify-center gap-3 flex-wrap">
        <Coins className="w-4 h-4 text-primary" />
        <span><b>1er</b> : 500 DC</span>
        <span><b>2e</b> : 300 DC</span>
        <span><b>3e</b> : 200 DC</span>
        <span><b>4e+</b> : 50 DC</span>
        {variantMeta.elite && <Badge variant="default" className="text-[9px]"><Trophy className="w-2.5 h-2.5 mr-0.5" />Culture bonifié</Badge>}
      </div>

      {/* Public leaderboard */}
      <Card className="mt-6 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg">Classement du défi</h2>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">Personne n'a encore trouvé. Sois le premier !</p>
        ) : (
          <ol className="space-y-1.5">
            {leaderboard.map((row: any) => (
              <li key={row.user_id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${
                user && row.user_id === user.id ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30'
              }`}>
                <span className={`w-6 text-center text-sm font-bold ${row.rank === 1 ? 'text-primary' : ''}`}>
                  {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`}
                </span>
                <span className="text-lg">{row.emoji || '👤'}</span>
                <span className="flex-1 text-sm truncate">{row.display_name || 'Anonyme'}</span>
                {row.attempts != null && (
                  <span className="text-xs text-muted-foreground">{row.attempts} essai{row.attempts > 1 ? 's' : ''}</span>
                )}
                {row.amount_earned > 0 && (
                  <span className="text-xs font-semibold text-primary">+{row.amount_earned}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
