import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useCasinoSuspended(gameId: string) {
  const [suspended, setSuspended] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', `casino_suspend_${gameId}`)
        .maybeSingle();
      if (alive) {
        setSuspended(data?.value === 'true');
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [gameId]);
  return { suspended, loading };
}

export function CasinoSuspendedScreen({ label }: { label: string }) {
  return (
    <div className="container mx-auto px-4 py-20 text-center space-y-3">
      <p className="text-6xl">🚧</p>
      <h1 className="text-2xl font-display gold-text">{label}</h1>
      <p className="text-muted-foreground">Ce jeu est temporairement indisponible.</p>
    </div>
  );
}
