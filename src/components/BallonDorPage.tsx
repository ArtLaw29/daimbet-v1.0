import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowDown, ArrowUp, Lock, Trophy, X, Shield, Loader2, Search,
} from 'lucide-react';
import {
  BALLON_DOR_NOMINEES, BALLON_DOR_SESSION_ID, KOPA_NOMINEES, NOMINEE_BY_NAME,
  YACHINE_NOMINEES, positionPoints, scorePronostic,
  type BallonDorConfig, type Pronostic,
} from '@/lib/ballonDorData';

interface Entry {
  user_id: string;
  display_name: string | null;
  emoji: string | null;
  avatar_url: string | null;
  data: Pronostic;
  score: number;
  created_at: string;
}

type Tab = 'pronostic' | 'classement' | 'promo';

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

export default function BallonDorPage() {
  const { user, profile, isAdmin, refreshProfile } = useAuth();
  const balance = profile?.balance ?? 0;
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('active');
  const [cfg, setCfg] = useState<BallonDorConfig>(DEFAULT_CFG);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tab, setTab] = useState<Tab>('pronostic');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadAll = async () => {
    const [{ data: sess }, { data: rows }] = await Promise.all([
      supabase.from('game_sessions').select('status, config').eq('id', BALLON_DOR_SESSION_ID).maybeSingle(),
      supabase.rpc('get_ballon_dor_pronostics' as any),
    ]);
    if (sess) {
      setStatus(sess.status as string);
      setCfg({ ...DEFAULT_CFG, ...((sess.config as any) || {}) });
    }
    setEntries(((rows as any[]) || []).map((r) => ({ ...r, data: r.data as Pronostic })));
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel('ballon-dor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${BALLON_DOR_SESSION_ID}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_participations', filter: `session_id=eq.${BALLON_DOR_SESSION_ID}` }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deadline = cfg.deadline_iso ? new Date(cfg.deadline_iso).getTime() : 0;
  const locked = status !== 'active' || (deadline > 0 && now >= deadline);
  const mine = entries.find((e) => e.user_id === user?.id);
  const pot = cfg.total_prize_pool;

  if (loading) {
    return <div className="py-16 text-center text-muted-foreground">Chargement…</div>;
  }

  return (
    <div className="space-y-6">
      <Header cfg={cfg} locked={locked} closed={status === 'closed'} now={now} deadline={deadline} pot={pot} count={entries.length} />

      <div className="flex gap-2 justify-center flex-wrap">
        {([['pronostic', '📝 Mon pronostic'], ['classement', '📊 Classement live'], ['promo', '👀 Pronostics de la promo']] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
              tab === k ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:border-primary/30'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'pronostic' && (
        <PronosticForm cfg={cfg} locked={locked} mine={mine?.data} balance={balance} onSaved={async () => { await refreshProfile(); await loadAll(); }} />
      )}
      {tab === 'classement' && <Ranking entries={entries} cfg={cfg} meId={user?.id} closed={status === 'closed'} />}
      {tab === 'promo' && <PromoList entries={entries} cfg={cfg} locked={locked} />}

      {isAdmin && <AdminCeremony cfg={cfg} status={status} onDone={loadAll} />}
    </div>
  );
}

function Countdown({ ms }: { ms: number }) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="font-mono tabular-nums">
      {d > 0 && `${d}j `}{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(sec).padStart(2, '0')}
    </span>
  );
}

