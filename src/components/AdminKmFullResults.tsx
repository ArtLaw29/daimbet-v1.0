import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string }> = {
  kiss: { label: 'Kiss', emoji: '💋' },
  marry: { label: 'Marry', emoji: '💍' },
  coup_soir: { label: "Coup d'un soir", emoji: '🌙' },
  plan_q: { label: 'Plan Q', emoji: '🔥' },
};

export default function AdminKmFullResults() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [monthYear, setMonthYear] = useState(currentMonth);
  const [results, setResults] = useState<Record<string, { name: string; count: number }[]>>({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchResults = async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_km_results', { p_month_year: monthYear });
    const grouped: Record<string, { name: string; count: number }[]> = {};
    for (const row of (data as any[]) || []) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push({ name: row.voted_prenom, count: Number(row.vote_count) });
    }
    setResults(grouped);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchResults();
  }, [open, monthYear]);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display flex items-center gap-2">
          🔒 Résultats complets Kiss/Marry (admin uniquement)
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)}>
          {open ? <><EyeOff className="w-4 h-4 mr-1" /> Masquer</> : <><Eye className="w-4 h-4 mr-1" /> Afficher</>}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Vue privée des résultats détaillés. Les utilisateurs ne voient que le Top 3 par catégorie.
      </p>

      {open && (
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Mois (format YYYY-MM)</Label>
              <Input
                value={monthYear}
                onChange={e => setMonthYear(e.target.value)}
                placeholder="2026-04"
                className="h-9"
              />
            </div>
            <Button size="sm" variant="outline" onClick={fetchResults} disabled={loading}>
              {loading ? '…' : 'Rafraîchir'}
            </Button>
          </div>

          {Object.keys(results).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Aucun vote pour ce mois.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(results).map(([cat, entries]) => {
                const config = CATEGORY_CONFIG[cat] || { label: cat, emoji: '•' };
                const total = entries.reduce((s, e) => s + e.count, 0);
                return (
                  <div key={cat} className="rounded-lg border border-border/50 bg-background/50 p-3">
                    <h4 className="text-sm font-semibold mb-2">
                      {config.emoji} {config.label} <span className="text-xs text-muted-foreground">({total} vote{total > 1 ? 's' : ''})</span>
                    </h4>
                    <div className="space-y-1">
                      {entries.map((e, i) => (
                        <div key={e.name} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-secondary/40">
                          <span className="font-medium">
                            <span className="text-muted-foreground mr-2">#{i + 1}</span>
                            {e.name}
                          </span>
                          <span className="text-muted-foreground">{e.count} vote{e.count > 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
