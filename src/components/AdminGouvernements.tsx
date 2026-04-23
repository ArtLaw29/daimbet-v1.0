import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Landmark } from 'lucide-react';

interface GouvRow {
  id: string;
  user_id: string;
  created_at: string;
  data: {
    ministers?: Record<string, string>;
    custom_ministries?: { name: string; person: string }[];
    gov_number?: number;
    gov_name?: string;
  };
}

interface ProfileLite {
  user_id: string;
  display_name: string;
  emoji: string | null;
}

export default function AdminGouvernements() {
  const [gouvs, setGouvs] = useState<GouvRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Lookup the active gouvernement session dynamically (survives nuclear resets)
      const { data: govSession } = await supabase
        .from('game_sessions')
        .select('id')
        .eq('game_type', 'gouvernement')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!govSession) {
        setGouvs([]);
        setProfiles({});
        setLoading(false);
        return;
      }

      const [{ data: parts }, { data: profs }] = await Promise.all([
        supabase
          .from('game_participations')
          .select('id, user_id, created_at, data')
          .eq('session_id', govSession.id)
          .order('created_at', { ascending: false }),
        (supabase as any).from('profiles_public').select('user_id, display_name, emoji'),
      ]);
      setGouvs((parts as any[]) || []);
      const map: Record<string, ProfileLite> = {};
      (profs || []).forEach((p: any) => { map[p.user_id] = p; });
      setProfiles(map);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  const filtered = gouvs.filter(g => (g.data.custom_ministries || []).some(cm => cm?.name?.trim()));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-display flex items-center gap-2">
          <Landmark className="w-4 h-4 text-primary" /> Ministères personnalisés à modérer
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Vue des intitulés libres créés par les utilisateurs. Les 14 postes fixes ne sont pas affichés.
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Aucun ministère personnalisé pour le moment.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(g => {
            const pr = profiles[g.user_id];
            const customs = (g.data.custom_ministries || []).filter(cm => cm?.name?.trim());
            return (
              <div key={g.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{pr?.emoji || '🦌'}</span>
                    <span className="font-semibold text-sm truncate">
                      {pr?.display_name || 'Inconnu'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Gouvernement #{g.data.gov_number || '?'}
                      {g.data.gov_name ? ` — ${g.data.gov_name}` : ''}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(g.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <div className="space-y-1.5 pl-1">
                  {customs.map((cm, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-secondary/50">
                      <span className="text-primary">📝</span>
                      <span className="font-medium flex-1 truncate">{cm.name}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-semibold">{cm.person || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
