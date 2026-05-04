import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Crown, Star, Trophy, Target, Sparkles, Repeat,
  Download, Heart, Zap, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PROMO_NAMES } from '@/lib/pari-mutuel';

const FIXED_MINISTRIES = [
  { id: 'interieur', label: 'Intérieur', regalian: true },
  { id: 'armees', label: 'Armées', regalian: true },
  { id: 'travail', label: 'Travail', regalian: false },
  { id: 'ecologie', label: 'Transition écologique', regalian: false },
  { id: 'justice', label: 'Justice', regalian: true },
  { id: 'economie', label: 'Économie & Finances', regalian: true },
  { id: 'agriculture', label: 'Agriculture', regalian: false },
  { id: 'education', label: 'Éducation nationale et Enseignement supérieur', regalian: false },
  { id: 'affaires_etrangeres', label: 'Affaires étrangères', regalian: true },
  { id: 'sante', label: 'Santé', regalian: false },
  { id: 'culture', label: 'Culture', regalian: false },
  { id: 'sports', label: 'Sports', regalian: false },
  { id: 'numerique', label: 'Numérique', regalian: false },
  { id: 'comptes_publics', label: 'Comptes Publics', regalian: false },
];

const MINISTRY_LABEL: Record<string, string> = Object.fromEntries(
  FIXED_MINISTRIES.map(m => [m.id, m.label])
);
const MINISTRY_REGALIAN: Record<string, boolean> = Object.fromEntries(
  FIXED_MINISTRIES.map(m => [m.id, m.regalian])
);
const MINISTRY_EMOJIS: Record<string, string> = {
  interieur: '🚨', armees: '⚔️', travail: '🔧', ecologie: '🌿',
  justice: '⚖️', economie: '💰', agriculture: '🌾', education: '🎓',
  affaires_etrangeres: '🌍', sante: '🏥', culture: '🎭',
  sports: '🏆', numerique: '💻', comptes_publics: '📊',
};

const MIN_CITATIONS_FOR_AWARD = 3;

interface GouvData {
  ministers: Record<string, string>;
  custom_ministries: { name: string; person: string }[];
  comment?: string;
  gov_number: number;
  gov_name: string;
  created_at?: string;
  creator_name?: string;
}
interface AllGouv { user_id: string; data: GouvData; }
interface ProfileLite { display_name: string; emoji: string | null; balance: number; }

interface Props {
  allGouvs: AllGouv[];
  profiles: Record<string, ProfileLite>;
  currentUserId?: string | null;
  onDownloadDreamTeamPDF: (gouv: GouvData) => void;
}

