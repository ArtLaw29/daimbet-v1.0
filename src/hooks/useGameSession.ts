import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type Updater<T> = T | ((prev: T) => T);

interface Options<T> {
  gameType: string;
  initialState: T;
  roomId?: string | null;
  /** When false, the hook stays idle (no load, no insert). Useful when the key isn't ready yet. */
  enabled?: boolean;
}

/**
 * Generic per-user game session persistence.
 *
 * - On mount (and whenever the key changes): looks for the most recent row
 *   in `game_state_sessions` with `completed_at IS NULL` for this user / game_type
 *   (+ optional room_id). If none, inserts a new one.
 * - Every `setState` updates local state synchronously and debounces (500 ms) a write to DB.
 * - Always mirrors to localStorage for offline-first fallback.
 * - `resetSession()` marks the current session completed and opens a fresh one.
 *
 * Designed to work for solo games today and multiplayer rooms tomorrow (via `roomId`).
 */
export function useGameSession<T>({
  gameType,
  initialState,
  roomId = null,
  enabled = true,
}: Options<T>) {
  const { user } = useAuth();
  const [state, setStateRaw] = useState<T>(initialState);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const sessionIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialStateRef = useRef(initialState);
  initialStateRef.current = initialState;

  const lsKey = `gs_${gameType}_${user?.id ?? 'anon'}`;

  // Load / bootstrap session whenever the identity of the session changes.
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      sessionIdRef.current = null;
      let loaded: T | null = null;

      // localStorage fallback first (instant + works offline)
      try {
        const raw = localStorage.getItem(lsKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && 'state' in parsed) loaded = parsed.state as T;
        }
      } catch {
        /* ignore */
      }

      if (user) {
        try {
          let q: any = supabase
            .from('game_state_sessions' as any)
            .select('id, state')
            .eq('user_id', user.id)
            .eq('game_type', gameType)
            .is('completed_at', null)
            .order('updated_at', { ascending: false })
            .limit(1);
          q = roomId ? q.eq('room_id', roomId) : q.is('room_id', null);
          const { data, error } = await q.maybeSingle();
          if (cancelled) return;

          if (!error && data) {
            sessionIdRef.current = (data as any).id;
            loaded = (data as any).state as T;
          } else if (!error) {
            const payload: any = {
              user_id: user.id,
              game_type: gameType,
              state: (loaded ?? initialStateRef.current) as any,
            };
            if (roomId) payload.room_id = roomId;
            const { data: inserted } = await supabase
              .from('game_state_sessions' as any)
              .insert(payload)
              .select('id')
              .single();
            if (!cancelled && inserted) sessionIdRef.current = (inserted as any).id;
          }
        } catch {
          /* offline → localStorage fallback already applied */
        }
      }

      if (cancelled) return;
      setStateRaw(loaded ?? initialStateRef.current);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, gameType, roomId, enabled]);

  const flush = useCallback(
    async (next: T) => {
      if (!user || !sessionIdRef.current) return;
      try {
        await supabase
          .from('game_state_sessions' as any)
          .update({ state: next as any, updated_at: new Date().toISOString() })
          .eq('id', sessionIdRef.current);
      } catch {
        /* silent — localStorage holds the truth */
      }
    },
    [user?.id],
  );

  const persist = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(lsKey, JSON.stringify({ state: next, at: Date.now() }));
      } catch {
        /* ignore quota */
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flush(next);
      }, 500);
    },
    [lsKey, flush],
  );

  const setState = useCallback(
    (updater: Updater<T>) => {
      setStateRaw((prev) => {
        const next =
          typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetSession = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    try {
      localStorage.removeItem(lsKey);
    } catch {
      /* ignore */
    }
    if (user && sessionIdRef.current) {
      try {
        await supabase
          .from('game_state_sessions' as any)
          .update({ completed_at: new Date().toISOString() })
          .eq('id', sessionIdRef.current);
      } catch {
        /* ignore */
      }
      sessionIdRef.current = null;
      const payload: any = {
        user_id: user.id,
        game_type: gameType,
        state: initialStateRef.current as any,
      };
      if (roomId) payload.room_id = roomId;
      try {
        const { data: inserted } = await supabase
          .from('game_state_sessions' as any)
          .insert(payload)
          .select('id')
          .single();
        if (inserted) sessionIdRef.current = (inserted as any).id;
      } catch {
        /* ignore */
      }
    }
    setStateRaw(initialStateRef.current);
  }, [user?.id, gameType, roomId, lsKey]);

  return { state, setState, resetSession, isLoading };
}
