import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Coins, Trophy, Check, ArrowRight, ArrowDown, CornerDownRight, CornerRightDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { todayStr, useRevealCountdown } from '@/lib/dailyReveal';

type Direction = 'right' | 'down' | 'right-down' | 'down-right';
type Cell =
  | { type: 'lettre'; correct: string }
  | { type: 'definition'; text: string; direction: Direction; definitions?: Array<{ text: string; direction: Direction }> }
  | { type: 'definition'; definitions: Array<{ text: string; direction: Direction }>; text?: string; direction?: Direction }
  | { type: 'vide' };
type FocusDir = 'H' | 'V';

export default function MotsFlechesPage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<any>(null);
  const [grid, setGrid] = useState<string[][]>([]);
  const [verified, setVerified] = useState<boolean[][]>([]);
  const [cursor, setCursor] = useState<{ r: number; c: number } | null>(null);
  const [dir, setDir] = useState<FocusDir>('H');
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [scores, setScores] = useState<any[]>([]);

  const grille: Cell[][] = (content?.data?.grille || []) as Cell[][];
  const rows = grille.length;
  const cols = grille[0]?.length || 0;
  const rewards: number[] = content?.data?.rewards || [];

  const isLetter = useCallback((r: number, c: number) => {
    return grille[r]?.[c]?.type === 'lettre';
  }, [grille]);

  useEffect(() => {
    (async () => {
      const { data: dc } = await supabase
        .from('daily_content').select('*')
        .eq('type', 'mots_croisés').eq('scheduled_date', todayStr()).eq('status', 'actif').maybeSingle();
      if (!dc) { setLoading(false); return; }
      setContent(dc);
      const g = (dc.data as any).grille as Cell[][];
      setGrid(g.map((row) => row.map(() => '')));
      setVerified(g.map((row) => row.map(() => false)));
      if (user) {
        const { data: existing } = await supabase.from('daily_scores')
          .select('*').eq('content_id', dc.id).eq('user_id', user.id).maybeSingle();
        if (existing) setAlreadyPlayed(true);
      }
      await loadScores(dc.id);
      setLoading(false);
    })();
  }, [user]);

  const loadScores = async (contentId: string) => {
    const { data } = await supabase.from('daily_scores').select('*')
      .eq('content_id', contentId).order('finished_at', { ascending: true }).limit(20);
    const rows = data || [];
    const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
    let map: Record<string, any> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles_public' as any)
        .select('user_id, display_name, emoji').in('user_id', ids);
      (profs || []).forEach((p: any) => (map[p.user_id] = p));
    }
    setScores(rows.map((r: any) => ({ ...r, profiles: map[r.user_id] })));
  };

  const advance = useCallback((r: number, c: number) => {
    if (dir === 'H') {
      for (let cc = c + 1; cc < cols; cc++) if (isLetter(r, cc)) { setCursor({ r, c: cc }); return; }
    } else {
      for (let rr = r + 1; rr < rows; rr++) if (isLetter(rr, c)) { setCursor({ r: rr, c }); return; }
    }
  }, [dir, cols, rows, isLetter]);

  const retreat = useCallback((r: number, c: number) => {
    if (dir === 'H') {
      for (let cc = c - 1; cc >= 0; cc--) if (isLetter(r, cc)) { setCursor({ r, c: cc }); return; }
    } else {
      for (let rr = r - 1; rr >= 0; rr--) if (isLetter(rr, c)) { setCursor({ r: rr, c }); return; }
    }
  }, [dir, isLetter]);

  const onCellClick = (r: number, c: number) => {
    if (!isLetter(r, c) || alreadyPlayed || finished) return;
    if (cursor && cursor.r === r && cursor.c === c) {
      setDir((d) => (d === 'H' ? 'V' : 'H'));
    } else setCursor({ r, c });
  };

  const setLetter = useCallback((l: string) => {
    if (!cursor || alreadyPlayed || finished) return;
    setGrid((g) => {
      const ng = g.map((row) => [...row]);
      ng[cursor.r][cursor.c] = l;
      return ng;
    });
    advance(cursor.r, cursor.c);
  }, [cursor, advance, alreadyPlayed, finished]);

  const backspace = useCallback(() => {
    if (!cursor || alreadyPlayed || finished) return;
    setGrid((g) => {
      const ng = g.map((row) => [...row]);
      if (ng[cursor.r][cursor.c]) ng[cursor.r][cursor.c] = '';
      else { retreat(cursor.r, cursor.c); }
      return ng;
    });
    if (!grid[cursor.r][cursor.c]) retreat(cursor.r, cursor.c);
  }, [cursor, grid, retreat, alreadyPlayed, finished]);

  // Physical keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (alreadyPlayed || finished || !cursor) return;
      if (/^[a-zA-Z]$/.test(e.key)) { setLetter(e.key.toUpperCase()); }
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const { r, c } = cursor;
        const dx = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key]!;
        let nr = r + dx[0], nc = c + dx[1];
        // Skip non-letter cells
        while (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !isLetter(nr, nc)) {
          nr += dx[0]; nc += dx[1];
        }
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && isLetter(nr, nc)) {
          setCursor({ r: nr, c: nc });
          setDir(e.key === 'ArrowRight' || e.key === 'ArrowLeft' ? 'H' : 'V');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, setLetter, backspace, alreadyPlayed, finished, rows, cols, isLetter]);

  const verify = async () => {
    const nv: boolean[][] = grid.map((row, r) => row.map((l, c) => {
      const cell = grille[r]?.[c];
      if (!cell || cell.type !== 'lettre') return false;
      return l.toUpperCase() === cell.correct.toUpperCase();
    }));
    setVerified(nv);
    let allGood = true;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (isLetter(r, c) && !nv[r][c]) { allGood = false; break; }
    }
    if (!allGood) { toast.error('Certaines cases sont incorrectes'); return; }
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
          user_id: user.id, delta_dc: reward, reason: `Mots fléchés du jour — ${rank}e place`,
        });
        await refreshProfile();
        toast.success(`🏆 ${rank}e place ! +${reward} DC`);
      } else {
        toast.success(`🎉 Grille complétée ! ${rank}e place`);
      }
      await loadScores(content.id);
      setAlreadyPlayed(true);
    }
  };

  const reveal = useRevealCountdown((content as any)?.reveal_at, todayStr());

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement…</div>;

  const renderArrow = (direction: Direction) => {
    const cls = "w-2.5 h-2.5 absolute text-white drop-shadow";
    switch (direction) {
      case 'right': return <ArrowRight className={`${cls} top-1/2 -translate-y-1/2 right-0`} />;
      case 'down': return <ArrowDown className={`${cls} left-1/2 -translate-x-1/2 bottom-0`} />;
      case 'right-down': return <CornerRightDown className={`${cls} bottom-0 right-0`} />;
      case 'down-right': return <CornerDownRight className={`${cls} bottom-0 right-0`} />;
    }
  };

  const defPaddingClass = (direction: Direction) => {
    switch (direction) {
      case 'right': return 'pr-3';
      case 'down': return 'pb-3';
      case 'right-down':
      case 'down-right': return 'pr-3 pb-3';
    }
  };

  const renderDefBlock = (text: string, direction: Direction, extraClass = '') => (
    <div className={`relative flex-1 flex items-center justify-center overflow-hidden ${defPaddingClass(direction)} ${extraClass}`}>
      <span className="text-[10px] leading-none font-bold uppercase text-center text-white break-words px-0.5">
        {text}
      </span>
      {renderArrow(direction)}
    </div>
  );
  };

  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6 max-w-2xl">
      <button onClick={() => navigate('/jeux')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" /> Retour aux jeux
      </button>
      <div className="text-center mb-5">
        <h1 className="text-4xl font-display gold-text">📝 Mots fléchés du jour</h1>
      </div>

      {!content ? (
        <Card className="p-8 text-center">
          <p className="text-5xl mb-3">🌙</p>
          <p className="font-display text-xl">Aucune grille disponible aujourd'hui, reviens demain</p>
        </Card>
      ) : !reveal.revealed ? (
        <Card className="p-8 text-center">
          <p className="text-5xl mb-3">⏳</p>
          <p className="font-display text-xl">Disponible dans</p>
          <p className="text-4xl font-mono gold-text mt-2 tabular-nums">{reveal.countdown}</p>
        </Card>
      ) : (
        <>
          {alreadyPlayed && !finished && (
            <Card className="p-4 mb-4 text-center border-primary/30">
              <p className="text-sm">Tu as déjà joué aujourd'hui. Reviens demain ! 🦌</p>
            </Card>
          )}

          {/* Direction toggle */}
          <div className="flex gap-2 mb-3 justify-center">
            <Button size="sm" variant={dir === 'H' ? 'default' : 'outline'} onClick={() => setDir('H')}>Horizontal →</Button>
            <Button size="sm" variant={dir === 'V' ? 'default' : 'outline'} onClick={() => setDir('V')}>Vertical ↓</Button>
          </div>

          {/* Grid */}
          <div className="flex justify-center mb-5 overflow-x-auto">
            <div className="inline-flex flex-col gap-[1px] bg-slate-800 p-[1px]">
              {grille.map((row, r) => (
                <div key={r} className="flex gap-[1px]">
                  {row.map((cell, c) => {
                    const val = grid[r]?.[c] || '';
                    const isSel = cursor?.r === r && cursor?.c === c;
                    const ok = verified[r]?.[c];
                    if (cell.type === 'vide') {
                      return <div key={c} className="w-11 h-11 bg-slate-800" />;
                    }
                    if (cell.type === 'definition') {
                      const defs = (cell as any).definitions as Array<{text:string; direction:Direction}> | undefined;
                      const list = defs && defs.length > 0
                        ? defs
                        : [{ text: cell.text!, direction: cell.direction! }];
                      const stackVertical = list.length > 1
                        && list.every(d => d.direction === 'down' || d.direction === 'right');
                      // Default split: horizontal stack (top/bottom) for two defs
                      return (
                        <div key={c} className="relative w-11 h-11 bg-blue-700 select-none flex flex-col">
                          {list.length === 1 ? (
                            renderDefBlock(list[0].text, list[0].direction)
                          ) : (
                            list.map((d, i) => (
                              <div key={i} className={`flex-1 flex ${i > 0 ? 'border-t border-slate-800' : ''}`}>
                                {renderDefBlock(d.text, d.direction)}
                              </div>
                            ))
                          )}
                        </div>
                      );
                    }
                    // lettre
                    return (
                      <div key={c}
                        onClick={() => onCellClick(r, c)}
                        className={`relative w-11 h-11 flex items-center justify-center text-base font-bold uppercase text-slate-900 select-none cursor-pointer ${
                          ok ? 'bg-green-200' :
                          isSel ? 'bg-yellow-200 ring-2 ring-primary ring-inset' :
                          'bg-white hover:bg-slate-100'
                        }`}>
                        {val}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Verify */}
          {!alreadyPlayed && !finished && (
            <Button onClick={verify} className="w-full mb-5" size="lg">
              <Check className="w-4 h-4 mr-2" /> Vérifier la grille
            </Button>
          )}

          {/* Mobile keyboard */}
          {!alreadyPlayed && !finished && (
            <div className="space-y-1.5 mb-5 md:hidden">
              {['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'].map((row, ri) => (
                <div key={ri} className="flex gap-1 justify-center">
                  {row.split('').map((l) => (
                    <button key={l} onClick={() => setLetter(l)}
                      className="flex-1 h-11 rounded-md text-sm font-semibold bg-card border border-border hover:bg-secondary">
                      {l}
                    </button>
                  ))}
                  {ri === 2 && (
                    <button onClick={backspace} className="px-3 h-11 rounded-md text-sm font-semibold bg-secondary">⌫</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Rewards */}
          {rewards.length > 0 && (
            <div className="mb-5 p-3 rounded-lg bg-card border border-primary/20 text-xs flex items-center justify-center gap-3 flex-wrap">
              <Coins className="w-4 h-4 text-primary" />
              {rewards.map((r, i) => (
                <span key={i}><b>{i + 1}{i === 0 ? 'er' : 'e'}</b> : {r} DC</span>
              ))}
            </div>
          )}

          {/* Leaderboard */}
          <h2 className="text-xl font-display flex items-center gap-2 mb-3"><Trophy className="w-5 h-5 text-primary" /> Classement du jour</h2>
          {scores.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sois le premier à finir !</p>
          ) : (
            <div className="space-y-1.5">
              {scores.filter((s) => s.rank).map((s) => (
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
        </>
      )}
    </div>
  );
}
