import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGameConfig } from './useGameConfig';

/**
 * Compte combien de parties l'utilisateur a jouées aujourd'hui pour ce jeu
 * (jour calendaire Europe/Paris) et compare au plafond stocké dans game_config.
 * Recharge à chaque insert via realtime sur daily_plays.
 */
function parisDayStartISO(): string {
  const now = new Date();
  const parisDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now); // YYYY-MM-DD
  // Minuit Paris = soit 22h UTC (été) soit 23h UTC (hiver). On envoie l'ISO local +offset.
  const offsetMin = parseOffsetMinutes(now);
  // Construct date string with current Paris offset
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${parisDay}T00:00:00${sign}${hh}:${mm}`;
}

function parseOffsetMinutes(d: Date): number {
  // Offset of Paris vs UTC in minutes (positive for east of UTC).
  const parisString = d.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const utcString = d.toLocaleString('en-US', { timeZone: 'UTC' });
  const parisDate = new Date(parisString);
  const utcDate = new Date(utcString);
  return Math.round((parisDate.getTime() - utcDate.getTime()) / 60000);
}

const DEFAULT_KEY = 'maxPlaysPerDay';

export function useDailyLimit(gameKey: string, maxField: string = DEFAULT_KEY) {
  const { user } = useAuth();
  const { config } = useGameConfig<Record<string, any>>(gameKey);
  const [playsToday, setPlaysToday] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const maxPlays = Number((config as any)?.[maxField] ?? 0); // 0 = illimité

  const refresh = useCallback(async () => {
    if (!user) { setPlaysToday(0); setLoading(false); return; }
    const since = parisDayStartISO();
    const { count } = await supabase
      .from('daily_plays' as any)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('game_key', gameKey)
      .gte('played_at', since);
    setPlaysToday(count ?? 0);
    setLoading(false);
  }, [user, gameKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const recordPlay = useCallback(async () => {
    if (!user) return false;
    const { error } = await supabase
      .from('daily_plays' as any)
      .insert({ user_id: user.id, game_key: gameKey });
    if (!error) await refresh();
    return !error;
  }, [user, gameKey, refresh]);

  const canPlay = maxPlays > 0 ? playsToday < maxPlays : true;

  return { playsToday, maxPlays, canPlay, recordPlay, refresh, loading };
}