function Header({ cfg, locked, closed, now, deadline, pot, count }: {
  cfg: BallonDorConfig; locked: boolean; closed: boolean; now: number; deadline: number; pot: number; count: number;
}) {
  const p1 = Math.floor(pot * cfg.payout_percentages.first / 100);
  const p2 = Math.floor(pot * cfg.payout_percentages.second / 100);
  const p3 = Math.floor(pot * cfg.payout_percentages.third / 100);
  return (
    <Card className={`p-5 text-center border-2 ${locked && !closed ? 'border-destructive/60' : 'border-primary/50'} bg-gradient-to-b from-primary/15 via-primary/5 to-transparent shadow-[0_0_40px_hsl(var(--primary)/0.15)]`}>
      <p className="text-4xl mb-1">🏆</p>
      <h2 className="text-3xl font-display gold-text tracking-wide">Ballon d'Or 2026</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Pronostique le Top 10 officiel, le trophée Kopa et le trophée Yachine.
      </p>

      <div className="mt-4 rounded-xl border border-primary/40 bg-primary/10 py-3 px-4">
        <p className="font-display text-xl gold-text">
          🏆 Cagnotte Garantie : {pot.toLocaleString('fr-FR')} DC
        </p>
        <div className="flex flex-wrap gap-2 justify-center mt-2 text-sm">
          <Badge variant="secondary">🥇 1er : {p1.toLocaleString('fr-FR')} DC</Badge>
          <Badge variant="secondary">🥈 2e : {p2.toLocaleString('fr-FR')} DC</Badge>
          <Badge variant="secondary">🥉 3e : {p3.toLocaleString('fr-FR')} DC</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center mt-3">
        <Badge variant="outline">Buy-in : {cfg.buy_in} DC</Badge>
        <Badge variant="outline">{count} participant{count > 1 ? 's' : ''}</Badge>
        <Badge variant="outline">Rake 5 % sur les gains nets</Badge>
      </div>

      <div className="mt-4 text-sm">
        {closed ? (
          <span className="text-primary font-medium">Concours terminé — résultats officiels ci-dessous.</span>
        ) : locked ? (
          <span className="inline-flex items-center gap-1 font-display text-lg text-destructive">
            <Lock className="w-5 h-5" /> Saisie verrouillée — la cérémonie est en cours
          </span>
        ) : deadline > 0 ? (
          <span className="text-muted-foreground">⏳ Verrouillage des pronostics dans <span className="text-primary font-medium"><Countdown ms={deadline - now} /></span></span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Barème : 10 pts position exacte · 5 pts à ±1 place · 2 pts joueur présent dans le Top 10 · 5 pts par trophée Kopa / Yachine.
      </p>
    </Card>
  );
}

function PlayerLine({ name }: { name: string }) {
  const n = NOMINEE_BY_NAME[name];
  return (
    <span className="truncate">
      <span className="mr-1">{n?.flag}</span>
      <span className="font-medium">{name}</span>
      {n && <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">· {n.club}</span>}
    </span>
  );
}

function PronosticForm({ cfg, locked, mine, balance, onSaved }: {
  cfg: BallonDorConfig; locked: boolean; mine?: Pronostic; balance: number; onSaved: () => void;
}) {
  const [top10, setTop10] = useState<string[]>(mine?.top10 ?? []);
  const [kopa, setKopa] = useState(mine?.kopa ?? '');
  const [yashin, setYashin] = useState(mine?.yashin ?? '');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    if (mine) { setTop10(mine.top10 || []); setKopa(mine.kopa || ''); setYashin(mine.yashin || ''); }
  }, [mine?.top10?.join('|'), mine?.kopa, mine?.yashin]);

  const available = useMemo(
    () => BALLON_DOR_NOMINEES.filter(
      (n) => !top10.includes(n.name) &&
        (n.name.toLowerCase().includes(search.toLowerCase()) || n.club.toLowerCase().includes(search.toLowerCase())),
    ),
    [top10, search],
  );

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= top10.length) return;
    const next = [...top10];
    [next[i], next[j]] = [next[j], next[i]];
    setTop10(next);
  };

  const drop = (target: number) => {
    if (dragIdx === null || dragIdx === target) return;
    const next = [...top10];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(target, 0, moved);
    setTop10(next);
    setDragIdx(null);
  };

  const save = async () => {
    if (top10.length !== 10) { toast.error('Sélectionne exactement 10 joueurs'); return; }
    if (!kopa || !yashin) { toast.error('Choisis un lauréat Kopa et un lauréat Yachine'); return; }
    if (!mine && balance < cfg.buy_in) {
      toast.error(`Solde insuffisant : il te faut ${cfg.buy_in} DC (solde actuel : ${balance} DC)`);
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('submit_ballon_dor' as any, {
      p_top10: top10, p_kopa: kopa, p_yashin: yashin,
    });
    setSaving(false);
    const res = data as any;
    if (error || !res?.success) {
      toast.error(res?.error || error?.message || 'Erreur lors de l’enregistrement');
      return;
    }
    toast.success(res.charged > 0 ? `Pronostic validé ! −${res.charged} DC` : 'Pronostic mis à jour ✅');
    onSaved();
  };

  if (locked) {
    return (
      <Card className="p-5 space-y-3">
        <h3 className="font-display text-lg">📝 Mon pronostic</h3>
        {mine ? (
          <>
            <ol className="space-y-1">
              {mine.top10.map((p, i) => (
                <li key={p} className="flex items-center gap-2 text-sm">
                  <span className="w-6 text-primary font-display">{i + 1}</span><PlayerLine name={p} />
                </li>
              ))}
            </ol>
            <p className="text-sm">🌟 Kopa : <b>{mine.kopa}</b></p>
            <p className="text-sm">🧤 Yachine : <b>{mine.yashin}</b></p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Tu n'as pas participé à ce concours.</p>
        )}
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4 space-y-3">
        <h3 className="font-display text-lg">🥇 Ton Top 10</h3>
        <p className="text-xs text-muted-foreground">
          Glisse-dépose les joueurs ou utilise les flèches pour ajuster l'ordre.
        </p>
        {top10.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Sélectionne des nommés dans la liste pour composer ton classement.
          </p>
        )}
        <ol className="space-y-2">
          {Array.from({ length: 10 }, (_, i) => {
            const p = top10[i];
            if (!p) {
              return (
                <li
                  key={`empty-${i}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(i)}
                  className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-border text-muted-foreground"
                >
                  <span className="w-7 h-7 rounded-full bg-secondary grid place-items-center text-sm font-display shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-xs italic">Emplacement libre</span>
                </li>
              );
            }
            return (
              <li
                key={p}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(i)}
                className={`flex items-center gap-2 p-2 rounded-lg border bg-card cursor-grab active:cursor-grabbing transition-colors ${
                  dragIdx === i ? 'border-primary opacity-60' : 'border-border hover:border-primary/40'
                }`}
              >
                <span className="w-7 h-7 rounded-full bg-primary/15 text-primary grid place-items-center text-sm font-display shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0"><PlayerLine name={p} /></div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === top10.length - 1}>
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setTop10(top10.filter((x) => x !== p))}>
                  <X className="w-4 h-4" />
                </Button>
              </li>
            );
          })}
        </ol>

        <div className="space-y-2 pt-2">
          <div>
            <label className="text-sm font-medium">🌟 Trophée Kopa</label>
            <Select value={kopa || '__none__'} onValueChange={(v) => setKopa(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Choisis un espoir" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Aucun choix —</SelectItem>
                {KOPA_NOMINEES.map((n) => (
                  <SelectItem key={n.name} value={n.name}>{n.flag} {n.name} · {n.club}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">🧤 Trophée Yachine</label>
            <Select value={yashin || '__none__'} onValueChange={(v) => setYashin(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Choisis un gardien" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Aucun choix —</SelectItem>
                {YACHINE_NOMINEES.map((n) => (
                  <SelectItem key={n.name} value={n.name}>{n.flag} {n.name} · {n.club}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button className="w-full" onClick={save} disabled={saving || top10.length !== 10}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {mine ? 'Mettre à jour mon pronostic (gratuit)' : `Valider mon pronostic (${cfg.buy_in} DC)`}
        </Button>
        {!mine && <p className="text-xs text-muted-foreground text-center">La mise n'est prélevée qu'une seule fois.</p>}
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-display text-lg">⚽ Les 30 nommés</h3>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher un joueur ou un club…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
          {available.map((n) => (
            <button
              key={n.name}
              disabled={top10.length >= 10}
              onClick={() => setTop10([...top10, n.name])}
              className="flex items-center gap-2 p-2 rounded-lg border border-border hover:border-primary/40 hover:bg-secondary/50 text-left disabled:opacity-40"
            >
              <span className="text-lg">{n.flag}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{n.name}</span>
                <span className="block text-xs text-muted-foreground truncate">{n.club} · {n.country}</span>
              </span>
            </button>
          ))}
          {available.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucun joueur disponible.</p>}
        </div>
      </Card>
    </div>
  );
}

function Ranking({ entries, cfg, meId, closed }: { entries: Entry[]; cfg: BallonDorConfig; meId?: string; closed: boolean }) {
  const prizes = [
    Math.floor(cfg.total_prize_pool * cfg.payout_percentages.first / 100),
    Math.floor(cfg.total_prize_pool * cfg.payout_percentages.second / 100),
    Math.floor(cfg.total_prize_pool * cfg.payout_percentages.third / 100),
  ];
  const medals = ['🥇', '🥈', '🥉'];
  const official = (cfg.official_top10 || []).filter(Boolean);
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-display text-lg mb-2">🧮 Barème des points</h3>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div className="flex items-center gap-2"><Badge className="bg-primary text-primary-foreground">+10</Badge> Joueur placé à la position exacte</div>
          <div className="flex items-center gap-2"><Badge variant="secondary">+5</Badge> Joueur décalé d'une seule place</div>
          <div className="flex items-center gap-2"><Badge variant="outline">+2</Badge> Joueur présent dans le Top 10</div>
          <div className="flex items-center gap-2"><Badge variant="secondary">+5</Badge> Bon lauréat Kopa · <Badge variant="secondary">+5</Badge> Yachine</div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-display text-lg mb-2">🎙️ Résultats officiels</h3>
        {official.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune position annoncée pour l'instant — le classement évoluera en direct pendant la cérémonie.</p>
        ) : (
          <ol className="space-y-1">
            {(cfg.official_top10 || []).map((p, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-primary font-display">{i + 1}</span>
                {p ? <PlayerLine name={p} /> : <span className="text-xs italic text-muted-foreground">Non annoncé</span>}
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap gap-2 mt-3 text-sm">
          <Badge variant="outline">🌟 Kopa : {cfg.official_kopa || 'non annoncé'}</Badge>
          <Badge variant="outline">🧤 Yachine : {cfg.official_yashin || 'non annoncé'}</Badge>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-display text-lg">📊 Classement {closed ? 'final' : 'en direct'}</h3>
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div
              key={e.user_id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                e.user_id === meId ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <span className="w-8 text-center font-display text-primary">{medals[i] ?? i + 1}</span>
              <span className="text-xl">{e.emoji ?? '🦌'}</span>
              <span className="flex-1 truncate text-sm font-medium">{e.display_name ?? 'Anonyme'}</span>
              {i < 3 && <span className="text-xs text-muted-foreground hidden sm:inline">{prizes[i].toLocaleString('fr-FR')} DC</span>}
              <Badge variant="secondary">{e.score} pts</Badge>
            </div>
          ))}
          {entries.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Personne n'a encore participé.</p>}
        </div>
      </Card>
    </div>
  );
}

function PromoList({ entries, cfg, locked }: { entries: Entry[]; cfg: BallonDorConfig; locked: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const shown = entries.filter((e) => (e.display_name ?? 'Anonyme').toLowerCase().includes(filter.toLowerCase()));
  if (!locked) {
    return (
      <Card className="p-6 text-center space-y-2">
        <p className="text-4xl">🔒</p>
        <h3 className="font-display text-lg">Pronostics secrets</h3>
        <p className="text-sm text-muted-foreground">
          Les pronostics de la promo seront visibles dès le verrouillage, au début de la cérémonie.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Filtrer par participant…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {shown.map((e) => (
        <Card key={e.user_id} className="p-4">
          <button className="w-full flex items-center gap-3" onClick={() => setOpen(open === e.user_id ? null : e.user_id)}>
            <span className="text-xl">{e.emoji ?? '🦌'}</span>
            <span className="flex-1 text-left text-sm font-medium truncate">{e.display_name ?? 'Anonyme'}</span>
            <Badge variant="secondary">{e.score} pts</Badge>
          </button>
          {open === e.user_id && (
            <div className="mt-3 space-y-1 border-t border-border pt-3">
              <ol className="space-y-1">
                {e.data.top10?.map((p, i) => {
                  const pts = positionPoints(p, i + 1, cfg.official_top10 || []);
                  return (
                    <li
                      key={p}
                      className={`flex items-center gap-2 text-sm rounded-md px-1 ${pts === 10 ? 'bg-primary/10 border border-primary/40' : ''}`}
                    >
                      <span className="w-6 text-primary font-display">{i + 1}</span>
                      <span className="flex-1 min-w-0"><PlayerLine name={p} /></span>
                      {pts !== null && (
                        <Badge
                          variant={pts === 10 ? 'default' : 'outline'}
                          className={`text-xs ${pts === 10 ? 'bg-primary text-primary-foreground' : ''}`}
                        >
                          {pts === 10 ? '🎯 ' : ''}+{pts}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ol>
              <p className="text-sm pt-2">
                🌟 Kopa : <b>{e.data.kopa}</b>{' '}
                {cfg.official_kopa && cfg.official_kopa === e.data.kopa && <Badge className="bg-primary text-primary-foreground text-xs">+5</Badge>}
              </p>
              <p className="text-sm">
                🧤 Yachine : <b>{e.data.yashin}</b>{' '}
                {cfg.official_yashin && cfg.official_yashin === e.data.yashin && <Badge className="bg-primary text-primary-foreground text-xs">+5</Badge>}
              </p>
            </div>
          )}
        </Card>
      ))}
      {shown.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucun pronostic trouvé.</p>}
    </div>
  );
}


function AdminCeremony({ cfg, status, onDone }: { cfg: BallonDorConfig; status: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [top10, setTop10] = useState<string[]>(() => Array.from({ length: 10 }, (_, i) => cfg.official_top10?.[i] ?? ''));
  const [kopa, setKopa] = useState(cfg.official_kopa || '');
  const [yashin, setYashin] = useState(cfg.official_yashin || '');
  const [deadline, setDeadline] = useState(cfg.deadline_iso ? cfg.deadline_iso.slice(0, 16) : '');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const unlockAt = cfg.admin_unlock_iso ? new Date(cfg.admin_unlock_iso).getTime() : 0;
  const adminLocked = unlockAt > 0 && tick < unlockAt;

  useEffect(() => {
    setTop10(Array.from({ length: 10 }, (_, i) => cfg.official_top10?.[i] ?? ''));
    setKopa(cfg.official_kopa || '');
    setYashin(cfg.official_yashin || '');
  }, [cfg.official_top10?.join('|'), cfg.official_kopa, cfg.official_yashin]);

  const saveConfig = async (patch: Record<string, unknown>, msg: string) => {
    setBusy(true);
    const { error } = await supabase
      .from('game_sessions')
      .update({ config: { ...cfg, ...patch } as any, updated_at: new Date().toISOString() })
      .eq('id', BALLON_DOR_SESSION_ID);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(msg);
    onDone();
  };

  const lockNow = () => saveConfig({ deadline_iso: new Date().toISOString() }, 'Pronostics verrouillés 🔒');

  const distribute = async () => {
    if (!confirm('Clôturer le concours et distribuer la cagnotte ? Action irréversible.')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('resolve_ballon_dor' as any);
    setBusy(false);
    const res = data as any;
    if (error || !res?.success) { toast.error(res?.error || error?.message || 'Erreur'); return; }
    toast.success('Cagnotte distribuée 🏆');
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Shield className="w-4 h-4 mr-2" /> Direct Cérémonie (admin)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>🎙️ Direct Cérémonie — Ballon d'Or 2026</DialogTitle></DialogHeader>

        {adminLocked ? (
          <div className="py-8 text-center space-y-3">
            <Lock className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="font-display text-lg">Panneau verrouillé</p>
            <p className="text-sm text-muted-foreground">
              La saisie des résultats officiels s'ouvrira le{' '}
              {new Date(unlockAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}.
            </p>
            <p className="text-sm">Ouverture dans <span className="text-primary font-medium"><Countdown ms={unlockAt - tick} /></span></p>
          </div>
        ) : (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="secondary" onClick={lockNow} disabled={busy}>
              <Lock className="w-4 h-4 mr-1" /> Verrouiller maintenant
            </Button>
            <Button size="sm" onClick={distribute} disabled={busy || status === 'closed'}>
              <Trophy className="w-4 h-4 mr-1" /> Clôturer et distribuer les {cfg.total_prize_pool.toLocaleString('fr-FR')} DC
            </Button>
          </div>


          <div>
            <label className="text-sm font-medium">Date limite des pronostics</label>
            <div className="flex gap-2">
              <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <Button size="sm" variant="outline" disabled={busy || !deadline}
                onClick={() => saveConfig({ deadline_iso: new Date(deadline).toISOString() }, 'Date limite mise à jour')}>
                OK
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Classement officiel (annonce position par position)</p>
            {top10.map((val, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-primary font-display text-sm">{i + 1}</span>
                <Select value={val || '__none__'} onValueChange={(v) => {
                  const next = [...top10];
                  next[i] = v === '__none__' ? '' : v;
                  setTop10(next);
                }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Non annoncé" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Non annoncé —</SelectItem>
                    {BALLON_DOR_NOMINEES.map((n) => (
                      <SelectItem key={n.name} value={n.name}>{n.flag} {n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div>
            <label className="text-sm font-medium">🌟 Lauréat Kopa</label>
            <Select value={kopa || '__none__'} onValueChange={(v) => setKopa(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Non annoncé" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Non annoncé —</SelectItem>
                {KOPA_NOMINEES.map((n) => <SelectItem key={n.name} value={n.name}>{n.flag} {n.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">🧤 Lauréat Yachine</label>
            <Select value={yashin || '__none__'} onValueChange={(v) => setYashin(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Non annoncé" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Non annoncé —</SelectItem>
                {YACHINE_NOMINEES.map((n) => <SelectItem key={n.name} value={n.name}>{n.flag} {n.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full"
            disabled={busy}
            onClick={() => saveConfig(
              { official_top10: top10, official_kopa: kopa, official_yashin: yashin },
              'Avancement sauvegardé — points recalculés ⚡',
            )}
          >
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Sauvegarder l'avancement
          </Button>
        </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
