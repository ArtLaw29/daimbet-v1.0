import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, RotateCcw, RotateCw } from 'lucide-react';
import UnoCard from './UnoCard';
import { UnoPublicState, UnoColor, UNO_COLOR_CLASS, UNO_COLOR_LABEL, canPlayClient } from './logic';

interface Props { roomId: string }

interface ProfileLite { user_id: string; display_name: string | null; emoji: string | null }

export default function UnoGame({ roomId }: Props) {
  const { user } = useAuth();
  const [state, setState] = useState<UnoPublicState | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const startedRef = useRef(false);

  const callAction = async (payload: Record<string, any>): Promise<UnoPublicState | null> => {
    if (!user) return null;
    try {
      const { data, error } = await supabase.functions.invoke('uno-action', {
        body: { ...payload, room_id: roomId },
      });
      if (error) {
        toast.error(error.message);
        return null;
      }
      const res = data as any;
      if (res?.error) { toast.error(res.error); return null; }
      if (res?.state) setState(res.state as UnoPublicState);
      return res?.state ?? null;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };

  const refresh = () => callAction({ type: 'get_state' });

  // Initial load + start if needed (creator only — server checks)
  useEffect(() => {
    (async () => {
      const s = await callAction({ type: 'get_state' });
      if (!s && !startedRef.current) {
        startedRef.current = true;
        await callAction({ type: 'start' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Subscribe to room state_version bumps
  useEffect(() => {
    const ch = supabase
      .channel(`uno:${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, () => {
        refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Tick for UNO window countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Load profiles
  useEffect(() => {
    if (!state) return;
    const missing = state.players.filter(p => !profiles[p]);
    if (!missing.length) return;
    supabase.from('profiles').select('user_id, display_name, emoji').in('user_id', missing).then(({ data }) => {
      const next = { ...profiles };
      for (const p of (data ?? []) as any[]) next[p.user_id] = p;
      setProfiles(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.players]);

  // Auto-refresh when UNO window expires
  useEffect(() => {
    if (!state?.uno_window || state.uno_window.resolved !== null) return;
    const ms = Math.max(0, state.uno_window.expires_at - Date.now()) + 200;
    const t = setTimeout(() => refresh(), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.uno_window?.expires_at, state?.uno_window?.resolved]);

  if (!state) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Préparation de la partie…
      </div>
    );
  }

  const me = user?.id ?? '';
  const isMyTurn = state.current_player === me;
  const myHand = state.your_hand;
  const top = state.discard_top;

  const playable = useMemo(() => {
    if (!top) return new Set<string>();
    const set = new Set<string>();
    for (const c of myHand) {
      if (canPlayClient(c, top, state.current_color, state.pending_draw)) set.add(c.id);
    }
    return set;
  }, [myHand, top, state.current_color, state.pending_draw]);

  const onPlay = async (cardId: string) => {
    if (busy) return;
    setBusy(true);
    await callAction({ type: 'play', card_id: cardId });
    setBusy(false);
  };
  const onDraw = async () => {
    if (busy) return; setBusy(true);
    await callAction({ type: 'draw' });
    setBusy(false);
  };
  const onChooseColor = async (color: UnoColor) => {
    setBusy(true);
    await callAction({ type: 'choose_color', color });
    setBusy(false);
  };
  const onDeclareUno = () => callAction({ type: 'declare_uno' });
  const onCounterUno = () => callAction({ type: 'counter_uno' });

  // Reorder players to show others around (me at bottom is in hand area)
  const others = state.players.filter(p => p !== me);

  // Finished screen
  if (state.finished) {
    const winner = state.winner_id ? profiles[state.winner_id]?.display_name ?? 'Joueur' : '?';
    return (
      <div className="p-8 text-center space-y-3">
        <h2 className="font-display text-3xl">🏆 {winner} remporte la partie</h2>
        {state.pot > 0 && <p className="text-muted-foreground">Pot remporté : {state.pot} DC</p>}
      </div>
    );
  }

  const unoWindowActive = state.uno_window && state.uno_window.resolved === null && state.uno_window.expires_at > now;
  const unoSecondsLeft = unoWindowActive ? Math.ceil((state.uno_window!.expires_at - now) / 1000) : 0;
  const isUnoTarget = unoWindowActive && state.uno_window!.uid === me;

  return (
    <div className="flex flex-col h-full">
      {/* Opponents row */}
      <div className="flex flex-wrap justify-center gap-4 px-3 py-3 border-b">
        {others.map(uid => {
          const isTurn = state.current_player === uid;
          const count = state.hand_counts[uid] ?? 0;
          const prof = profiles[uid];
          return (
            <div key={uid} className={`flex flex-col items-center gap-1 p-2 rounded-lg ${isTurn ? 'ring-2 ring-amber-400 bg-amber-50/10' : ''}`}>
              <div className="text-xs">{prof?.emoji ?? '👤'} {prof?.display_name ?? 'Joueur'}</div>
              <div className="relative">
                <UnoCard card={{ id: 'back', color: 'wild', value: 'wild' }} faceDown size="sm" />
                <span className="absolute -top-2 -right-2 bg-background border rounded-full px-2 py-0.5 text-xs font-bold">{count}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Center: discard + draw + status */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          {state.direction === 1 ? <RotateCw className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
          Sens {state.direction === 1 ? 'horaire' : 'anti-horaire'}
          {state.pot > 0 && <span>· Pot : {state.pot} DC</span>}
        </div>

        {state.pending_draw && (
          <div className="px-3 py-2 rounded-md bg-destructive/20 border border-destructive text-sm font-bold">
            +{state.pending_draw.amount} en attente : contre-attaque avec un {state.pending_draw.type === 'plus2' ? '+2' : '+4'} ou pioche !
          </div>
        )}

        <div className="flex items-center gap-6">
          <button onClick={onDraw} disabled={!isMyTurn || busy || state.pending_color_choice} className="disabled:opacity-50">
            <UnoCard card={{ id: 'd', color: 'wild', value: 'wild' }} faceDown size="lg" />
            <div className="text-[10px] mt-1 text-muted-foreground">Pioche ({state.draw_pile_count})</div>
          </button>
          {top && (
            <div className="flex flex-col items-center">
              <UnoCard card={{ ...top, color: top.color === 'wild' ? 'wild' : state.current_color }} size="lg" disabled />
              <div className={`mt-1 h-3 w-3 rounded-full border ${UNO_COLOR_CLASS[state.current_color]}`} title={UNO_COLOR_LABEL[state.current_color]} />
            </div>
          )}
        </div>

        {/* Color picker */}
        {state.pending_color_choice && isMyTurn && (
          <div className="space-y-2">
            <p className="text-sm text-center">Choisis une couleur :</p>
            <div className="flex gap-2">
              {(['r', 'y', 'g', 'b'] as UnoColor[]).map(c => (
                <button key={c} onClick={() => onChooseColor(c)} className={`w-12 h-12 rounded-full border-2 ${UNO_COLOR_CLASS[c]}`}>
                  {UNO_COLOR_LABEL[c][0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* UNO race buttons */}
        {unoWindowActive && (
          <div className="space-y-2 text-center">
            <div className="text-xs text-muted-foreground">⏱ {unoSecondsLeft}s</div>
            {isUnoTarget ? (
              <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-black font-display text-xl" onClick={onDeclareUno}>
                UNO !
              </Button>
            ) : (
              <Button size="lg" variant="destructive" className="font-display text-xl" onClick={onCounterUno}>
                CONTRE-UNO !
              </Button>
            )}
          </div>
        )}

        <div className="text-center text-sm">
          {isMyTurn ? <span className="font-bold text-amber-500">À toi de jouer</span> : (
            <span>Au tour de <strong>{profiles[state.current_player]?.display_name ?? '…'}</strong></span>
          )}
        </div>
      </div>

      {/* My hand */}
      <div className="border-t bg-card/50 px-2 py-3">
        <div className="text-xs text-center text-muted-foreground mb-1">
          Ta main ({myHand.length} cartes)
        </div>
        <div className="flex justify-center flex-wrap gap-1 sm:gap-2 -space-x-2 sm:space-x-0">
          {myHand.map(c => (
            <UnoCard
              key={c.id}
              card={c}
              size="md"
              highlight={isMyTurn && playable.has(c.id)}
              disabled={!isMyTurn || !playable.has(c.id) || busy || state.pending_color_choice}
              onClick={() => onPlay(c.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}