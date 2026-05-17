import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Realtime subscription to a row of public.game_config.
 * Returns the JSON config (or null while loading / missing).
 */
export function useGameConfig<T = Record<string, any>>(gameKey: string) {
  const [config, setConfig] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const fetchIt = async () => {
      const { data } = await supabase
        .from('game_config' as any)
        .select('config')
        .eq('game_key', gameKey)
        .maybeSingle();
      if (!alive) return;
      setConfig(((data as any)?.config as T) ?? null);
      setLoading(false);
    };
    fetchIt();
    const channel = supabase
      .channel(`game_config:${gameKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_config', filter: `game_key=eq.${gameKey}` },
        () => fetchIt(),
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [gameKey]);

  return { config, loading };
}