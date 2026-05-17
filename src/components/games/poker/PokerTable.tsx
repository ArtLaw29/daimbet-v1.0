import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Trophy, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PokerCard from './PokerCard';
import ChipStack from './ChipStack';
import BetInput from '@/components/games/BetInput';

interface PlayerState {
  stack: number; bet_this_round: number; total_invested: number;
  status: 'active' | 'folded' | 'all_in' | 'sitting_out'; has_acted: boolean;
}
interface PokerPublic {
  round_number: number; buy_in: number; small_blind: number; big_blind: number;
  phase: 'waiting'|'preflop'|'flop'|'turn'|'river'|'showdown';
  community: string[]; pot: number; current_bet: number; min_raise: number;
  seat_order: string[]; dealer_index: number; small_blind_index: number;
  big_blind_index: number; current_player_index: number;
  player_states: Record<string, PlayerState>;
  hand_counts: Record<string, number>;
  last_action: { userId: string; action: string; amount?: number } | null;
  winners: { userId: string; amount: number; hand_name: string }[] | null;
  log: string[]; my_hand: string[];
  revealed_hands: Record<string, string[]>;
}
interface ProfileLite { user_id: string; display_name: string | null; emoji: string | null }

const TURN_TIMEOUT_MS = 30000;
const PHASE_LABEL: Record<string, string> = {
  waiting: 'En attente', preflop: 'Préflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Abattage',
};

