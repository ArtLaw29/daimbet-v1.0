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
import { Check, X, Trash2, Trophy, Crown } from 'lucide-react';
import { Plus, Wand2 } from 'lucide-react';
import { generateSudoku, type SudokuDifficulty } from '@/lib/sudokuGenerator';
import {
  generateMotsFleches,
  type MotsFlechesDifficulty,
  type MotSuggestion,
} from '@/lib/motsFlechesGenerator';

type DailyType = 'wordle' | 'sudoku' | 'mots_croisés';

const TYPE_LABELS: Record<DailyType, string> = {
  wordle: '🔠 Mot du jour',
  sudoku: '🔢 Sudoku',
  mots_croisés: '📝 Mots fléchés',
};

type TabKey = DailyType | 'stats';

function next7Days() {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function normalizeRewards(r: any): number[] {
  const arr = Array.isArray(r) ? r : [];
  const out: number[] = [];
  for (let i = 0; i < 5; i++) {
    const n = parseInt(String(arr[i] ?? [500, 300, 200, 100, 50][i]), 10);
    out.push(isNaN(n) || n < 0 ? 0 : n);
  }
  return out;
}

const RANK_LABELS = ['1er', '2ème', '3ème', '4ème', '5ème'];

function RewardsSettings({ value, onChange, title }: { value: number[]; onChange: (v: number[]) => void; title?: string }) {
  const rewards = normalizeRewards(value);
  const update = (i: number, raw: string) => {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    const next = [...rewards];
    next[i] = n;
    onChange(next);
  };
  return (
    <div className="space-y-2 border border-border/60 rounded-md p-3 bg-muted/20">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-primary" />
        <Label className="text-sm font-display">{title || 'Récompenses des Top 5 (DC)'}</Label>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {RANK_LABELS.map((label, i) => (
          <div key={i}>
            <Label className="text-[10px] text-muted-foreground">{label}</Label>
            <Input
              type="number"
              min={0}
              value={rewards[i]}
              onChange={(e) => update(i, e.target.value)}
              className="text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
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
  const [tab, setTab] = useState<TabKey>('wordle');
  return (
    <div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="grid grid-cols-4 mb-4 h-auto">
          {(Object.keys(TYPE_LABELS) as DailyType[]).map((t) => (
            <TabsTrigger key={t} value={t} className="text-xs">{TYPE_LABELS[t]}</TabsTrigger>
          ))}
          <TabsTrigger value="stats" className="text-xs">📊 Stats</TabsTrigger>
        </TabsList>
        <TabsContent value="wordle"><WordleEditor /></TabsContent>
        <TabsContent value="sudoku"><SudokuEditor /></TabsContent>
        <TabsContent value="mots_croisés"><MotsFlechesEditor /></TabsContent>
        <TabsContent value="stats"><CasinoStats /></TabsContent>
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

const WORDLE_VARIANTS: { key: string; label: string; minLen: number; maxLen: number; elite?: boolean }[] = [
  { key: '5', label: '5 lettres', minLen: 5, maxLen: 5 },
  { key: '6', label: '6 lettres', minLen: 6, maxLen: 6 },
  { key: '7', label: '7 lettres', minLen: 7, maxLen: 7 },
  { key: '8', label: '8 lettres', minLen: 8, maxLen: 8 },
  { key: '9', label: '9 lettres', minLen: 9, maxLen: 9 },
  { key: 'culture', label: 'Culture (5–12)', minLen: 5, maxLen: 12, elite: true },
];

const DEFAULT_VARIANT_REWARDS: Record<string, number[]> = {
  '5': [500, 300, 200, 50, 50],
  '6': [500, 300, 200, 50, 50],
  '7': [500, 300, 200, 50, 50],
  '8': [500, 300, 200, 50, 50],
  '9': [500, 300, 200, 50, 50],
  'culture': [800, 500, 300, 200, 100],
};

function WordleEditor() {
  const { items, reload } = useDailyItems('wordle');
  const [date, setDate] = useState(next7Days()[0]);
  const [words, setWords] = useState<Record<string, string>>({});
  const [rewards, setRewards] = useState<Record<string, number[]>>({});
  const [revealAt, setRevealAt] = useState('09:30');
  const existing = items.find((it) => it.scheduled_date === date);

  useEffect(() => {
    const initWords: Record<string, string> = {};
    const initRewards: Record<string, number[]> = {};
    const data: any = existing?.data || {};
    WORDLE_VARIANTS.forEach((v) => {
      // Backward compat: legacy `word` -> word_5
      const legacy = v.key === '5' && !data['word_5'] && typeof data.word === 'string' ? String(data.word) : '';
      initWords[v.key] = String(data['word_' + v.key] || legacy || '').toUpperCase();
      initRewards[v.key] = normalizeRewards(data['rewards_' + v.key] || data.rewards || DEFAULT_VARIANT_REWARDS[v.key]);
    });
    setWords(initWords);
    setRewards(initRewards);
    setRevealAt(((existing as any)?.reveal_at || '09:30:00').slice(0, 5));
  }, [date, existing?.id]);

  const save = async () => {
    const payload: any = {};
    for (const v of WORDLE_VARIANTS) {
      const w = (words[v.key] || '').trim().toUpperCase();
      if (!w) {
        return toast.error(`Le mot « ${v.label} » est manquant`);
      }
      if (!/^[A-Z]+$/.test(w)) {
        return toast.error(`« ${v.label} » : lettres A–Z uniquement`);
      }
      if (w.length < v.minLen || w.length > v.maxLen) {
        return toast.error(
          v.minLen === v.maxLen
            ? `« ${v.label} » doit faire exactement ${v.minLen} lettres`
            : `« ${v.label} » doit faire entre ${v.minLen} et ${v.maxLen} lettres`
        );
      }
      payload['word_' + v.key] = w;
      payload['rewards_' + v.key] = rewards[v.key] || DEFAULT_VARIANT_REWARDS[v.key];
    }
    const reveal = `${revealAt}:00`;
    if (existing) {
      const { error } = await supabase.from('daily_content').update({ data: payload, status: 'actif', reveal_at: reveal } as any).eq('id', existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from('daily_content').insert({ type: 'wordle', scheduled_date: date, status: 'actif', data: payload, reveal_at: reveal } as any);
      if (error) return toast.error(error.message);
    }
    toast.success('6 défis enregistrés ✅');
    await reload();
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm('Supprimer ces 6 défis du jour ?')) return;
    await supabase.from('daily_content').delete().eq('id', existing.id);
    toast.success('Supprimé');
    await reload();
  };

  return (
    <Card className="p-4 space-y-4">
      <CalendarStrip items={items} selected={date} onSelect={setDate} />
      <div className="space-y-4">
        {WORDLE_VARIANTS.map((v) => (
          <div
            key={v.key}
            className={`space-y-2 rounded-lg p-3 border ${
              v.elite ? 'border-primary/60 bg-primary/5' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center gap-2">
              {v.elite && <Crown className="w-4 h-4 text-primary" />}
              <Label className="font-display">
                Défi {v.label}
                {v.elite && <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">Élite</span>}
              </Label>
            </div>
            {v.elite ? (
              <p className="text-[11px] text-primary/80 italic">
                Barème Premium : 800 / 500 / 300 / 200 / 100 / 0 — limité au Top 5.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                Barème : 500 / 300 / 200 puis 50 DC de participation pour les suivants.
              </p>
            )}
            <Input
              value={words[v.key] || ''}
              onChange={(e) => setWords((s) => ({ ...s, [v.key]: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))}
              maxLength={v.maxLen}
              placeholder={v.minLen === v.maxLen ? `${v.minLen} lettres` : `${v.minLen} à ${v.maxLen} lettres`}
              className="uppercase font-mono text-lg tracking-widest"
            />
            <RewardsSettings
              value={rewards[v.key] || DEFAULT_VARIANT_REWARDS[v.key]}
              onChange={(r) => setRewards((s) => ({ ...s, [v.key]: r }))}
              title={`Récompenses « ${v.label} »`}
            />
          </div>
        ))}
      </div>
      <div>
        <Label>Heure de dévoilement (Europe/Paris)</Label>
        <Input type="time" value={revealAt} onChange={(e) => setRevealAt(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button onClick={save} className="flex-1">Enregistrer les 6 défis</Button>
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
  const [rewards, setRewards] = useState<number[]>([500, 300, 200, 100, 50]);
  const [revealAt, setRevealAt] = useState('09:30');
  const existing = items.find((it) => it.scheduled_date === date);

  useEffect(() => {
    if (existing) {
      const data: any = existing.data || {};
      const { rewards: r, ...rest } = data;
      setJson(JSON.stringify(rest, null, 2));
      setRewards(normalizeRewards(r));
      setRevealAt(((existing as any).reveal_at || '09:30:00').slice(0, 5));
    } else {
      setJson('');
      setRewards([500, 300, 200, 100, 50]);
      setRevealAt('09:30');
    }
  }, [date, existing?.id]);

  const save = async () => {
    let parsed: any;
    try { parsed = JSON.parse(json); }
    catch (e: any) { return toast.error('JSON invalide : ' + e.message); }
    parsed = { ...parsed, rewards };
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
      <RewardsSettings value={rewards} onChange={setRewards} />
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

// ───────── Sudoku editor (auto-generated) ─────────
const SUDOKU_DIFFICULTIES: { key: SudokuDifficulty; label: string; clues: number }[] = [
  { key: 'facile', label: 'Facile', clues: 42 },
  { key: 'moyen', label: 'Moyen', clues: 34 },
  { key: 'difficile', label: 'Difficile', clues: 26 },
];

function SudokuEditor() {
  const { items, reload } = useDailyItems('sudoku');
  const [date, setDate] = useState(next7Days()[0]);
  const [difficulty, setDifficulty] = useState<SudokuDifficulty>('moyen');
  const [puzzle, setPuzzle] = useState<number[] | null>(null);
  const [solution, setSolution] = useState<number[] | null>(null);
  const [rewards, setRewards] = useState<number[]>([500, 300, 200, 100, 50]);
  const [revealAt, setRevealAt] = useState('09:30');
  const [generating, setGenerating] = useState(false);
  const existing = items.find((it) => it.scheduled_date === date);

  useEffect(() => {
    if (existing) {
      const data: any = existing.data || {};
      setPuzzle(Array.isArray(data.puzzle) ? data.puzzle.map((n: any) => Number(n) || 0) : null);
      setSolution(Array.isArray(data.solution) ? data.solution.map((n: any) => Number(n) || 0) : null);
      setDifficulty((data.difficulty as SudokuDifficulty) || 'moyen');
      setRewards(normalizeRewards(data.rewards));
      setRevealAt(((existing as any).reveal_at || '09:30:00').slice(0, 5));
    } else {
      setPuzzle(null);
      setSolution(null);
      setDifficulty('moyen');
      setRewards([500, 300, 200, 100, 50]);
      setRevealAt('09:30');
    }
  }, [date, existing?.id]);

  const generate = () => {
    setGenerating(true);
    // Small async tick to let the UI update
    setTimeout(() => {
      try {
        const { puzzle: p, solution: s, cluesCount } = generateSudoku(difficulty);
        setPuzzle(p);
        setSolution(s);
        toast.success(`Grille générée ✅ (${cluesCount} indices)`);
      } catch (e: any) {
        toast.error('Erreur de génération : ' + (e?.message || e));
      } finally {
        setGenerating(false);
      }
    }, 30);
  };

  const save = async () => {
    if (!puzzle || !solution || puzzle.length !== 81 || solution.length !== 81) {
      return toast.error('Génère une grille avant d\'enregistrer');
    }
    const payload = { puzzle, solution, difficulty, rewards };
    const reveal = `${revealAt}:00`;
    if (existing) {
      const { error } = await supabase.from('daily_content').update({ data: payload, status: 'actif', reveal_at: reveal } as any).eq('id', existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from('daily_content').insert({ type: 'sudoku', scheduled_date: date, status: 'actif', data: payload, reveal_at: reveal } as any);
      if (error) return toast.error(error.message);
    }
    toast.success('Sudoku enregistré ✅');
    await reload();
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm('Supprimer ?')) return;
    await supabase.from('daily_content').delete().eq('id', existing.id);
    toast.success('Supprimé');
    await reload();
  };

  const cluesCount = puzzle ? puzzle.filter((n) => n !== 0).length : 0;

  return (
    <Card className="p-4 space-y-4">
      <CalendarStrip items={items} selected={date} onSelect={setDate} />
      <div>
        <Label className="font-display">Difficulté</Label>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {SUDOKU_DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              onClick={() => setDifficulty(d.key)}
              className={`p-2 rounded-md border text-sm transition ${
                difficulty === d.key ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <div className="font-display">{d.label}</div>
              <div className="text-[10px] text-muted-foreground">~{d.clues} indices</div>
            </button>
          ))}
        </div>
      </div>
      <Button onClick={generate} disabled={generating} className="w-full" variant="secondary">
        <Wand2 className="w-4 h-4 mr-2" />
        {generating ? 'Génération en cours…' : 'Générer automatiquement la grille'}
      </Button>
      {puzzle && solution ? (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Aperçu — {cluesCount} cases visibles / 81
          </div>
          <div className="grid grid-cols-9 gap-px bg-border p-px rounded-md overflow-hidden max-w-md mx-auto">
            {puzzle.map((v, i) => {
              const r = Math.floor(i / 9), c = i % 9;
              const borderR = (c % 3 === 2 && c < 8) ? 'border-r-2 border-r-primary/40' : '';
              const borderB = (r % 3 === 2 && r < 8) ? 'border-b-2 border-b-primary/40' : '';
              return (
                <div
                  key={i}
                  className={`aspect-square text-xs sm:text-sm font-semibold flex items-center justify-center bg-card ${borderR} ${borderB} ${v === 0 ? 'text-muted-foreground/40' : 'text-foreground'}`}
                >
                  {v !== 0 ? v : ''}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic text-center py-4">
          Aucune grille générée pour ce jour.
        </p>
      )}
      <RewardsSettings value={rewards} onChange={setRewards} />
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

// ───────── Mots fléchés editor (auto-generated from admin suggestions) ─────────
const MF_DIFFICULTIES: { key: MotsFlechesDifficulty; label: string; size: number }[] = [
  { key: 'facile', label: 'Facile', size: 8 },
  { key: 'moyen', label: 'Moyen', size: 10 },
  { key: 'difficile', label: 'Difficile', size: 12 },
];

function MotsFlechesEditor() {
  const { items, reload } = useDailyItems('mots_croisés');
  const [date, setDate] = useState(next7Days()[0]);
  const [difficulty, setDifficulty] = useState<MotsFlechesDifficulty>('moyen');
  const [suggestions, setSuggestions] = useState<MotSuggestion[]>([{ mot: '', definition: '' }]);
  const [grid, setGrid] = useState<any | null>(null);
  const [rewards, setRewards] = useState<number[]>([500, 300, 200, 100, 50]);
  const [revealAt, setRevealAt] = useState('09:30');
  const existing = items.find((it) => it.scheduled_date === date);

  useEffect(() => {
    if (existing) {
      const data: any = existing.data || {};
      setDifficulty((data.difficulty as MotsFlechesDifficulty) || 'moyen');
      setSuggestions(
        Array.isArray(data.suggestions) && data.suggestions.length
          ? data.suggestions.map((s: any) => ({ mot: String(s.mot || ''), definition: String(s.definition || '') }))
          : [{ mot: '', definition: '' }]
      );
      setGrid(data.grid || null);
      setRewards(normalizeRewards(data.rewards));
      setRevealAt(((existing as any).reveal_at || '09:30:00').slice(0, 5));
    } else {
      setDifficulty('moyen');
      setSuggestions([{ mot: '', definition: '' }]);
      setGrid(null);
      setRewards([500, 300, 200, 100, 50]);
      setRevealAt('09:30');
    }
  }, [date, existing?.id]);

  const addRow = () => setSuggestions((s) => [...s, { mot: '', definition: '' }]);
  const removeRow = (i: number) => setSuggestions((s) => s.filter((_, idx) => idx !== i));
  const updateRow = (i: number, key: 'mot' | 'definition', value: string) =>
    setSuggestions((s) => s.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));

  const compile = () => {
    const cleaned = suggestions
      .map((s) => ({ mot: s.mot.trim(), definition: s.definition.trim() }))
      .filter((s) => s.mot && s.definition);
    if (!cleaned.length) {
      return toast.error('Ajoute au moins un mot avec sa définition');
    }
    try {
      const result = generateMotsFleches(difficulty, cleaned);
      setGrid(result);
      const placed = result.words.length;
      const skipped = cleaned.length - placed;
      if (placed === 0) {
        toast.error('Impossible de placer ces mots — change la difficulté ou les suggestions');
      } else {
        toast.success(
          `Grille compilée ✅ ${placed} mot${placed > 1 ? 's' : ''} placé${placed > 1 ? 's' : ''}` +
            (skipped > 0 ? ` (${skipped} non placé${skipped > 1 ? 's' : ''})` : '')
        );
      }
    } catch (e: any) {
      toast.error('Erreur de compilation : ' + (e?.message || e));
    }
  };

  const save = async () => {
    if (!grid) return toast.error('Compile la grille avant d\'enregistrer');
    const payload = {
      difficulty,
      suggestions: suggestions.filter((s) => s.mot.trim() && s.definition.trim()),
      grid,
      rewards,
    };
    const reveal = `${revealAt}:00`;
    if (existing) {
      const { error } = await supabase.from('daily_content').update({ data: payload, status: 'actif', reveal_at: reveal } as any).eq('id', existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from('daily_content').insert({ type: 'mots_croisés', scheduled_date: date, status: 'actif', data: payload, reveal_at: reveal } as any);
      if (error) return toast.error(error.message);
    }
    toast.success('Mots fléchés enregistrés ✅');
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
    <Card className="p-4 space-y-4">
      <CalendarStrip items={items} selected={date} onSelect={setDate} />

      <div>
        <Label className="font-display">Difficulté (taille de la grille)</Label>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {MF_DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              onClick={() => setDifficulty(d.key)}
              className={`p-2 rounded-md border text-sm transition ${
                difficulty === d.key ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <div className="font-display">{d.label}</div>
              <div className="text-[10px] text-muted-foreground">{d.size}×{d.size}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="font-display">Mots & définitions imposés</Label>
          <Button type="button" size="sm" variant="ghost" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground italic">
          Le générateur priorise ces mots et maximise les croisements.
        </p>
        {suggestions.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-start">
            <Input
              value={row.mot}
              onChange={(e) => updateRow(i, 'mot', e.target.value.toUpperCase().replace(/[^A-ZÀ-ÿ\s-]/gi, ''))}
              placeholder="MOT"
              className="uppercase font-mono"
            />
            <Input
              value={row.definition}
              onChange={(e) => updateRow(i, 'definition', e.target.value)}
              placeholder="Définition"
            />
            <Button type="button" size="icon" variant="ghost" onClick={() => removeRow(i)} disabled={suggestions.length === 1}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button onClick={compile} variant="secondary" className="w-full">
        <Wand2 className="w-4 h-4 mr-2" />
        Compiler la grille automatique
      </Button>

      {grid && Array.isArray(grid.cells) ? (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Aperçu — {grid.size}×{grid.size} — {grid.words?.length || 0} mots placés
          </div>
          <div
            className="grid gap-px bg-border p-px rounded-md overflow-hidden max-w-md mx-auto"
            style={{ gridTemplateColumns: `repeat(${grid.size}, minmax(0, 1fr))` }}
          >
            {grid.cells.flat().map((cell: any, idx: number) => {
              if (cell.type === 'lettre') {
                return (
                  <div key={idx} className="aspect-square bg-card text-foreground text-[10px] sm:text-xs font-bold flex items-center justify-center">
                    {cell.letter}
                  </div>
                );
              }
              if (cell.type === 'definition') {
                return (
                  <div key={idx} className="aspect-square bg-primary/20 text-[8px] leading-tight p-0.5 overflow-hidden text-primary" title={[cell.definitions?.horizontal, cell.definitions?.vertical].filter(Boolean).join(' / ')}>
                    ◧
                  </div>
                );
              }
              return <div key={idx} className="aspect-square bg-muted/40" />;
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic text-center py-4">
          Aucune grille compilée pour ce jour.
        </p>
      )}

      <RewardsSettings value={rewards} onChange={setRewards} />
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

// ───────── Casino stats (7 derniers jours) ─────────
const GAME_DEFS: { id: string; label: string; emoji: string }[] = [
  { id: 'blackjack', label: 'Blackjack', emoji: '🃏' },
  { id: 'wordle', label: 'Mot du jour', emoji: '🔠' },
  { id: 'sudoku', label: 'Sudoku', emoji: '🔢' },
  { id: 'mots-fleches', label: 'Mots fléchés', emoji: '📝' },
  { id: 'pendu', label: 'Pendu', emoji: '🪢' },
  { id: 'puissance4', label: 'Puissance 4', emoji: '🔴' },
  { id: 'echecs', label: 'Échecs', emoji: '♟️' },
  { id: 'duels', label: 'Duels', emoji: '⚔️' },
  { id: 'pari-externe', label: 'Pari externe', emoji: '🤝' },
];

function CasinoStats() {
  const [loading, setLoading] = useState(true);
  const [perGame, setPerGame] = useState<Record<string, { plays: number; players: number }>>({});
  const [totals, setTotals] = useState({ misé: 0, distribué: 0 });
  const [topPlayers, setTopPlayers] = useState<{ user_id: string; name: string; activity: number }[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 7 * 86400000).toISOString();

      // games_sessions for pendu/puissance4/echecs (status=termine)
      const { data: gs } = await supabase
        .from('games_sessions').select('id,game_type,player1_id,player2_id,created_at,status')
        .gte('created_at', since);

      // daily_scores → joined with daily_content for type
      const { data: ds } = await supabase
        .from('daily_scores').select('user_id,content_id,finished_at').gte('finished_at', since);
      const contentIds = Array.from(new Set((ds || []).map((s: any) => s.content_id).filter(Boolean)));
      let dcMap: Record<string, string> = {};
      if (contentIds.length) {
        const { data: dc } = await supabase.from('daily_content').select('id,type').in('id', contentIds);
        (dc || []).forEach((c: any) => { dcMap[c.id] = c.type === 'mots_croisés' ? 'mots-fleches' : c.type; });
      }

      // solde_history for blackjack + DC totals
      const { data: hist } = await supabase
        .from('solde_history').select('user_id,delta_dc,reason,created_at').gte('created_at', since);

      const stats: Record<string, { plays: number; players: Set<string> }> = {};
      GAME_DEFS.forEach(g => { stats[g.id] = { plays: 0, players: new Set() }; });

      (gs || []).forEach((s: any) => {
        const id = s.game_type;
        if (stats[id]) {
          stats[id].plays += 1;
          if (s.player1_id) stats[id].players.add(s.player1_id);
          if (s.player2_id) stats[id].players.add(s.player2_id);
          // also count under "duels"
          stats['duels'].plays += 1;
          if (s.player1_id) stats['duels'].players.add(s.player1_id);
          if (s.player2_id) stats['duels'].players.add(s.player2_id);
        }
      });
      (ds || []).forEach((r: any) => {
        const id = dcMap[r.content_id];
        if (id && stats[id]) {
          stats[id].plays += 1;
          stats[id].players.add(r.user_id);
        }
      });
      // Blackjack from solde_history
      (hist || []).forEach((h: any) => {
        if (h.reason && /Blackjack/i.test(h.reason) && /Mise/i.test(h.reason)) {
          stats['blackjack'].plays += 1;
          stats['blackjack'].players.add(h.user_id);
        }
      });

      const out: Record<string, { plays: number; players: number }> = {};
      Object.entries(stats).forEach(([k, v]) => out[k] = { plays: v.plays, players: v.players.size });
      setPerGame(out);

      // DC totals
      let misé = 0, distribué = 0;
      (hist || []).forEach((h: any) => {
        if (h.delta_dc < 0) misé += -h.delta_dc;
        else distribué += h.delta_dc;
      });
      setTotals({ misé, distribué });

      // Top players: aggregate plays across all games
      const activity: Record<string, number> = {};
      (gs || []).forEach((s: any) => {
        if (s.player1_id) activity[s.player1_id] = (activity[s.player1_id] || 0) + 1;
        if (s.player2_id) activity[s.player2_id] = (activity[s.player2_id] || 0) + 1;
      });
      (ds || []).forEach((r: any) => { activity[r.user_id] = (activity[r.user_id] || 0) + 1; });
      (hist || []).forEach((h: any) => {
        if (h.reason && /Blackjack/i.test(h.reason) && /Mise/i.test(h.reason))
          activity[h.user_id] = (activity[h.user_id] || 0) + 1;
      });
      const topIds = Object.entries(activity).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const ids = topIds.map(([id]) => id);
      let nameMap: Record<string, string> = {};
      if (ids.length) {
        const { data: ps } = await supabase.from('profiles').select('user_id,display_name,emoji').in('user_id', ids);
        (ps || []).forEach((p: any) => { nameMap[p.user_id] = `${p.emoji || '🦌'} ${p.display_name}`; });
      }
      setTopPlayers(topIds.map(([id, c]) => ({ user_id: id, name: nameMap[id] || id.slice(0, 8), activity: c })));
      setLoading(false);
    })();
  }, []);

  if (loading) return <Card className="p-6 text-center text-muted-foreground">Chargement des statistiques…</Card>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">DC misés (7j)</p>
          <p className="text-2xl font-display gold-text">{totals.misé.toLocaleString('fr-FR')}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">DC distribués (7j)</p>
          <p className="text-2xl font-display text-success">{totals.distribué.toLocaleString('fr-FR')}</p>
        </Card>
      </div>
      <Card className="p-4">
        <h3 className="font-display text-sm mb-3">Parties & joueurs uniques (7j)</h3>
        <div className="space-y-2">
          {GAME_DEFS.map(g => (
            <div key={g.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-1.5">
              <span>{g.emoji} {g.label}</span>
              <span className="text-muted-foreground">
                <span className="text-foreground font-semibold">{perGame[g.id]?.plays || 0}</span> parties · {perGame[g.id]?.players || 0} joueurs
              </span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="font-display text-sm mb-3">🏆 Top 10 joueurs les plus actifs (7j)</h3>
        {topPlayers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune activité.</p>
        ) : (
          <ol className="space-y-1.5">
            {topPlayers.map((p, i) => (
              <li key={p.user_id} className="flex justify-between text-sm">
                <span><span className="text-muted-foreground">#{i + 1}</span> {p.name}</span>
                <span className="text-primary font-semibold">{p.activity} parties</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

// ───────── Casino controls : reset + suspend ─────────
const CONTROL_GAMES: { id: string; label: string; emoji: string; gameTypes?: string[] }[] = [
  { id: 'blackjack', label: 'Blackjack', emoji: '🃏' },
