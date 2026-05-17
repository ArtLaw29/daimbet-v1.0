import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type GameStatus = { suspended: boolean; hidden: boolean; loading: boolean };

const cache = new Map<string, { suspended: boolean; hidden: boolean }>();
const listeners = new Map<string, Set<(s: { suspended: boolean; hidden: boolean }) => void>>();
let allLoaded = false;
let allLoadingPromise: Promise<void> | null = null;
let channelStarted = false;

function notify(key: string, s: { suspended: boolean; hidden: boolean }) {
  cache.set(key, s);
  listeners.get(key)?.forEach(fn => fn(s));
}

async function loadAll() {
  if (allLoaded) return;
  if (allLoadingPromise) return allLoadingPromise;
  allLoadingPromise = (async () => {
    const { data, error } = await supabase.from('game_status').select('game_key, suspended, hidden');
    if (error) {
      allLoadingPromise = null;
      throw error;
    }
    (data || []).forEach((row: any) => {
      cache.set(row.game_key, { suspended: !!row.suspended, hidden: !!row.hidden });
    });
    allLoaded = true;
    // notify all listeners
    listeners.forEach((set, key) => {
      const s = cache.get(key) || { suspended: false, hidden: false };
      set.forEach(fn => fn(s));
    });
  })();
  return allLoadingPromise;
}

function startChannel() {
  if (channelStarted) return;
  channelStarted = true;
  supabase
    .channel('game_status_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_status' }, (payload: any) => {
      const row = payload.new || payload.old;
      if (!row?.game_key) return;
      if (payload.eventType === 'DELETE') {
        cache.delete(row.game_key);
        notify(row.game_key, { suspended: false, hidden: false });
      } else {
        notify(row.game_key, { suspended: !!row.suspended, hidden: !!row.hidden });
      }
    })
    .subscribe();
}

export function useGameStatus(gameKey: string | null | undefined): GameStatus {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<{ suspended: boolean; hidden: boolean }>(
    gameKey ? cache.get(gameKey) || { suspended: false, hidden: false } : { suspended: false, hidden: false }
  );
  const [loading, setLoading] = useState(authLoading || !allLoaded);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!user || !gameKey) { setLoading(false); return; }
    let alive = true;
    const fn = (s: { suspended: boolean; hidden: boolean }) => { if (alive) setState(s); };
    if (!listeners.has(gameKey)) listeners.set(gameKey, new Set());
    listeners.get(gameKey)!.add(fn);
    startChannel();
    loadAll()
      .then(() => {
        if (!alive) return;
        setState(cache.get(gameKey) || { suspended: false, hidden: false });
        setLoading(false);
      })
      .catch((error) => {
        console.error('Erreur chargement game_status:', error);
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      listeners.get(gameKey)?.delete(fn);
    };
  }, [authLoading, user?.id, gameKey]);

  return { ...state, loading };
}

/** Returns a map of all known game_keys → status. Re-renders on realtime updates. */
export function useAllGameStatus() {
  const { user, loading: authLoading } = useAuth();
  const [snapshot, setSnapshot] = useState<Record<string, { suspended: boolean; hidden: boolean }>>(() => Object.fromEntries(cache));
  const [loading, setLoading] = useState(authLoading || !allLoaded);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      setSnapshot({});
      setLoading(false);
      return;
    }

    let alive = true;
    startChannel();
    const refresh = () => { if (alive) setSnapshot(Object.fromEntries(cache)); };
    // Subscribe to all current keys
    const wrappers: Array<{ key: string; fn: (s: any) => void }> = [];
    const subscribeAll = () => {
      cache.forEach((_, key) => {
        const fn = () => refresh();
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key)!.add(fn);
        wrappers.push({ key, fn });
      });
    };
    loadAll()
      .then(() => {
        if (!alive) return;
        subscribeAll();
        refresh();
        setLoading(false);
      })
      .catch((error) => {
        console.error('Erreur chargement game_status:', error);
        if (alive) setLoading(false);
      });
    // Re-subscribe periodically for new keys (cheap)
    const interval = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(interval);
      wrappers.forEach(w => listeners.get(w.key)?.delete(w.fn));
    };
  }, [authLoading, user?.id]);

  return { statuses: snapshot, loading };
}