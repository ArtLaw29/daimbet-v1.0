import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import type { Tables } from '@/integrations/supabase/types';
import { INTRO_CLASSEMENT } from '@/components/TabIntro';

type Profile = Tables<'profiles'>;
type SoldeHistory = Tables<'solde_history'>;

type FilterType = 'week' | 'month' | 'all';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'week', label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
  { key: 'all', label: 'Depuis le début' },
];

function getMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff, 0, 0, 0, 0);
  return monday;
}

function getFirstOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [soldeHistory, setSoldeHistory] = useState<SoldeHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [resolvedThisWeek, setResolvedThisWeek] = useState(false);

  const fetchAll = useCallback(async () => {
    const monday = getMonday().toISOString();
    const [profRes, histRes, betsRes] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('solde_history').select('*').gte('created_at', getFirstOfMonth().toISOString()),
      supabase.from('bets').select('id').eq('status', 'resolu').gte('updated_at', monday),
    ]);
    setProfiles(profRes.data || []);
    setSoldeHistory(histRes.data || []);
    setResolvedThisWeek((betsRes.data || []).length > 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Compute rankings
  const ranked = useMemo(() => {
    const monday = getMonday();
    const firstOfMonth = getFirstOfMonth();

    return profiles.map(p => {
      const userHistory = soldeHistory.filter(h => h.user_id === p.user_id);

      // Week: sum of all deltas since Monday
      const weekDelta = userHistory
        .filter(h => new Date(h.created_at) >= monday)
        .reduce((s, h) => s + h.delta_dc, 0);

      // Approximate balance at Monday = current balance - weekDelta
      const balanceAtMonday = p.balance - weekDelta;
      const weekPct = balanceAtMonday > 0 ? (weekDelta / balanceAtMonday) * 100 : 0;

      // Month: sum of gain deltas since 1st
      const monthGains = userHistory
        .filter(h => new Date(h.created_at) >= firstOfMonth && h.reason.toLowerCase().startsWith('gain'))
        .reduce((s, h) => s + h.delta_dc, 0);

      // Month %: sum of all deltas since 1st / balance at 1st
      const monthDelta = userHistory
        .filter(h => new Date(h.created_at) >= firstOfMonth)
        .reduce((s, h) => s + h.delta_dc, 0);
      const balanceAtFirst = p.balance - monthDelta;
      const monthPct = balanceAtFirst > 0 ? (monthDelta / balanceAtFirst) * 100 : 0;

      return {
        ...p,
        weekPct,
        monthPct,
        monthGains,
      };
    });
  }, [profiles, soldeHistory]);

  const sorted = useMemo(() => {
    const list = [...ranked];
    if (filter === 'week') list.sort((a, b) => b.weekPct - a.weekPct);
    else if (filter === 'month') list.sort((a, b) => b.monthPct - a.monthPct);
    else list.sort((a, b) => b.balance - a.balance);
    return list;
  }, [ranked, filter]);

  // Assign ranks with ties
  const rankedList = useMemo(() => {
    let currentRank = 1;
    return sorted.map((entry, i) => {
      const getValue = (e: typeof entry) =>
        filter === 'week' ? e.weekPct : filter === 'month' ? e.monthPct : e.balance;
      if (i > 0 && getValue(sorted[i]) < getValue(sorted[i - 1])) {
        currentRank = i + 1;
      }
      return { ...entry, rank: currentRank };
    });
  }, [sorted, filter]);

  const myRank = rankedList.find(r => r.user_id === user?.id);
  const medals = ['🥇', '🥈', '🥉'];

  const formatValue = (entry: typeof rankedList[0]) => {
    if (filter === 'week') return `${entry.weekPct >= 0 ? '+' : ''}${entry.weekPct.toFixed(1)}%`;
    if (filter === 'month') return `${entry.monthPct >= 0 ? '+' : ''}${entry.monthPct.toFixed(1)}%`;
    return `${entry.balance} DC`;
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl pb-20 md:pb-6">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-display gold-text">🏆 Classement</h1>
      </div>
      {INTRO_CLASSEMENT}

      {/* My rank sticky */}
      {myRank && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border border-primary/30 rounded-xl p-3 mb-4 flex items-center gap-3">
          <span className="text-lg font-display text-primary">{myRank.rank}ème</span>
          <span className="text-sm text-muted-foreground">/ {profiles.length}</span>
          <div className="flex-1" />
          <span className="font-bold text-primary">{formatValue(myRank)}</span>
          {filter === 'all' && <img src={daimcoinLogo} alt="" className="w-5 h-5 rounded-full" />}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-5">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${
              filter === f.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Week filter: check if any bet resolved */}
      {filter === 'week' && !resolvedThisWeek ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">📊 Classement disponible dès la résolution du premier pari de la semaine 🦌</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rankedList.map((entry, i) => {
            const isMe = entry.user_id === user?.id;
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.5) }}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  isMe
                    ? 'border-primary/40 bg-primary/10'
                    : entry.rank <= 3
                      ? 'border-primary/20 bg-primary/5'
                      : 'border-border bg-card'
                }`}>
                <span className="text-xl w-8 text-center shrink-0">
                  {entry.rank <= 3 ? medals[entry.rank - 1] : <span className="text-xs text-muted-foreground">#{entry.rank}</span>}
                </span>
                <div className="flex-1 min-w-0">
                  <span className={`font-semibold text-sm truncate block ${isMe ? 'text-primary' : ''}`}>
                    {entry.emoji || '🦌'} {entry.display_name || 'Anonyme'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`font-bold text-sm ${
                    filter !== 'all'
                      ? (filter === 'week' ? entry.weekPct : entry.monthPct) >= 0
                        ? 'text-green-500'
                        : 'text-destructive'
                      : 'text-primary'
                  }`}>
                    {formatValue(entry)}
                  </span>
                  {filter === 'all' && <img src={daimcoinLogo} alt="" className="w-4 h-4 rounded-full" />}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
