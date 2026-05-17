import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Cooldown per user+key persisted in localStorage. Re-renders every second.
 * Survives page refresh, not multi-device.
 */
export function useCooldown(key: string, durationSec: number) {
  const { user } = useAuth();
  const storageKey = `cooldown:${user?.id ?? 'anon'}:${key}`;
  const [lastPlayAt, setLastPlayAt] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return Number(localStorage.getItem(storageKey) || 0);
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setLastPlayAt(Number(localStorage.getItem(storageKey) || 0));
  }, [storageKey]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((lastPlayAt + durationSec * 1000 - now) / 1000));
  const canPlay = secondsLeft <= 0;

  const trigger = useCallback(() => {
    const t = Date.now();
    setLastPlayAt(t);
    try { localStorage.setItem(storageKey, String(t)); } catch {}
  }, [storageKey]);

  return { secondsLeft, canPlay, trigger };
}