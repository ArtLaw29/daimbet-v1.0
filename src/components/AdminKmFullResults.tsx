import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, CalendarClock, Trash2, Plus, Zap } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string }> = {
  kiss: { label: 'Kiss', emoji: '💋' },
  marry: { label: 'Marry', emoji: '💍' },
  coup_soir: { label: "Coup d'un soir", emoji: '🌙' },
  plan_q: { label: 'Plan Q', emoji: '🔥' },
};

// Convert ISO timestamp -> "YYYY-MM-DDTHH:mm" for datetime-local input (local time)
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function AdminKmFullResults() {
  const [periodId, setPeriodId] = useState<string>('');
  const [results, setResults] = useState<Record<string, { name: string; count: number }[]>>({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reveal config state
  const [configId, setConfigId] = useState<string | null>(null);
  const [revealDates, setRevealDates] = useState<string[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const fetchConfig = async () => {
    const { data } = await (supabase as any)
      .from('km_reveal_config')
      .select('id, reveal_dates')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setConfigId(data.id);
      const sorted = [...(data.reveal_dates || [])].sort();
      setRevealDates(sorted);
      // Default selected period = next future date (ISO)
      const now = Date.now();
      const next = sorted.map((d: string) => new Date(d)).find((d: Date) => d.getTime() > now);
      const fallback = sorted.length > 0 ? new Date(sorted[sorted.length - 1]) : new Date();
      const target = next || fallback;
      setPeriodId(target.toISOString().slice(0, 10));
    }
  };

  const fetchResults = async () => {
    if (!periodId) return;
    setLoading(true);
    const { data } = await supabase.rpc('get_km_results', { p_month_year: periodId });
    const grouped: Record<string, { name: string; count: number }[]> = {};
    for (const row of (data as any[]) || []) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push({ name: row.voted_prenom, count: Number(row.vote_count) });
    }
    setResults(grouped);
    setLoading(false);
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (open && periodId) fetchResults();
  }, [open, periodId]);

  const updateRevealDate = (idx: number, localValue: string) => {
    const iso = new Date(localValue).toISOString();
    setRevealDates((prev) => prev.map((d, i) => (i === idx ? iso : d)));
  };

  const removeRevealDate = (idx: number) => {
    setRevealDates((prev) => prev.filter((_, i) => i !== idx));
  };

  const addRevealDate = () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    setRevealDates((prev) => [...prev, future.toISOString()]);
  };

  const saveConfig = async () => {
    if (!configId) return;
    setSavingConfig(true);
    const { error } = await (supabase as any)
      .from('km_reveal_config')
      .update({ reveal_dates: revealDates, updated_at: new Date().toISOString() })
      .eq('id', configId);
    setSavingConfig(false);
    if (error) {
      toast.error("Erreur d'enregistrement");
    } else {
      toast.success('Dates de révélation mises à jour');
      fetchConfig();
    }
  };

  const triggerNow = async () => {
    if (!confirm("Déclencher la révélation immédiatement ? Les votes en cours seront figés et révélés dès maintenant.")) return;
    setTriggering(true);
    const { data, error } = await supabase.functions.invoke('km-admin-reveal', { body: {} });
    setTriggering(false);
    if (error || data?.error) {
      toast.error(data?.error || 'Erreur de déclenchement');
    } else {
      toast.success('Révélation déclenchée !');
      fetchConfig();
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* ── Reveal config panel ── */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
        <h3 className="text-sm font-display flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          Dates de révélation Kiss/Marry
        </h3>
        <p className="text-xs text-muted-foreground">
          À chaque date, le Top 3 est dévoilé à tous les utilisateurs. 24h après, les votes sont remis à zéro et la nouvelle période commence.
        </p>

        <div className="space-y-2">
          {revealDates.length === 0 && (
            <p className="text-xs italic text-muted-foreground">Aucune date configurée.</p>
          )}
          {revealDates.map((iso, idx) => {
            const isPast = new Date(iso).getTime() < Date.now();
            return (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  value={toLocalInputValue(iso)}
                  onChange={e => updateRevealDate(idx, e.target.value)}
                  className="h-9 text-xs flex-1"
                />
                {isPast && <span className="text-[10px] text-muted-foreground">(passée)</span>}
                <Button size="icon" variant="ghost" onClick={() => removeRevealDate(idx)} className="h-8 w-8 text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={addRevealDate}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter une date
          </Button>
          <Button size="sm" onClick={saveConfig} disabled={savingConfig} className="gold-gradient">
            {savingConfig ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button size="sm" variant="destructive" onClick={triggerNow} disabled={triggering}>
            <Zap className="w-3.5 h-3.5 mr-1" />
            {triggering ? 'Déclenchement…' : 'Déclencher la révélation maintenant'}
          </Button>
        </div>
      </div>

      {/* ── Detailed results panel ── */}
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
              <Label className="text-xs">Période (ID = date de révélation YYYY-MM-DD)</Label>
              <Input
                value={periodId}
                onChange={e => setPeriodId(e.target.value)}
                placeholder="2026-05-20"
                className="h-9"
              />
            </div>
            <Button size="sm" variant="outline" onClick={fetchResults} disabled={loading}>
              {loading ? '…' : 'Rafraîchir'}
            </Button>
          </div>

          {Object.keys(results).length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Aucun vote pour cette période.</p>
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