export default function PokerTable({ roomId }: { roomId: string }) {
  const { user } = useAuth();
  const [state, setState] = useState<PokerPublic | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [busy, setBusy] = useState(false);
  const [raiseValue, setRaiseValue] = useState(0);
  const [turnStartedAt, setTurnStartedAt] = useState<number>(Date.now());
  const [now, setNow] = useState(Date.now());
  const lastTurnRef = useRef<string | null>(null);
  const autoFoldFiredRef = useRef(false);
  const startedRef = useRef(false);

  const call = async (payload: Record<string, any>) => {
    if (!user) return null;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('poker-action', {
        body: { ...payload, room_id: roomId },
      });
      if (error) { toast.error(error.message); return null; }
      const res = data as any;
      if (res?.error) { toast.error(res.error); return null; }
      if (res?.state) setState(res.state as PokerPublic);
      return res?.state ?? null;
    } finally { setBusy(false); }
  };

  // Initial: fetch state, if none exist try to start (creator only — server enforces)
  useEffect(() => {
    (async () => {
      const s = await call({ type: 'get_state' });
      if (!s && !startedRef.current) {
        startedRef.current = true;
        await call({ type: 'start' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Realtime via game_rooms.state_version bumps
  useEffect(() => {
    const ch = supabase
      .channel(`poker:${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` },
        () => call({ type: 'get_state' }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Tick for timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Load profiles for seated players
  useEffect(() => {
    if (!state) return;
    const missing = state.seat_order.filter(p => !profiles[p]);
    if (!missing.length) return;
    supabase.from('profiles').select('user_id, display_name, emoji').in('user_id', missing).then(({ data }) => {
      const next = { ...profiles };
      for (const p of (data ?? []) as any[]) next[p.user_id] = p;
      setProfiles(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.seat_order.join(',')]);

  // Reset turn timer whenever current player changes
  useEffect(() => {
    if (!state) return;
    const key = `${state.round_number}-${state.phase}-${state.current_player_index}`;
    if (key !== lastTurnRef.current) {
      lastTurnRef.current = key;
      setTurnStartedAt(Date.now());
      autoFoldFiredRef.current = false;
    }
  }, [state?.round_number, state?.phase, state?.current_player_index]);

  const me = user?.id;
  const myTurn = !!state && !!me && state.seat_order[state.current_player_index] === me
    && state.phase !== 'waiting' && state.phase !== 'showdown';
  const myState = me && state ? state.player_states[me] : null;
  const toCall = myState && state ? Math.max(0, state.current_bet - myState.bet_this_round) : 0;

  // Auto-fold on timeout (client-side)
  useEffect(() => {
    if (!myTurn || !state) return;
    const elapsed = now - turnStartedAt;
    if (elapsed >= TURN_TIMEOUT_MS && !autoFoldFiredRef.current && !busy) {
      autoFoldFiredRef.current = true;
      const action = toCall === 0 ? 'check' : 'fold';
      call({ type: 'action', action });
    }
  }, [now, myTurn, turnStartedAt, busy, state, toCall]);

  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-2" />
        <p>Chargement de la table…</p>
      </div>
    );
  }

  const isCreator = me === state.seat_order[0]; // creator was first joined
  const winnerIds = new Set((state.winners ?? []).map(w => w.userId));
  const remainingSeconds = Math.max(0, Math.ceil((TURN_TIMEOUT_MS - (now - turnStartedAt)) / 1000));
  const timerPct = myTurn ? Math.max(0, 100 - ((now - turnStartedAt) / TURN_TIMEOUT_MS) * 100) : 0;

  const nameOf = (id: string) => profiles[id]?.display_name || id.slice(0, 6);
  const emojiOf = (id: string) => profiles[id]?.emoji || '🦌';

  const opponents = state.seat_order.filter(id => id !== me);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>Main #{state.round_number} · {PHASE_LABEL[state.phase]}</span>
        <span>SB {state.small_blind} / BB {state.big_blind}</span>
      </div>

      {/* Oval table */}
      <div className="relative mx-auto" style={{ maxWidth: '720px' }}>
        <div className="relative aspect-[2/1.2] rounded-[50%] bg-gradient-to-br from-emerald-800 to-emerald-950 border-8 border-amber-900/60 shadow-2xl overflow-hidden">
          {/* Center: community + pot */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider text-emerald-200/70">Pot</div>
              <div className="text-2xl sm:text-3xl font-display gold-text">{state.pot} DC</div>
            </div>
            <div className="flex gap-1 sm:gap-1.5">
              {[0,1,2,3,4].map(i => (
                <PokerCard key={i} card={state.community[i]} hidden={!state.community[i]} small />
              ))}
            </div>
            {state.last_action && state.phase !== 'showdown' && (
              <div className="text-[10px] text-emerald-200/70">
                Dernière : {nameOf(state.last_action.userId)} {state.last_action.action}
                {state.last_action.amount ? ` (${state.last_action.amount})` : ''}
              </div>
            )}
          </div>

          {/* Opponents distributed around */}
          {opponents.map((id, i) => {
            const total = opponents.length || 1;
            // distribute on a semicircle on top of table
            const t = (i + 1) / (total + 1);
            const angle = Math.PI - t * Math.PI; // 180° to 0°
            const x = 50 + Math.cos(angle) * 42;
            const y = 50 - Math.sin(angle) * 38;
            const ps = state.player_states[id];
            const isCurrent = state.seat_order[state.current_player_index] === id && state.phase !== 'showdown';
            const isWinner = winnerIds.has(id);
            return (
              <div key={id}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 transition-all ${
                  isCurrent ? 'scale-105' : ''
                } ${ps?.status === 'folded' ? 'opacity-40 grayscale' : ''}`}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <div className={`rounded-full px-2 py-1 bg-black/60 backdrop-blur border ${
                  isCurrent ? 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)] animate-pulse' :
                  isWinner ? 'border-amber-400' : 'border-white/20'
                } text-white text-xs text-center min-w-[80px]`}>
                  <div className="font-semibold truncate max-w-[100px]">{emojiOf(id)} {nameOf(id)}</div>
                  <div className="text-[10px] text-amber-300">{ps?.stack ?? 0} DC</div>
                </div>
                <div className="flex gap-0.5">
                  {state.phase === 'showdown' && state.revealed_hands[id]?.length
                    ? state.revealed_hands[id].map((c, k) => <PokerCard key={k} card={c} small />)
                    : Array.from({ length: state.hand_counts[id] ?? 0 }).map((_, k) =>
                        <PokerCard key={k} hidden small />
                      )
                  }
                </div>
                {ps && ps.status === 'all_in' && <Badge className="text-[9px] bg-orange-500">All-in</Badge>}
                {ps && ps.status === 'folded' && <Badge variant="secondary" className="text-[9px]">Couché</Badge>}
                {ps && ps.bet_this_round > 0 && state.phase !== 'showdown' && (
                  <div className="flex items-center gap-1 text-[10px] text-amber-200">
                    <ChipStack amount={ps.bet_this_round} small />
                    <span>{ps.bet_this_round}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Me — below table */}
        {me && state.player_states[me] && (
          <div className={`mt-3 flex flex-col items-center ${state.player_states[me].status === 'folded' ? 'opacity-50' : ''}`}>
            <div className="flex gap-1.5 mb-2">
              {state.my_hand.length > 0
                ? state.my_hand.map((c, i) => <PokerCard key={i} card={c} highlight={winnerIds.has(me)} />)
                : <PokerCard hidden />}
            </div>
            <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-1.5">
              <div className="text-sm">
                <strong>{emojiOf(me)} {nameOf(me)}</strong>
                <span className="text-muted-foreground"> · Stack {state.player_states[me].stack} DC</span>
              </div>
              <ChipStack amount={state.player_states[me].stack} small />
            </div>
          </div>
        )}
      </div>

      {/* Showdown winners */}
      <AnimatePresence>
        {state.phase === 'showdown' && state.winners && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border border-amber-500/40 p-4 text-center">
            <Trophy className="w-6 h-6 mx-auto text-amber-400 mb-1" />
            {state.winners.map((w, i) => (
              <div key={i} className="text-sm">
                <strong className="gold-text">{nameOf(w.userId)}</strong> remporte <strong>{w.amount} DC</strong>
                <span className="text-muted-foreground"> — {w.hand_name}</span>
              </div>
            ))}
            {isCreator && (
              <Button onClick={() => call({ type: 'start' })} disabled={busy} className="mt-3" size="sm">
                Prochaine main
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action panel */}
      {myTurn && myState && (
        <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Badge className="bg-amber-500 text-black">C'est votre tour !</Badge>
            <span className="text-xs text-muted-foreground">{remainingSeconds}s</span>
          </div>
          <div className="h-1.5 bg-muted rounded overflow-hidden">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${timerPct}%` }} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <ActionButton
              label="Se coucher" tip="Abandonner cette main. Vos mises sont perdues."
              disabled={busy} onClick={() => call({ type: 'action', action: 'fold' })}
            />
            {toCall === 0 ? (
              <ActionButton
                label="Checker" tip="Passer sans miser. Possible seulement si personne n'a misé."
                disabled={busy} onClick={() => call({ type: 'action', action: 'check' })} variant="secondary"
              />
            ) : (
              <ActionButton
                label={`Suivre (${toCall})`} tip={`Égaler la mise courante de ${toCall} DC.`}
                disabled={busy || toCall > myState.stack} onClick={() => call({ type: 'action', action: 'call' })}
                variant="secondary"
              />
            )}
            <ActionButton
              label={`Tapis (${myState.stack})`} tip={`Miser tous vos DC restants (${myState.stack} DC).`}
              disabled={busy || myState.stack <= 0}
              onClick={() => call({ type: 'action', action: 'all_in' })}
              variant="destructive"
            />
          </div>

          {/* Raise */}
          <div className="border-t border-border pt-3">
            <div className="text-xs text-muted-foreground mb-1">Relancer — total souhaité (min {state.current_bet + state.min_raise})</div>
            <BetInput
              value={raiseValue || (state.current_bet + state.min_raise)}
              onChange={setRaiseValue}
              min={state.current_bet + state.min_raise}
              max={myState.bet_this_round + myState.stack}
              balance={myState.bet_this_round + myState.stack}
              onBet={() => call({ type: 'action', action: 'raise', amount: raiseValue || (state.current_bet + state.min_raise) })}
              betLabel="Relancer"
              disabled={busy}
              quickSteps={[state.big_blind * 2, state.big_blind * 3]}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Augmenter la mise. Entrez le montant total souhaité.</p>
          </div>
        </div>
      )}

      {!myTurn && state.phase !== 'showdown' && state.phase !== 'waiting' && (
        <p className="text-center text-xs text-muted-foreground">
          En attente de <strong>{nameOf(state.seat_order[state.current_player_index])}</strong>…
        </p>
      )}
    </div>
  );
}

function ActionButton({ label, tip, disabled, onClick, variant }: {
  label: string; tip: string; disabled?: boolean; onClick: () => void;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}) {
  return (
    <div className="flex flex-col">
      <Button size="sm" variant={variant || 'default'} disabled={disabled} onClick={onClick}>{label}</Button>
      <span className="text-[10px] text-muted-foreground mt-1 leading-tight">{tip}</span>
    </div>
  );
}