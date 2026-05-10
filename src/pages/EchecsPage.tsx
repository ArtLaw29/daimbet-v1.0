import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Flag } from 'lucide-react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const fmt = (s: number) => {
  if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export default function EchecsPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opponentOnline, setOpponentOnline] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [now, setNow] = useState(Date.now());
  const channelRef = useRef<any>(null);
  const finishingRef = useRef(false);

  const isP1 = user?.id === session?.player1_id;
  const opponentId = isP1 ? session?.player2_id : session?.player1_id;
  const myColor: 'w' | 'b' = isP1 ? 'w' : 'b';
  const state = session?.game_state || {};
  const fen = state.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const mode: string = state.mode || 'normal';

  const chess = useMemo(() => {
    const c = new Chess();
    try { c.load(fen); } catch {}
    return c;
  }, [fen]);
  const turn = chess.turn();
  const isMyTurn = turn === myColor;

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const { data } = await supabase.from('games_sessions').select('*').eq('id', sessionId).maybeSingle();
      setSession(data);
      setLoading(false);
    })();
    const ch = supabase.channel(`echecs-${sessionId}`)
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

  // Tick clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const lastMoveAt = (state.last_move_at || 0) * 1000;
  const elapsed = lastMoveAt ? Math.max(0, (now - lastMoveAt) / 1000) : 0;
  const clockWhite = Math.max(0, (state.clock_white ?? 0) - (turn === 'w' ? elapsed : 0));
  const clockBlack = Math.max(0, (state.clock_black ?? 0) - (turn === 'b' ? elapsed : 0));
  const myClock = myColor === 'w' ? clockWhite : clockBlack;
  const oppClock = myColor === 'w' ? clockBlack : clockWhite;

  // Time-out detection
  useEffect(() => {
    if (!session || session.status === 'termine' || finishingRef.current) return;
    if (clockWhite <= 0 || clockBlack <= 0) {
      const loserColor = clockWhite <= 0 ? 'w' : 'b';
      const winnerId = (loserColor === 'w') === isP1 ? opponentId : user?.id;
      if (!winnerId) return;
      finishingRef.current = true;
      (async () => {
        await supabase.rpc('finish_duel', { p_session_id: sessionId, p_winner_id: winnerId });
        await refreshProfile();
      })();
    }
  }, [clockWhite, clockBlack, session, isP1, opponentId, user?.id, sessionId, refreshProfile]);

  const finishGame = async (winnerId: string | null, msg: string) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await supabase.rpc('finish_duel', { p_session_id: sessionId, p_winner_id: winnerId });
    await refreshProfile();
    if (winnerId === user?.id) toast.success(`🏆 ${msg}`);
    else if (winnerId === null) toast.info(`🤝 ${msg}`);
    else toast.error(`💀 ${msg}`);
  };

  const onPieceDrop = ({ sourceSquare, targetSquare }: any): boolean => {
    if (!isMyTurn || session.status === 'termine' || !targetSquare) return false;
    const c = new Chess(fen);
    let move;
    try { move = c.move({ from: sourceSquare, to: targetSquare, promotion: 'q' }); } catch { return false; }
    if (!move) return false;

    // Update clocks
    const newWhite = clockWhite, newBlack = clockBlack;
    const newState: any = {
      ...state,
      fen: c.fen(),
      clock_white: turn === 'w' ? newWhite : state.clock_white,
      clock_black: turn === 'b' ? newBlack : state.clock_black,
      last_move_at: Date.now() / 1000,
    };

    (async () => {
      await supabase.from('games_sessions').update({
        game_state: newState,
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId);

      if (c.isCheckmate()) await finishGame(user!.id, 'Échec et mat !');
      else if (c.isStalemate()) await finishGame(null, 'Pat — match nul');
      else if (c.isDraw()) await finishGame(null, 'Nulle');
    })();
    return true;
  };

  const forfeit = async () => {
    setConfirmForfeit(false);
    await finishGame(opponentId, 'Forfait');
  };

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
        <h1 className="text-3xl font-display gold-text">♟️ Échecs</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Toi : {myColor === 'w' ? '⚪ Blancs' : '⚫ Noirs'} · Mode : {mode} · Pot : {session.mise_player1 + session.mise_player2} DC
        </p>
        <div className="flex items-center justify-center gap-2 mt-1 text-xs">
          <span className={`w-2 h-2 rounded-full ${opponentOnline ? 'bg-success' : 'bg-destructive'}`}></span>
          <span className="text-muted-foreground">Adversaire {opponentOnline ? 'en ligne' : 'hors ligne'}</span>
        </div>
      </div>

      <div className="flex justify-between mb-2 text-sm font-mono">
        <div className="px-3 py-1 rounded bg-muted">Adv : {fmt(oppClock)}</div>
        <div className={`px-3 py-1 rounded ${isMyTurn && !isFinished ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>Toi : {fmt(myClock)}</div>
      </div>

      {isFinished ? (
        <Card className={`p-5 mb-4 text-center ${winnerIsMe ? 'border-success' : session.winner_id ? 'border-destructive' : 'border-border'}`}>
          <p className="text-4xl mb-1">{winnerIsMe ? '🏆' : session.winner_id ? '💀' : '🤝'}</p>
          <p className="font-display text-lg">{winnerIsMe ? `Victoire ! +${session.mise_player1 + session.mise_player2} DC` : session.winner_id ? 'Défaite' : 'Match nul'}</p>
        </Card>
      ) : (
        <p className="text-center text-sm mb-3 font-semibold">{isMyTurn ? '🎯 À toi de jouer' : '⏳ Tour de l\'adversaire'}</p>
      )}

      <div className="rounded-lg overflow-hidden">
        <Chessboard
          options={{
            position: fen,
            onPieceDrop,
            boardOrientation: myColor === 'w' ? 'white' : 'black',
            allowDragging: !isFinished && isMyTurn,
            id: `echecs-${sessionId}`,
          } as any}
        />
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
