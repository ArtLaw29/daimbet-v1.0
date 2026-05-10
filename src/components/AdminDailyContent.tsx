import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Check, X, Trash2 } from 'lucide-react';

type DailyType = 'wordle' | 'sudoku' | 'mots_croisés';

const TYPE_LABELS: Record<DailyType, string> = {
  wordle: '🔠 Wordle',
  sudoku: '🔢 Sudoku',
  mots_croisés: '📝 Mots croisés',
};

function next7Days() {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function CalendarStrip({ items, selected, onSelect }: { items: any[]; selected: string; onSelect: (d: string) => void }) {
  const days = next7Days();
  return (
    <div className="grid grid-cols-7 gap-1.5 mb-4">
      {days.map((d) => {
        const has = items.some((it) => it.scheduled_date === d && it.status === 'actif');
        const isSel = d === selected;
        const dt = new Date(d);
        return (
          <button key={d} onClick={() => onSelect(d)}
            className={`p-2 rounded-md border text-center text-xs transition ${
              isSel ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'
            }`}>
            <div className="font-bold">{dt.toLocaleDateString('fr-FR', { weekday: 'short' })}</div>
            <div className="text-base font-display">{dt.getDate()}</div>
            {has ? <Check className="w-3 h-3 mx-auto text-success mt-1" /> : <X className="w-3 h-3 mx-auto text-destructive mt-1" />}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminDailyContent() {
  const [tab, setTab] = useState<DailyType>('wordle');
  return (
    <div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as DailyType)}>
        <TabsList className="grid grid-cols-3 mb-4">
          {(Object.keys(TYPE_LABELS) as DailyType[]).map((t) => (
            <TabsTrigger key={t} value={t} className="text-xs">{TYPE_LABELS[t]}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="wordle"><WordleEditor /></TabsContent>
        <TabsContent value="sudoku"><JsonEditor type="sudoku" placeholder='{"puzzle":[0,0,0,...,81 valeurs],"solution":[...,81 valeurs],"rewards":[500,300,200,100,50]}' /></TabsContent>
        <TabsContent value="mots_croisés"><JsonEditor type="mots_croisés" placeholder='{"grille":[[{"lettre":"P","numero":1},...],...],"cases_noires":[[0,3],...],"definitions_horizontales":[{"numero":1,"definition":"..."}],"definitions_verticales":[...],"rewards":[500,300,200,100,50]}' /></TabsContent>
      </Tabs>
    </div>
  );
}

function useDailyItems(type: DailyType) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + 7);
    const { data } = await supabase.from('daily_content').select('*')
      .eq('type', type)
      .gte('scheduled_date', today.toISOString().slice(0, 10))
      .lte('scheduled_date', horizon.toISOString().slice(0, 10))
      .order('scheduled_date');
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [type]);
  return { items, loading, reload: load };
}

function WordleEditor() {
  const { items, reload } = useDailyItems('wordle');
  const [date, setDate] = useState(next7Days()[0]);
  const [word, setWord] = useState('');
  const [rewards, setRewards] = useState('500,300,200,100,50');
  const [revealAt, setRevealAt] = useState('09:30');
  const existing = items.find((it) => it.scheduled_date === date);

  useEffect(() => {
    if (existing) {
      setWord(String(existing.data?.word || ''));
      setRewards(((existing.data?.rewards as number[]) || []).join(','));
      setRevealAt(((existing as any).reveal_at || '09:30:00').slice(0, 5));
    } else { setWord(''); setRewards('500,300,200,100,50'); setRevealAt('09:30'); }
  }, [date, existing?.id]);

  const save = async () => {
    const w = word.trim().toUpperCase();
    if (w.length !== 5 || !/^[A-Z]+$/.test(w)) return toast.error('Le mot doit faire exactement 5 lettres (A-Z)');
    const rw = rewards.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    const payload = { word: w, rewards: rw };
    const reveal = `${revealAt}:00`;
    if (existing) {
      const { error } = await supabase.from('daily_content').update({ data: payload, status: 'actif', reveal_at: reveal } as any).eq('id', existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from('daily_content').insert({ type: 'wordle', scheduled_date: date, status: 'actif', data: payload, reveal_at: reveal } as any);
      if (error) return toast.error(error.message);
    }
    toast.success('Wordle enregistré ✅');
    await reload();
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm('Supprimer ce Wordle ?')) return;
    await supabase.from('daily_content').delete().eq('id', existing.id);
    toast.success('Supprimé');
    await reload();
  };

  return (
    <Card className="p-4 space-y-3">
      <CalendarStrip items={items} selected={date} onSelect={setDate} />
      <div>
        <Label>Mot (5 lettres)</Label>
        <Input value={word} onChange={(e) => setWord(e.target.value.toUpperCase())} maxLength={5} className="uppercase font-mono text-lg tracking-widest" />
      </div>
      <div>
        <Label>Récompenses (DC, séparées par virgule)</Label>
        <Input value={rewards} onChange={(e) => setRewards(e.target.value)} />
      </div>
      <div>
        <Label>Heure de dévoilement (Europe/Paris)</Label>
        <Input type="time" value={revealAt} onChange={(e) => setRevealAt(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button onClick={save} className="flex-1">Enregistrer</Button>
        {existing && <Button variant="outline" onClick={remove}><Trash2 className="w-4 h-4" /></Button>}
      </div>
      {existing && <Badge variant="secondary" className="text-xs">Déjà programmé</Badge>}
    </Card>
  );
}

function JsonEditor({ type, placeholder }: { type: DailyType; placeholder: string }) {
  const { items, reload } = useDailyItems(type);
  const [date, setDate] = useState(next7Days()[0]);
  const [json, setJson] = useState('');
  const [revealAt, setRevealAt] = useState('09:30');
  const existing = items.find((it) => it.scheduled_date === date);

  useEffect(() => {
    if (existing) {
      setJson(JSON.stringify(existing.data, null, 2));
      setRevealAt(((existing as any).reveal_at || '09:30:00').slice(0, 5));
    } else {
      setJson('');
      setRevealAt('09:30');
    }
  }, [date, existing?.id]);

  const save = async () => {
    let parsed: any;
    try { parsed = JSON.parse(json); }
    catch (e: any) { return toast.error('JSON invalide : ' + e.message); }
    const reveal = `${revealAt}:00`;
    if (existing) {
      const { error } = await supabase.from('daily_content').update({ data: parsed, status: 'actif', reveal_at: reveal } as any).eq('id', existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from('daily_content').insert({ type, scheduled_date: date, status: 'actif', data: parsed, reveal_at: reveal } as any);
      if (error) return toast.error(error.message);
    }
    toast.success('Contenu enregistré ✅');
    await reload();
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm('Supprimer ?')) return;
    await supabase.from('daily_content').delete().eq('id', existing.id);
    toast.success('Supprimé');
    await reload();
  };

  return (
    <Card className="p-4 space-y-3">
      <CalendarStrip items={items} selected={date} onSelect={setDate} />
      <div>
        <Label>Données JSON</Label>
        <Textarea value={json} onChange={(e) => setJson(e.target.value)} placeholder={placeholder} rows={12} className="font-mono text-xs" />
      </div>
      <div>
        <Label>Heure de dévoilement (Europe/Paris)</Label>
        <Input type="time" value={revealAt} onChange={(e) => setRevealAt(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button onClick={save} className="flex-1">Enregistrer</Button>
        {existing && <Button variant="outline" onClick={remove}><Trash2 className="w-4 h-4" /></Button>}
      </div>
      {existing && <Badge variant="secondary" className="text-xs">Déjà programmé</Badge>}
    </Card>
  );
}