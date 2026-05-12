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

type DailyType = 'wordle' | 'sudoku' | 'mots_croisés';

const TYPE_LABELS: Record<DailyType, string> = {
  wordle: '🔠 Mot du jour',
  sudoku: '🔢 Sudoku',
  mots_croisés: '📝 Mots fléchés',
};

type TabKey = DailyType | 'stats' | 'controles';

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
        <TabsList className="grid grid-cols-5 mb-4 h-auto">
          {(Object.keys(TYPE_LABELS) as DailyType[]).map((t) => (
            <TabsTrigger key={t} value={t} className="text-xs">{TYPE_LABELS[t]}</TabsTrigger>
          ))}
          <TabsTrigger value="stats" className="text-xs">📊 Stats</TabsTrigger>
          <TabsTrigger value="controles" className="text-xs">⚙️ Contrôles</TabsTrigger>
        </TabsList>
        <TabsContent value="wordle"><WordleEditor /></TabsContent>
        <TabsContent value="sudoku"><JsonEditor type="sudoku" placeholder='{"puzzle":[0,0,0,...,81 valeurs],"solution":[...,81 valeurs],"rewards":[500,300,200,100,50]}' /></TabsContent>
        <TabsContent value="mots_croisés"><JsonEditor type="mots_croisés" placeholder='{"grille":[[{"type":"definition","text":"Animal","direction":"right"},{"type":"lettre","correct":"C"},{"type":"lettre","correct":"H"},{"type":"lettre","correct":"A"},{"type":"lettre","correct":"T"}],[{"type":"vide"},{"type":"lettre","correct":"O"},...]],"rewards":[500,300,200,100,50]}' /></TabsContent>
        <TabsContent value="stats"><CasinoStats /></TabsContent>
        <TabsContent value="controles"><CasinoControls /></TabsContent>
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
  '5': [500, 300, 200, 100, 50],
  '6': [500, 300, 200, 100, 50],
  '7': [500, 300, 200, 100, 50],
  '8': [500, 300, 200, 100, 50],
  '9': [500, 300, 200, 100, 50],
  'culture': [800, 500, 300, 100, 50],
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
  { id: 'wordle', label: 'Mot du jour', emoji: '🔠' },
  { id: 'sudoku', label: 'Sudoku', emoji: '🔢' },
  { id: 'mots-fleches', label: 'Mots fléchés', emoji: '📝' },
  { id: 'duels', label: 'Duels', emoji: '⚔️', gameTypes: ['pendu', 'puissance4', 'echecs'] },
  { id: 'pari-externe', label: 'Pari externe', emoji: '🤝' },
];

function CasinoControls() {
  const [suspended, setSuspended] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const keys = CONTROL_GAMES.map(g => `casino_suspend_${g.id}`);
    const { data } = await supabase.from('platform_settings').select('key,value').in('key', keys);
    const map: Record<string, boolean> = {};
    (data || []).forEach((r: any) => { map[r.key.replace('casino_suspend_', '')] = r.value === 'true'; });
    setSuspended(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSuspend = async (gameId: string) => {
    const key = `casino_suspend_${gameId}`;
    const newVal = !suspended[gameId];
    const { data: existing } = await supabase.from('platform_settings').select('id').eq('key', key).maybeSingle();
    if (existing) {
      await supabase.from('platform_settings').update({ value: String(newVal) }).eq('key', key);
    } else {
      await supabase.from('platform_settings').insert({ key, value: String(newVal) });
    }
    toast.success(newVal ? 'Jeu suspendu' : 'Jeu réactivé');
    setSuspended(s => ({ ...s, [gameId]: newVal }));
  };

  const reset = async (g: typeof CONTROL_GAMES[number]) => {
    if (!confirm(`Annuler toutes les parties en cours de ${g.label} et rembourser les mises ?`)) return;
    if (g.id === 'duels') {
      const types = g.gameTypes!;
      const { data: sessions } = await supabase.from('games_sessions').select('*').in('game_type', types).eq('status', 'en_cours');
      let count = 0;
      for (const s of sessions || []) {
        // refund both players
        if (s.player1_id && s.mise_player1 > 0) {
          await supabase.rpc('admin_credit_balance' as any, { p_user_id: s.player1_id, p_delta: s.mise_player1, p_reason: `Remboursement annulation ${s.game_type}` }).then(() => {}, async () => {
            // fallback : direct insert + balance update via SQL not possible from client → use solde_history + update
            const { data: prof } = await supabase.from('profiles').select('balance').eq('user_id', s.player1_id).maybeSingle();
            if (prof) {
              await supabase.from('profiles').update({ balance: (prof.balance || 0) + s.mise_player1 }).eq('user_id', s.player1_id);
              await supabase.from('solde_history').insert({ user_id: s.player1_id, delta_dc: s.mise_player1, reason: `Remboursement annulation ${s.game_type}` });
            }
          });
        }
        if (s.player2_id && s.mise_player2 > 0) {
          const { data: prof } = await supabase.from('profiles').select('balance').eq('user_id', s.player2_id).maybeSingle();
          if (prof) {
            await supabase.from('profiles').update({ balance: (prof.balance || 0) + s.mise_player2 }).eq('user_id', s.player2_id);
            await supabase.from('solde_history').insert({ user_id: s.player2_id, delta_dc: s.mise_player2, reason: `Remboursement annulation ${s.game_type}` });
          }
        }
        await supabase.from('games_sessions').update({ status: 'annule' }).eq('id', s.id);
        count++;
      }
      toast.success(`${count} partie(s) annulée(s) et mises remboursées`);
    } else if (g.id === 'pari-externe') {
      const { data: bets } = await supabase.from('external_bets').select('*').in('status', ['en_attente', 'accepte']);
      let count = 0;
      for (const b of bets || []) {
        const players = [b.player1_id, b.player2_id].filter(Boolean) as string[];
        for (const pid of players) {
          if (b.status === 'accepte' || pid === b.player1_id) {
            const { data: prof } = await supabase.from('profiles').select('balance').eq('user_id', pid).maybeSingle();
            if (prof) {
              await supabase.from('profiles').update({ balance: (prof.balance || 0) + b.mise }).eq('user_id', pid);
              await supabase.from('solde_history').insert({ user_id: pid, delta_dc: b.mise, reason: 'Remboursement annulation pari externe' });
            }
          }
        }
        await supabase.from('external_bets').update({ status: 'annule' } as any).eq('id', b.id);
        count++;
      }
      toast.success(`${count} pari(s) externes annulé(s) et remboursés`);
    } else {
      toast.info('Aucune session active à réinitialiser pour ce jeu (jeux solo).');
    }
  };

  if (loading) return <Card className="p-6 text-center text-muted-foreground">Chargement…</Card>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        <strong>Suspendre</strong> : empêche le lancement de nouvelles parties.
        <br /><strong>Réinitialiser</strong> : annule les sessions en cours et rembourse les mises.
      </p>
      {CONTROL_GAMES.map(g => (
        <Card key={g.id} className="p-3 flex items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-sm">{g.emoji} {g.label}</p>
            {suspended[g.id] && <Badge variant="destructive" className="text-[10px] mt-1">Suspendu</Badge>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => reset(g)}>Réinitialiser</Button>
            <Button size="sm" variant={suspended[g.id] ? 'default' : 'destructive'} onClick={() => toggleSuspend(g.id)}>
              {suspended[g.id] ? 'Réactiver' : 'Suspendre'}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
