import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminCeremony } from '@/components/BallonDorPage';
import { BALLON_DOR_SESSION_ID, type BallonDorConfig } from '@/lib/ballonDorData';

const DEFAULT_CFG: BallonDorConfig = {
  buy_in: 100,
  total_prize_pool: 10000,
  payout_percentages: { first: 50, second: 30, third: 20 },
  official_top10: [],
  official_kopa: '',
  official_yashin: '',
  deadline_iso: '',
  admin_unlock_iso: '',
};

/**
 * Panneau admin « Direct Cérémonie » du concours Ballon d'Or 2026 :
 * saisie du Top 10 officiel, lauréats Kopa / Yachine, verrouillage
 * des pronostics et clôture avec distribution de la cagnotte.
 */
export default function AdminBallonDor() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('active');
  const [cfg, setCfg] = useState<BallonDorConfig>(DEFAULT_CFG);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('game_sessions')
      .select('status, config')
      .eq('id', BALLON_DOR_SESSION_ID)
      .maybeSingle();
    if (data) {
      setStatus(data.status as string);
      setCfg({ ...DEFAULT_CFG, ...((data.config as any) || {}) });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-ballon-dor')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${BALLON_DOR_SESSION_ID}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  if (loading) {
    return <div className="py-10 text-center text-muted-foreground">Chargement…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="font-display text-lg">🏆 Ballon d'Or 2026 — Direct Cérémonie</h3>
        <p className="text-sm text-muted-foreground">
          Session {status === 'closed' ? '🔴 clôturée' : status === 'active' ? '🟢 active' : status} ·
          Cagnotte {cfg.total_prize_pool.toLocaleString('fr-FR')} DC · Buy-in {cfg.buy_in} DC
        </p>
        <p className="text-xs text-muted-foreground">
          Saisis le classement officiel au fur et à mesure de la cérémonie, sauvegarde l'avancement
          pour recalculer les points en direct, puis clôture pour distribuer la cagnotte
          (rake 5 % sur les gains nets, 50/30/20).
        </p>
      </div>
      <AdminCeremony cfg={cfg} status={status} onDone={load} />
    </div>
  );
}