export default function GouvernementStats({
  allGouvs, profiles, currentUserId, onDownloadDreamTeamPDF,
}: Props) {
  const [comparePersonName, setComparePersonName] = useState('');

  const validGouvs = useMemo(() =>
    allGouvs.filter(g =>
      g.data?.gov_name && (
        Object.values(g.data.ministers || {}).some(Boolean) ||
        (g.data.custom_ministries || []).some(cm => cm.person)
      )
    ), [allGouvs]);

  const latestByUser = useMemo(() => {
    const map: Record<string, AllGouv> = {};
    validGouvs.forEach(g => {
      const ts = new Date(g.data.created_at || 0).getTime();
      const ets = map[g.user_id]
        ? new Date(map[g.user_id].data.created_at || 0).getTime() : -1;
      if (!map[g.user_id] || ts > ets) map[g.user_id] = g;
    });
    return map;
  }, [validGouvs]);

  const events = useMemo(() => {
    type Ev = { person: string; ministryId: string | null; customName?: string };
    const out: Ev[] = [];
    validGouvs.forEach(g => {
      Object.entries(g.data.ministers || {}).forEach(([mid, p]) => {
        if (p) out.push({ person: p, ministryId: mid });
      });
      (g.data.custom_ministries || []).forEach(cm => {
        if (cm.person && cm.name?.trim())
          out.push({ person: cm.person, ministryId: null, customName: cm.name.trim() });
      });
    });
    return out;
  }, [validGouvs]);

  const personTotal = useMemo(() => {
    const m: Record<string, number> = {};
    events.forEach(e => { m[e.person] = (m[e.person] || 0) + 1; });
    return m;
  }, [events]);

  const personByMinistry = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    events.forEach(e => {
      if (!e.ministryId) return;
      if (!m[e.person]) m[e.person] = {};
      m[e.person][e.ministryId] = (m[e.person][e.ministryId] || 0) + 1;
    });
    return m;
  }, [events]);

  const ministryToPersons = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    FIXED_MINISTRIES.forEach(mn => { m[mn.id] = {}; });
    events.forEach(e => {
      if (!e.ministryId) return;
      m[e.ministryId][e.person] = (m[e.ministryId][e.person] || 0) + 1;
    });
    return m;
  }, [events]);

  const customMinistryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    events.forEach(e => { if (e.customName) m[e.customName] = (m[e.customName] || 0) + 1; });
    return m;
  }, [events]);

  const top10 = useMemo(() =>
    Object.entries(personTotal).sort((a, b) => b[1] - a[1]).slice(0, 10),
    [personTotal]);

  const top3PerMinistry = useMemo(() => {
    const out: Record<string, [string, number][]> = {};
    FIXED_MINISTRIES.forEach(m => {
      out[m.id] = Object.entries(ministryToPersons[m.id] || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 3);
    });
    return out;
  }, [ministryToPersons]);

  const dreamTeam = useMemo<GouvData>(() => {
    const ministers: Record<string, string> = {};
    FIXED_MINISTRIES.forEach(m => {
      const top = top3PerMinistry[m.id]?.[0];
      if (top) ministers[m.id] = top[0];
    });
    return {
      ministers,
      custom_ministries: [],
      gov_number: 0,
      gov_name: 'Dream Team de la promo',
      creator_name: 'La Promo',
      created_at: new Date().toISOString(),
    };
  }, [top3PerMinistry]);

  const regalien = useMemo(() => {
    const c: Array<{ person: string; ratio: number; reg: number; total: number }> = [];
    Object.entries(personTotal).forEach(([person, total]) => {
      if (total < MIN_CITATIONS_FOR_AWARD) return;
      const byM = personByMinistry[person] || {};
      const reg = Object.entries(byM).reduce(
        (acc, [mid, ct]) => acc + (MINISTRY_REGALIAN[mid] ? ct : 0), 0
      );
      c.push({ person, ratio: reg / total, reg, total });
    });
    c.sort((a, b) => b.ratio - a.ratio || b.reg - a.reg);
    return c[0];
  }, [personTotal, personByMinistry]);

  const polyvalent = useMemo(() => {
    const c: Array<{ person: string; distinct: number; total: number }> = [];
    Object.entries(personByMinistry).forEach(([person, byM]) => {
      c.push({ person, distinct: Object.keys(byM).length, total: personTotal[person] || 0 });
    });
    c.sort((a, b) => b.distinct - a.distinct || b.total - a.total);
    return c[0];
  }, [personByMinistry, personTotal]);

  const specialiste = useMemo(() => {
    const c: Array<{ person: string; ministryId: string; share: number; count: number; total: number }> = [];
    Object.entries(personByMinistry).forEach(([person, byM]) => {
      const total = personTotal[person] || 0;
      if (total < MIN_CITATIONS_FOR_AWARD) return;
      let bestMid = ''; let bestC = 0;
      Object.entries(byM).forEach(([mid, ct]) => { if (ct > bestC) { bestC = ct; bestMid = mid; } });
      const share = bestC / total;
      if (share >= 0.9) c.push({ person, ministryId: bestMid, share, count: bestC, total });
    });
    c.sort((a, b) => b.share - a.share || b.total - a.total);
    return c[0];
  }, [personByMinistry, personTotal]);

  const ministryEntropy = useMemo(() => {
    const out: Array<{
      id: string; label: string; entropy: number; total: number;
      topPerson: string; topCount: number; distinctCount: number;
    }> = [];
    FIXED_MINISTRIES.forEach(m => {
      const counts = ministryToPersons[m.id] || {};
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total === 0) return;
      let entropy = 0;
      Object.values(counts).forEach(ct => {
        const p = ct / total;
        if (p > 0) entropy -= p * Math.log2(p);
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      out.push({
        id: m.id, label: m.label, entropy, total,
        topPerson: sorted[0]?.[0] || '',
        topCount: sorted[0]?.[1] || 0,
        distinctCount: Object.keys(counts).length,
      });
    });
    return out;
  }, [ministryToPersons]);

  const consensual = useMemo(
    () => [...ministryEntropy].sort((a, b) => a.entropy - b.entropy).slice(0, 3),
    [ministryEntropy]
  );
  const divisive = useMemo(
    () => [...ministryEntropy].sort((a, b) => b.entropy - a.entropy).slice(0, 3),
    [ministryEntropy]
  );

  const customHallOfFame = useMemo(
    () => Object.entries(customMinistryCounts).sort((a, b) => b[1] - a[1]),
    [customMinistryCounts]
  );

  const dinosaures = useMemo(() => {
    const count: Record<string, number> = {};
    validGouvs.forEach(g => { count[g.user_id] = (count[g.user_id] || 0) + 1; });
    return Object.entries(count)
      .filter(([_, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [validGouvs]);

  const currentUserGouv = currentUserId ? latestByUser[currentUserId] : undefined;

  const compareUserId = useMemo(() => {
    if (!comparePersonName) return null;
    return Object.entries(profiles).find(
      ([_, p]) => p.display_name === comparePersonName
    )?.[0] || null;
  }, [comparePersonName, profiles]);
  const compareUserGouv = compareUserId ? latestByUser[compareUserId] : undefined;

  const computeCompat = (a?: AllGouv, b?: AllGouv): number => {
    if (!a || !b) return 0;
    const am = a.data.ministers || {};
    const bm = b.data.ministers || {};
    let matches = 0;
    FIXED_MINISTRIES.forEach(m => {
      if (am[m.id] && am[m.id] === bm[m.id]) matches++;
    });
    return Math.round((matches / FIXED_MINISTRIES.length) * 100);
  };

  const compatScore = useMemo(
    () => computeCompat(currentUserGouv, compareUserGouv),
    [currentUserGouv, compareUserGouv]
  );

  const { jumeau, oppose } = useMemo(() => {
    type R = { userId: string; name: string; score: number } | null;
    if (!currentUserGouv) return { jumeau: null as R, oppose: null as R };
    const others = Object.entries(latestByUser).filter(([uid]) => uid !== currentUserId);
    let best: R = null; let worst: R = null;
    others.forEach(([uid, g]) => {
      const score = computeCompat(currentUserGouv, g);
      const name = profiles[uid]?.display_name || g.data.creator_name || 'DAIM';
      if (!best || score > best.score) best = { userId: uid, name, score };
      if (!worst || score < worst.score) worst = { userId: uid, name, score };
    });
    return { jumeau: best, oppose: worst };
  }, [latestByUser, currentUserGouv, currentUserId, profiles]);

  const compareCandidates = useMemo(() => {
    const myName = currentUserId ? profiles[currentUserId]?.display_name : '';
    return PROMO_NAMES.filter(n => n !== myName).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [profiles, currentUserId]);

  if (validGouvs.length === 0) {
    return (
      <div className="mt-12 p-6 rounded-lg border border-border bg-card text-center text-muted-foreground">
        Aucun gouvernement n'a encore été formé. Sois le premier ! 🏛️
      </div>
    );
  }

  return (
    <div className="mt-12 space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Trophy className="w-7 h-7 text-primary" /> Classements de la promo
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Données calculées sur {validGouvs.length} gouvernement{validGouvs.length > 1 ? 's' : ''} formé{validGouvs.length > 1 ? 's' : ''}.
        </p>
      </div>

      {/* Dream Team */}
      <section className="p-5 rounded-lg border border-primary/40 bg-card">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Dream Team de la promo
            </h3>
            <p className="text-xs text-muted-foreground">
              Pour chaque ministère, le DAIM le plus cité.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onDownloadDreamTeamPDF(dreamTeam)}>
            <Download className="w-4 h-4" /> PDF
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FIXED_MINISTRIES.map(m => {
            const person = dreamTeam.ministers[m.id];
            return (
              <div key={m.id} className="flex items-center gap-2 p-2 rounded bg-muted/40">
                <span className="text-lg">{MINISTRY_EMOJIS[m.id]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {m.regalian && <Crown className="w-3 h-3 text-primary" />} {m.label}
                  </div>
                  <div className={`text-sm font-medium truncate ${person ? '' : 'italic text-muted-foreground'}`}>
                    {person || '— vacant —'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top 10 */}
      <section className="p-5 rounded-lg border border-border bg-card">
        <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
          <Star className="w-5 h-5 text-primary" /> Top 10 des plus cité·es (toutes époques)
        </h3>
        <div className="space-y-1">
          {top10.map(([name, count], i) => (
            <div key={name} className="flex items-center justify-between p-2 rounded bg-muted/30">
              <span className="flex items-center gap-2">
                <span className="text-lg w-8 text-center">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <span className="font-medium">{name}</span>
              </span>
              <span className="text-sm text-muted-foreground">{count} citation{count > 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Top 3 per ministry */}
      <section className="p-5 rounded-lg border border-border bg-card">
        <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" /> Top 3 par ministère
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIXED_MINISTRIES.map(m => (
            <div key={m.id} className="p-3 rounded bg-muted/30">
              <div className="text-xs font-semibold flex items-center gap-1 mb-2">
                <span>{MINISTRY_EMOJIS[m.id]}</span>
                {m.regalian && <Crown className="w-3 h-3 text-primary" />}
                <span>{m.label}</span>
              </div>
              <div className="space-y-1">
                {top3PerMinistry[m.id]?.length ? top3PerMinistry[m.id].map(([p, c], i) => (
                  <div key={p} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                      <span>{p}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{c}</span>
                  </div>
                )) : <p className="text-xs italic text-muted-foreground">Aucune citation</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Awards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {regalien ? (
          <div className="p-4 rounded-lg border border-primary/40 bg-card">
            <div className="text-sm font-semibold flex items-center gap-2 mb-1">
              <Crown className="w-4 h-4 text-primary" /> Le/La Régalien·ne
            </div>
            <p className="text-lg font-bold">{regalien.person}</p>
            <p className="text-xs text-muted-foreground">
              {regalien.reg}/{regalien.total} citations en ministère régalien ({Math.round(regalien.ratio * 100)}%)
            </p>
          </div>
        ) : <AwardEmpty icon={<Crown className="w-4 h-4 text-primary" />} title="Le/La Régalien·ne" />}
        {polyvalent ? (
          <div className="p-4 rounded-lg border border-primary/40 bg-card">
            <div className="text-sm font-semibold flex items-center gap-2 mb-1">
              <Repeat className="w-4 h-4 text-primary" /> Le/La Polyvalent·e
            </div>
            <p className="text-lg font-bold">{polyvalent.person}</p>
            <p className="text-xs text-muted-foreground">
              Cité·e dans {polyvalent.distinct}/14 ministères différents
            </p>
          </div>
        ) : <AwardEmpty icon={<Repeat className="w-4 h-4 text-primary" />} title="Le/La Polyvalent·e" />}
        {specialiste ? (
          <div className="p-4 rounded-lg border border-primary/40 bg-card">
            <div className="text-sm font-semibold flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-primary" /> Le/La Spécialiste
            </div>
            <p className="text-lg font-bold">{specialiste.person}</p>
            <p className="text-xs text-muted-foreground">
              {Math.round(specialiste.share * 100)}% des citations sur {MINISTRY_LABEL[specialiste.ministryId]} ({specialiste.count}/{specialiste.total})
            </p>
          </div>
        ) : <AwardEmpty icon={<Zap className="w-4 h-4 text-primary" />} title="Le/La Spécialiste" hint="≥3 citations dont ≥90% sur un seul ministère" />}
      </section>

      {/* Consensus / divisive */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-4 rounded-lg border border-border bg-card">
          <h4 className="font-semibold mb-2">🟢 Ministères les plus consensuels</h4>
          <div className="space-y-1 text-sm">
            {consensual.map(c => (
              <div key={c.id} className="flex justify-between gap-2">
                <span>{MINISTRY_EMOJIS[c.id]} {c.label}</span>
                <span className="text-xs text-muted-foreground">
                  {c.topPerson} ({c.topCount}/{c.total})
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <h4 className="font-semibold mb-2">🔴 Ministères les plus clivants</h4>
          <div className="space-y-1 text-sm">
            {divisive.map(c => (
              <div key={c.id} className="flex justify-between gap-2">
                <span>{MINISTRY_EMOJIS[c.id]} {c.label}</span>
                <span className="text-xs text-muted-foreground">
                  {c.distinctCount} candidat·es
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Custom ministries */}
      {customHallOfFame.length > 0 && (
        <section className="p-4 rounded-lg border border-border bg-card">
          <h4 className="font-semibold mb-2">📝 Hall of Fame des ministères perso</h4>
          <div className="flex flex-wrap gap-2">
            {customHallOfFame.map(([name, count]) => (
              <span key={name} className="px-2 py-1 rounded-full bg-muted text-xs">
                {name} ×{count}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Dinosaures */}
      {dinosaures.length > 0 && (
        <section className="p-5 rounded-lg border border-border bg-card">
          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Les dinosaures de la 3e République
          </h3>
          <p className="text-xs text-muted-foreground mb-3">Ceux qui font le plus de remaniements.</p>
          <div className="space-y-1">
            {dinosaures.map(([uid, count], i) => {
              const pr = profiles[uid];
              return (
                <div key={uid} className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <span className="flex items-center gap-2">
                    <span className="text-lg w-8 text-center">
                      {i === 0 ? '🦖' : i === 1 ? '🦕' : i === 2 ? '🐲' : `#${i + 1}`}
                    </span>
                    <span>{pr?.emoji || '🦌'}</span>
                    <span className="font-medium">{pr?.display_name || 'DAIM'}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">{count} gouvernements</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 1-vs-1 comparison */}
      <section className="p-5 rounded-lg border border-primary/40 bg-card">
        <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
          <Heart className="w-5 h-5 text-primary" /> Comparaison 1-vs-1
        </h3>

        {!currentUserId ? (
          <p className="text-sm text-muted-foreground">
            Connecte-toi pour comparer ton gouvernement avec un·e autre DAIM.
          </p>
        ) : !currentUserGouv ? (
          <p className="text-sm text-muted-foreground">
            Forme d'abord ton gouvernement pour pouvoir te comparer.
          </p>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">
                Choisis un·e DAIM pour voir le score de compatibilité :
              </p>
              <Select value={comparePersonName || '__none__'} onValueChange={(v) => setComparePersonName(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Choisir un·e DAIM…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— aucun —</SelectItem>
                  {compareCandidates.map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {comparePersonName && !compareUserGouv && (
              <p className="text-sm italic text-muted-foreground">
                {comparePersonName} n'a pas encore formé de gouvernement.
              </p>
            )}

            {comparePersonName && compareUserGouv && (
              <>
                <div className="mb-4 p-4 rounded-lg bg-muted/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">Score de compatibilité</span>
                    <span className="text-2xl font-bold text-primary">{compatScore}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${compatScore}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-full grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-sm">
                    <div className="text-xs font-semibold text-muted-foreground">Ministère</div>
                    <div className="text-xs font-semibold text-muted-foreground">Toi</div>
                    <div className="text-xs font-semibold text-muted-foreground">{comparePersonName}</div>
                    {FIXED_MINISTRIES.map(m => {
                      const a = currentUserGouv.data.ministers?.[m.id] || '';
                      const b = compareUserGouv.data.ministers?.[m.id] || '';
                      const match = a && a === b;
                      return (
                        <div key={m.id} className="contents">
                          <span className="flex items-center gap-1 truncate">
                            <span>{MINISTRY_EMOJIS[m.id]}</span>
                            <span className="truncate">{m.label}</span>
                          </span>
                          <span className={match ? 'font-semibold text-primary' : ''}>
                            {a || '—'}
                          </span>
                          <span className={match ? 'font-semibold text-primary' : ''}>
                            {b || '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="text-sm font-semibold mb-1">👯 Ton jumeau gouvernemental</div>
                {jumeau ? (
                  <p className="text-sm">
                    <span className="font-bold">{jumeau.name}</span>{' '}
                    <span className="text-muted-foreground">({jumeau.score}%)</span>
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    Pas encore de comparaison disponible.
                  </p>
                )}
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="text-sm font-semibold mb-1">⚔️ Ton opposé politique</div>
                {oppose ? (
                  <p className="text-sm">
                    <span className="font-bold">{oppose.name}</span>{' '}
                    <span className="text-muted-foreground">({oppose.score}%)</span>
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    Pas encore de comparaison disponible.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function AwardEmpty({
  icon, title, hint,
}: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card opacity-70">
      <div className="text-sm font-semibold flex items-center gap-2 mb-1">
        {icon} {title}
      </div>
      <p className="text-xs italic text-muted-foreground">
        Pas encore désigné·e{hint ? ` (${hint})` : ''}.
      </p>
    </div>
  );
}