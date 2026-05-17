import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';

interface ConfigRow {
  game_key: string;
  config: Record<string, any>;
}

const KNOWN_GAMES: { key: string; label: string; emoji: string; fields: Field[] }[] = [
  {
    key: 'roulette', label: 'Roulette', emoji: '🎡',
    fields: [
      { key: 'betMin', label: 'Mise minimum (DC)', readOnly: true, default: 5 },
      { key: 'betMax', label: 'Mise maximum (DC)', default: 200 },
      { key: 'maxPlaysPerDay', label: 'Parties max / jour (0 = illimité)', default: 50 },
    ],
  },
  {
    key: 'slot_machine', label: 'Machine à sous', emoji: '🎰',
    fields: [
      { key: 'betMin', label: 'Mise minimum (DC)', default: 5 },
      { key: 'betMax', label: 'Mise maximum (DC)', default: 100 },
      { key: 'cooldownSec', label: 'Cooldown entre spins (s)', default: 30 },
      { key: 'maxSpinsPerDay', label: 'Spins max / jour (0 = illimité)', default: 30 },
    ],
  },
  {
    key: 'blackjack', label: 'Blackjack', emoji: '🂡',
    fields: [
      { key: 'betMin', label: 'Mise minimum (DC)', default: 10 },
      { key: 'betMax', label: 'Mise maximum (DC)', default: 300 },
      { key: 'maxPlaysPerDay', label: 'Parties max / jour (0 = illimité)', default: 100 },
    ],
  },
];
interface Field { key: string; label: string; readOnly?: boolean; default: number }

export default function AdminGameConfigPanel() {
  const [rows, setRows] = useState<Record<string, Record<string, any>>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('game_config' as any).select('*');
    const map: Record<string, Record<string, any>> = {};
    for (const r of ((data ?? []) as any[]) as ConfigRow[]) map[r.game_key] = r.config ?? {};
    setRows(map);
  };
  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin_game_config')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_config' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const open = (gk: string) => {
    const def = KNOWN_GAMES.find(g => g.key === gk)!;
    const cur = rows[gk] ?? {};
    const base: Record<string, any> = {};
    for (const f of def.fields) base[f.key] = cur[f.key] ?? f.default;
    setDraft(base);
    setEditing(gk);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const def = KNOWN_GAMES.find(g => g.key === editing)!;
    // Force read-only fields back to default to avoid tampering
    const out: Record<string, any> = { ...draft };
    for (const f of def.fields) if (f.readOnly) out[f.key] = f.default;
    const { error } = await supabase
      .from('game_config' as any)
      .upsert({ game_key: editing, config: out, updated_at: new Date().toISOString() } as any,
        { onConflict: 'game_key' });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Paramètres enregistrés');
      setEditing(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h3 className="text-sm font-display flex items-center gap-2">
        <Settings2 className="w-4 h-4" /> Paramètres par jeu (casino)
      </h3>
      <p className="text-xs text-muted-foreground">
        Plafonds, mises et cooldowns. Les changements sont appliqués instantanément à tous les joueurs.
      </p>
      <div className="space-y-2">
        {KNOWN_GAMES.map(g => {
          const cur = rows[g.key] ?? {};
          return (
            <div key={g.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/40 border border-border/50 flex-wrap gap-2">
              <div className="text-sm">
                <div className="font-semibold">{g.emoji} {g.label}</div>
                <div className="text-xs text-muted-foreground">
                  {g.fields.map(f => `${f.label.split(' ')[0]}: ${cur[f.key] ?? f.default}`).join(' · ')}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => open(g.key)}>Modifier</Button>
            </div>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Paramètres — {KNOWN_GAMES.find(g => g.key === editing)?.label}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              {KNOWN_GAMES.find(g => g.key === editing)!.fields.map(f => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={f.key}>{f.label}{f.readOnly && ' (verrouillé)'}</Label>
                  <Input
                    id={f.key}
                    type="number"
                    min={0}
                    disabled={f.readOnly}
                    value={Number(draft[f.key] ?? f.default)}
                    onChange={(e) => setDraft({ ...draft, [f.key]: Math.max(0, parseInt(e.target.value) || 0) })}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}