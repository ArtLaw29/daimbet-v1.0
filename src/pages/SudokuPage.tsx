import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Coins, Trophy, Timer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function SudokuPage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<any>(null);
  const [puzzle, setPuzzle] = useState<number[]>([]);
  const [solution, setSolution] = useState<number[]>([]);
  const [rewards, setRewards] = useState<number[]>([]);
  const [grid, setGrid] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [errors, setErrors] = useState<Set<number>>(new Set());
  const [seconds, setSeconds] = useState(0);
  const [finished, setFinished] = useState(false);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [scores, setScores] = useState<any[]>([]);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    (async () => {
      const { data: dc } = await supabase.from('daily_content').select('*')
        .eq('type', 'sudoku').eq('scheduled_date', todayStr()).eq('status', 'actif').maybeSingle();
      if (!dc) { setLoading(false); return; }
      setContent(dc);
      const data = dc.data as any;
      const p = (data.puzzle || []).map((v: any) => Number(v) || 0);
      const s = (data.solution || []).map((v: any) => Number(v) || 0);
      setPuzzle(p); setSolution(s); setGrid([...p]);
      setRewards(Array.isArray(data.rewards) ? data.rewards : []);
      if (user) {
        const { data: existing } = await supabase.from('daily_scores').select('*')
          .eq('content_id', dc.id).eq('user_id', user.id).maybeSingle();
        if (existing) setAlreadyPlayed(true);
      }
      await loadScores(dc.id);
      setLoading(false);
      startRef.current = Date.now();
    })();
  }, [user]);

  const loadScores = async (contentId: string) => {
    const { data } = await supabase
      .from('daily_scores')
      .select('*')
      .eq('content_id', contentId)
      .order('finished_at', { ascending: true })
      .limit(20);
    const rows = data || [];
    const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
    let profMap: Record<string, any> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles').select('user_id, display_name, emoji').in('user_id', ids);
      (profs || []).forEach((p: any) => { profMap[p.user_id] = p; });
    }
    setScores(rows.map((r: any) => ({ ...r, profiles: profMap[r.user_id] })));
  };

  // Timer
  useEffect(() => {
    if (loading || finished || alreadyPlayed || !content) return;
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [loading, finished, alreadyPlayed, content]);

  // Physical keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected === null || finished || alreadyPlayed) return;
      if (puzzle[selected] !== 0) return;
      if (/^[1-9]$/.test(e.key)) setCell(selected, parseInt(e.key));
      else if (e.key === 'Backspace' || e.key === '0' || e.key === 'Delete') setCell(selected, 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, puzzle, finished, alreadyPlayed]);

  const setCell = (i: number, v: number) => {
    setGrid(g => { const n = [...g]; n[i] = v; return n; });
    setErrors(e => { const n = new Set(e); n.delete(i); return n; });
  };

  const verify = async () => {
    const wrong = new Set<number>();
    for (let i = 0; i < 81; i++) {
      if (grid[i] === 0 || grid[i] !== solution[i]) wrong.add(i);
    }
    if (wrong.size > 0) {
      setErrors(wrong);
      toast.error(`${wrong.size} case${wrong.size > 1 ? 's' : ''} incorrecte${wrong.size > 1 ? 's' : ''}`);
      return;
    }
    setFinished(true);
    if (user && content) {
      const { data: ranking } = await supabase.from('daily_scores').select('id')
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
          user_id: user.id, delta_dc: reward, reason: `Sudoku du jour — ${rank}e place`,
        });
        await refreshProfile();
        toast.success(`🏆 ${rank}e place en ${fmt(seconds)} ! +${reward} DC`);
      } else {
        toast.success(`🎉 Terminé en ${fmt(seconds)} — ${rank}e place`);
      }
      setAlreadyPlayed(true);
      await loadScores(content.id);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement…</div>;

  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6 max-w-md">
      <button onClick={() => navigate('/jeux')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" /> Retour aux jeux
      </button>
      <div className="text-center mb-4">
        <h1 className="text-4xl font-display gold-text">🔢 Sudoku Race</h1>
        <p className="text-sm text-muted-foreground mt-1">Le plus rapide remporte la mise</p>
      </div>

      {!content ? (
        <Card className="p-8 text-center">
          <p className="text-5xl mb-3">🌙</p>
          <p className="font-display text-xl">Aucune grille disponible aujourd'hui, reviens demain</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Timer className="w-4 h-4 text-primary" /> {fmt(seconds)}
            </span>
            {alreadyPlayed && !finished && <span className="text-xs text-muted-foreground">Déjà joué aujourd'hui</span>}
          </div>

          {/* 9x9 grid */}
          <div className="grid grid-cols-9 gap-px bg-border p-px rounded-md overflow-hidden">
            {grid.map((v, i) => {
              const r = Math.floor(i / 9), c = i % 9;
              const fixed = puzzle[i] !== 0;
              const isErr = errors.has(i);
              const sel = selected === i;
              const sameRowCol = selected !== null && (Math.floor(selected / 9) === r || selected % 9 === c);
              const borderR = (c % 3 === 2 && c < 8) ? 'border-r-2 border-r-primary/40' : '';
              const borderB = (r % 3 === 2 && r < 8) ? 'border-b-2 border-b-primary/40' : '';
              return (
                <button key={i} onClick={() => !alreadyPlayed && !finished && setSelected(i)}
                  className={`aspect-square text-base font-semibold flex items-center justify-center transition-colors ${borderR} ${borderB} ${
                    isErr ? 'bg-destructive/20 text-destructive' :
                    sel ? 'bg-primary/30' :
                    sameRowCol ? 'bg-secondary/60' :
                    fixed ? 'bg-card text-foreground' : 'bg-card text-primary'
                  }`}>
                  {v !== 0 ? v : ''}
                </button>
              );
            })}
          </div>

          {/* Number pad */}
          {!finished && !alreadyPlayed && (
            <>
              <div className="grid grid-cols-9 gap-1 mt-3">
                {[1,2,3,4,5,6,7,8,9].map(n => (
                  <button key={n} onClick={() => selected !== null && puzzle[selected] === 0 && setCell(selected, n)}
                    className="aspect-square rounded-md bg-card border border-border hover:bg-secondary font-bold">
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" onClick={() => selected !== null && puzzle[selected] === 0 && setCell(selected, 0)} className="flex-1">
                  Effacer
                </Button>
                <Button onClick={verify} className="flex-1" size="lg">Vérifier</Button>
              </div>
            </>
          )}

          {finished && (
            <Card className="p-4 mt-4 text-center border-success bg-success/10">
              <p className="text-3xl mb-1">🏆</p>
              <p className="font-display text-lg">Grille complétée en {fmt(seconds)} !</p>
            </Card>
          )}

          {rewards.length > 0 && (
            <div className="mt-6 p-3 rounded-lg bg-card border border-primary/20 text-xs flex items-center justify-center gap-3 flex-wrap">
              <Coins className="w-4 h-4 text-primary" />
              {rewards.map((r, i) => (
                <span key={i}><b>{i + 1}{i === 0 ? 'er' : 'e'}</b> : {r} DC</span>
              ))}
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-xl font-display flex items-center gap-2 mb-3"><Trophy className="w-5 h-5 text-primary" /> Classement du jour</h2>
            {scores.filter(s => s.rank).length === 0 ? (
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