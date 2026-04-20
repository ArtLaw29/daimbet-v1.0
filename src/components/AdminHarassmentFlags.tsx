import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface Citation {
  prenom: string;
  source: string; // human-readable label
}

interface FlagRow {
  prenom: string;
  count: number;
  others_avg: number;
  ratio: number;
  sources: string[];
}

const FANTASY_SESSION_ID = '00000000-0000-0000-0000-000000000002';
const GOUV_SESSION_ID = '00000000-0000-0000-0000-000000000001';

export default function AdminHarassmentFlags() {
  const [loading, setLoading] = useState(true);
  const [citations, setCitations] = useState<Citation[]>([]);

  const load = async () => {
    setLoading(true);
    const all: Citation[] = [];

    // 1. Active game sessions (sondages, tournois)
    const { data: sessions } = await supabase
      .from('game_sessions')
      .select('id, title, game_type, status, config')
      .in('status', ['active', 'voting']);

    const sessionTitleById: Record<string, string> = {};
    (sessions || []).forEach((s: any) => {
      sessionTitleById[s.id] = s.title;
      // Pre-defined options inside config
      const opts = (s.config?.options || []) as string[];
      if (Array.isArray(opts) && (s.game_type === 'sondage' || s.game_type === 'tournoi')) {
        opts.forEach((o) => {
          if (typeof o === 'string' && o.trim()) {
            all.push({ prenom: o.trim(), source: `${s.game_type === 'sondage' ? 'Sondage' : 'Tournoi'} : ${s.title}` });
          }
        });
      }
    });

    // 2. Participations from active sondages/tournois (votes mentioning a name)
    if (sessions && sessions.length > 0) {
      const ids = sessions.map((s: any) => s.id);
      const { data: parts } = await supabase
        .from('game_participations')
        .select('session_id, data')
        .in('session_id', ids);
      (parts || []).forEach((p: any) => {
        const label = sessionTitleById[p.session_id] || 'Session';
        const d = p.data || {};
        if (typeof d.vote === 'string') all.push({ prenom: d.vote, source: `Vote : ${label}` });
        if (Array.isArray(d.votes)) d.votes.forEach((v: string) => typeof v === 'string' && all.push({ prenom: v, source: `Vote : ${label}` }));
        if (typeof d.predicted_winner === 'string') all.push({ prenom: d.predicted_winner, source: `Pronostic : ${label}` });
      });
    }

    // 3. Kiss/Marry — current month only
    const now = new Date();
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { data: kmResults } = await supabase.rpc('get_km_results', { p_month_year: monthYear });
    (kmResults || []).forEach((r: any) => {
      for (let i = 0; i < (r.vote_count || 0); i++) {
        all.push({ prenom: r.voted_prenom, source: `Kiss/Marry (${r.category}) — ${monthYear}` });
      }
    });

    // 4. Fantasy Firm & Gouvernement (active simulations)
    const { data: simParts } = await supabase
      .from('game_participations')
      .select('session_id, data')
      .in('session_id', [FANTASY_SESSION_ID, GOUV_SESSION_ID]);
    (simParts || []).forEach((p: any) => {
      const label = p.session_id === FANTASY_SESSION_ID ? 'Fantasy Firm' : 'Gouvernement';
      const d = p.data || {};
      if (Array.isArray(d.members)) {
        d.members.forEach((m: any) => m?.name && all.push({ prenom: m.name, source: label }));
      }
      if (d.ministers && typeof d.ministers === 'object') {
        Object.values(d.ministers).forEach((v: any) => typeof v === 'string' && v && all.push({ prenom: v, source: label }));
      }
      if (Array.isArray(d.custom_ministries)) {
        d.custom_ministries.forEach((cm: any) => cm?.person && all.push({ prenom: cm.person, source: label }));
      }
    });

    setCitations(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const flags: FlagRow[] = useMemo(() => {
    if (citations.length === 0) return [];
    // Aggregate counts per prenom
    const counts: Record<string, { count: number; sources: Set<string> }> = {};
    citations.forEach((c) => {
      const key = c.prenom.trim();
      if (!key) return;
      if (!counts[key]) counts[key] = { count: 0, sources: new Set() };
      counts[key].count += 1;
      counts[key].sources.add(c.source);
    });
    const entries = Object.entries(counts);
    if (entries.length < 2) return [];
    const totalCount = entries.reduce((sum, [, v]) => sum + v.count, 0);

    const result: FlagRow[] = [];
    entries.forEach(([prenom, v]) => {
      const othersTotal = totalCount - v.count;
      const othersAvg = othersTotal / Math.max(1, entries.length - 1);
      if (othersAvg > 0 && v.count >= 2 * othersAvg && v.count >= 3) {
        result.push({
          prenom,
          count: v.count,
          others_avg: Number(othersAvg.toFixed(2)),
          ratio: Number((v.count / othersAvg).toFixed(2)),
          sources: Array.from(v.sources),
        });
      }
    });
    return result.sort((a, b) => b.ratio - a.ratio);
  }, [citations]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Analyse des citations…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-display flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-500" /> Détection d'acharnement
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Alerte automatique : prénoms cités au moins 2× la moyenne des autres dans les sondages/tournois actifs, Kiss/Marry du mois en cours et simulations (Fantasy Firm, Gouvernement). Aucune action n'est prise automatiquement.
        </p>
        <button
          onClick={load}
          className="mt-2 text-xs text-primary hover:underline"
        >
          Recalculer maintenant
        </button>
      </div>

      {flags.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Aucun acharnement détecté pour le moment.
        </p>
      ) : (
        <div className="space-y-2">
          {flags.map((f) => (
            <div
              key={f.prenom}
              className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="font-semibold text-sm">{f.prenom}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-700 dark:text-orange-300 font-medium">
                    ×{f.ratio} la moyenne
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {f.count} citations · moyenne autres : {f.others_avg}
                </span>
              </div>
              <div className="pl-6">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                  Apparaît dans :
                </p>
                <ul className="text-xs space-y-0.5">
                  {f.sources.map((s, i) => (
                    <li key={i} className="text-foreground/80">• {s}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
