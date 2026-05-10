import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Flag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const ROWS = 6, COLS = 7;
const INACTIVITY_MS = 3 * 60 * 1000;

function checkWin(board: number[][], player: number): boolean {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (board[r][c] !== player) continue;
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
      let count = 0;
      for (let k = 0; k < 4; k++) {
        const nr = r + dr * k, nc = c + dc * k;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) count++;
        else break;
      }
      if (count === 4) return true;
    }
  }
  return false;
}

export default function Puissance4Page() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opponentOnline, setOpponentOnline] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const channelRef = useRef<any>(null);

  const isP1 = user?.id === session?.player1_id;
  const opponentId = isP1 ? session?.player2_id : session?.player1_id;
  const myToken = isP1 ? 1 : 2;
  const state = session?.game_state || {};
  const board: number[][] = state.board || Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
  const turn: string | null = state.turn;
  const isMyTurn = turn === user?.id;

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const { data } = await supabase.from('games_sessions').select('*').eq('id', sessionId).maybeSingle();
      setSession(data);
      setLoading(false);
    })();
    const ch = supabase.channel(`p4-${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games_sessions', filter: `id=eq.${sessionId}` },
        (p) => setSession(p.new))
      .on('presence', { event: 'sync' }, () => {
        const st = ch.presenceState() as any;
        const others = Object.values(st).flat().filter((p: any) => p.user_id && p.user_id !== user?.id);
        setOpponentOnline(others.length > 0);
      })
      .subscribe(async (s) => { if (s === 'SUBSCRIBED' && user) await ch.track({ user_id: user.id }); });
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, user?.id]);

  const playColumn = async (col: number) => {
    if (!isMyTurn || session.status === 'termine') return;
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) { if (board[r][col] === 0) { row = r; break; } }
    if (row < 0) return toast.error('Colonne pleine');
    const newBoard = board.map((r) => [...r]);
    newBoard[row][col] = myToken;
    const won = checkWin(newBoard, myToken);
    const isFull = newBoard.every((r) => r.every((c) => c !== 0));
    const newTurn = won || isFull ? null : opponentId;
    await supabase.from('games_sessions').update({
      game_state: { ...state, board: newBoard, turn: newTurn, last_action_at: Date.now() / 1000 },
      updated_at: new Date().toISOString(),
    }).eq('id', sessionId);
    if (won) {
      await supabase.rpc('finish_duel', { p_session_id: sessionId, p_winner_id: user!.id });
      await refreshProfile();
      toast.success('🏆 Tu as gagné !');
    } else if (isFull) {
      await supabase.rpc('finish_duel', { p_session_id: sessionId, p_winner_id: null });
      await refreshProfile();
      toast.info('🤝 Match nul');
    }
  };

  const forfeit = async () => {
    setConfirmForfeit(false);
    await supabase.rpc('finish_duel', { p_session_id: sessionId, p_winner_id: opponentId });
    await refreshProfile();
  };

  // Inactivity (3 min for opponent on their turn)
  useEffect(() => {
    if (!session || session.status === 'termine') return;
    const lastAction = (state.last_action_at || 0) * 1000;
    if (!lastAction || isMyTurn) return;
    const t = setInterval(async () => {
      if (Date.now() - lastAction > INACTIVITY_MS && !isMyTurn) {
        // Opponent inactive on their turn → I win
        await supabase.rpc('finish_duel', { p_session_id: sessionId, p_winner_id: user!.id });
        await refreshProfile();
        toast.success('Victoire par inactivité');
      }
    }, 10000);
    return () => clearInterval(t);
  }, [session, state.last_action_at, isMyTurn, user?.id, sessionId, refreshProfile]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement…</div>;
  if (!session) return <div className="p-8 text-center text-muted-foreground">Session introuvable</div>;
  if (!user || (user.id !== session.player1_id && user.id !== session.player2_id)) {
    return <div className="p-8 text-center text-muted-foreground">Tu ne participes pas à ce duel.</div>;
  }
  const isFinished = session.status === 'termine';
  const winnerIsMe = session.winner_id === user.id;

  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6 max-w-md">
      <button onClick={() => navigate('/jeux/duels')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" /> Retour aux duels
      </button>
      <div className="text-center mb-3">
        <h1 className="text-3xl font-display gold-text">🔴 Puissance 4</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Toi : {isP1 ? '🔴 Rouge' : '🟡 Jaune'} · Pot : {session.mise_player1 + session.mise_player2} DC
        </p>
        <div className="flex items-center justify-center gap-2 mt-1 text-xs">
          <span className={`w-2 h-2 rounded-full ${opponentOnline ? 'bg-success' : 'bg-destructive'}`}></span>
          <span className="text-muted-foreground">Adversaire {opponentOnline ? 'en ligne' : 'hors ligne'}</span>
        </div>
      </div>

      {isFinished ? (
        <Card className={`p-5 mb-4 text-center ${winnerIsMe ? 'border-success' : session.winner_id ? 'border-destructive' : 'border-border'}`}>
          <p className="text-4xl mb-1">{winnerIsMe ? '🏆' : session.winner_id ? '💀' : '🤝'}</p>
          <p className="font-display text-lg">{winnerIsMe ? `Victoire ! +${session.mise_player1 + session.mise_player2} DC` : session.winner_id ? 'Défaite' : 'Match nul'}</p>
        </Card>
      ) : (
        <p className="text-center text-sm mb-3 font-semibold">{isMyTurn ? '🎯 À toi de jouer' : '⏳ Tour de l\'adversaire'}</p>
      )}

      <div className="bg-blue-900/40 p-2 rounded-lg inline-block mx-auto block">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: COLS }).map((_, c) => (
            <button key={c} onClick={() => playColumn(c)} disabled={!isMyTurn || isFinished}
              className="text-xs text-blue-200 hover:text-white disabled:opacity-30 h-5">▼</button>
          ))}
          {board.flatMap((row, r) => row.map((cell, c) => (
            <div key={`${r}-${c}`} className="w-10 h-10 rounded-full bg-blue-950 flex items-center justify-center">
              {cell === 1 && <div className="w-8 h-8 rounded-full bg-red-500" />}
              {cell === 2 && <div className="w-8 h-8 rounded-full bg-yellow-400" />}
            </div>
          )))}
        </div>
      </div>

      {!isFinished && (
        <Button variant="outline" className="w-full mt-6" onClick={() => setConfirmForfeit(true)}>
          <Flag className="w-4 h-4 mr-2" /> Forfait
        </Button>
      )}

      <Dialog open={confirmForfeit} onOpenChange={setConfirmForfeit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmer le forfait ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Ton adversaire remportera le pot.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmForfeit(false)}>Annuler</Button>
            <Button variant="destructive" onClick={forfeit}>Déclarer forfait</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}