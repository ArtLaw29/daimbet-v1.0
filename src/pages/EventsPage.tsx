import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Timer, Tag, Flame } from 'lucide-react';
import { calculateEstimatedNetGain } from '@/lib/pari-mutuel';
import { INTRO_PARIS } from '@/components/TabIntro';
import BetCard, { type BetWithOptions, type UserWager } from '@/components/BetCard';
import BetBottomSheet from '@/components/BetBottomSheet';
import ProposeNewDialog from '@/components/ProposeNewDialog';
import PendingProposalsSection from '@/components/PendingProposalsSection';

type SortMode = 'urgence' | 'categorie' | 'popularite';

const SORT_OPTIONS: { value: SortMode; label: string; icon: React.ElementType }[] = [
  { value: 'urgence', label: 'Par urgence', icon: Timer },
  { value: 'categorie', label: 'Par catégorie', icon: Tag },
  { value: 'popularite', label: 'Par popularité', icon: Flame },
];

export default function EventsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [bets, setBets] = useState<BetWithOptions[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetBet, setSheetBet] = useState<BetWithOptions | null>(null);
  const [wagerPools, setWagerPools] = useState<Record<string, Record<string, number>>>({});
  const [betTotals, setBetTotals] = useState<Record<string, number>>({});
  const [wagerCounts, setWagerCounts] = useState<Record<string, number>>({});
  const [userWagers, setUserWagers] = useState<Record<string, UserWager>>({});
  const [parisSuspended, setParisSuspended] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    return (sessionStorage.getItem('daimbet-sort') as SortMode) || 'urgence';
  });

  useEffect(() => {
    fetchAll();
    // Realtime subscriptions
    const betChannel = supabase
      .channel('feed-bets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wagers' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(betChannel); };
  }, [user]);

  const fetchAll = useCallback(async () => {
    // Check suspension
    const { data: suspData } = await supabase.from('platform_settings').select('value').eq('key', 'suspend_paris').maybeSingle();
    setParisSuspended(suspData?.value === 'true');
    await fetchBets();
  }, [user]);

  const fetchBets = async () => {
    const { data, error } = await supabase
      .from('bets')
      .select('*, bet_options(*)')
      .in('status', ['ouvert', 'cloture_en_attente', 'suspendu'])
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Erreur chargement des paris');
      setLoading(false);
      return;
    }
    const items = (data as BetWithOptions[]) || [];
    setBets(items);

    if (items.length > 0) {
      const betIds = items.map(b => b.id);
      const { data: wagers } = await supabase
        .from('wagers')
        .select('bet_id, option_id, montant_dc, is_retracted, user_id')
        .in('bet_id', betIds);
      if (wagers) {
        const pools: Record<string, Record<string, number>> = {};
        const totals: Record<string, number> = {};
        const counts: Record<string, Set<string>> = {};
        const myWagers: Record<string, UserWager> = {};

        for (const w of wagers) {
          if (!w.is_retracted) {
            if (!pools[w.bet_id]) pools[w.bet_id] = {};
            pools[w.bet_id][w.option_id] = (pools[w.bet_id][w.option_id] || 0) + w.montant_dc;
            totals[w.bet_id] = (totals[w.bet_id] || 0) + w.montant_dc;
            if (!counts[w.bet_id]) counts[w.bet_id] = new Set();
            counts[w.bet_id].add(w.user_id);

            if (user && w.user_id === user.id) {
              const opt = items.flatMap(b => b.bet_options).find(o => o.id === w.option_id);
              myWagers[w.bet_id] = {
                bet_id: w.bet_id,
                option_id: w.option_id,
                montant_dc: w.montant_dc,
                option_label: opt?.label,
              };
            }
          }
        }
        setWagerPools(pools);
        setBetTotals(totals);
        setWagerCounts(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.size])));
        setUserWagers(myWagers);
      }
    }
    setLoading(false);
  };


  const handleSort = (mode: SortMode) => {
    setSortMode(mode);
    sessionStorage.setItem('daimbet-sort', mode);
  };

  // Sort bets
  const sortedBets = useMemo(() => {
    const now = Date.now();
    const arr = [...bets];

    if (sortMode === 'urgence') {
      // Priority: 1) urgent open (by time left), 2) closed awaiting, 3) open non-urgent (by end_date), 4) suspended
      arr.sort((a, b) => {
        const priorityOf = (bet: BetWithOptions) => {
          if (bet.status === 'suspendu') return 4;
          if (bet.status === 'cloture_en_attente') return 2;
          if (bet.status === 'ouvert' && bet.category === 'urgent') return 1;
          return 3;
        };
        const pa = priorityOf(a), pb = priorityOf(b);
        if (pa !== pb) return pa - pb;
        // Secondary: time-based
        if (pa === 1) {
          const ca = a.close_date ? new Date(a.close_date).getTime() - now : Infinity;
          const cb = b.close_date ? new Date(b.close_date).getTime() - now : Infinity;
          if (ca !== cb) return ca - cb;
        }
        if (pa === 2) {
          return new Date(b.end_date).getTime() - new Date(a.end_date).getTime();
        }
        if (pa === 3) {
          const ea = new Date(a.end_date).getTime(), eb = new Date(b.end_date).getTime();
          if (ea !== eb) return ea - eb;
        }
        // Tiebreaker: volume
        return (betTotals[b.id] || 0) - (betTotals[a.id] || 0);
      });
    } else if (sortMode === 'categorie') {
      const catOrder: Record<string, number> = { urgent: 1, culture_daim: 2, long_terme: 3 };
      arr.sort((a, b) => (catOrder[a.category] || 9) - (catOrder[b.category] || 9));
    } else {
      arr.sort((a, b) => (betTotals[b.id] || 0) - (betTotals[a.id] || 0));
    }
    return arr;
  }, [bets, sortMode, betTotals]);

  // Group bets for category separators when sorting by category
  const betGroups = useMemo(() => {
    if (sortMode !== 'categorie') return [{ label: null, bets: sortedBets }];
    const groups: { label: string; bets: BetWithOptions[] }[] = [];
    let lastCat = '';
    const catLabels: Record<string, string> = {
      urgent: '⚡ Paris Urgents',
      culture_daim: '🎪 Culture Daim',
      long_terme: '📅 Paris Long Terme',
    };
    for (const bet of sortedBets) {
      if (bet.category !== lastCat) {
        groups.push({ label: catLabels[bet.category] || bet.category, bets: [bet] });
        lastCat = bet.category;
      } else {
        groups[groups.length - 1].bets.push(bet);
      }
    }
    return groups;
  }, [sortedBets, sortMode]);

  const handleOpenBet = (bet: BetWithOptions) => {
    // Binary / Over-Under → bottom sheet; others → detail page
    if (bet.type === 'binaire' || bet.type === 'over_under') {
      setSheetBet(bet);
    } else {
      navigate(`/bet/${bet.id}`);
    }
  };

  const placeWagerFromSheet = async (betId: string, optionId: string, amount: number) => {
    if (!user || !profile) return;
    const { data, error } = await supabase.rpc('place_wager', {
      p_user_id: user.id, p_bet_id: betId, p_option_id: optionId, p_montant_dc: amount,
    });
    if (error) { toast.error('Erreur lors de la mise'); return; }
    const result = data as { error?: string; success?: boolean; new_odds?: number };
    if (result.error) { toast.error(result.error); return; }
    const newOdds = result.new_odds || 1.10;
    const estimatedNet = calculateEstimatedNetGain(amount, newOdds);
    toast.success(`Mise placée ! 🎰 Gain estimé (après rake 5 %) : ${estimatedNet} DC`);
    await Promise.all([fetchBets(), refreshProfile()]);
  };


  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  if (parisSuspended) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-3xl pb-20 md:pb-6">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-display gold-text">🎯 Les Paris du Moment</h1>
        </div>
        <div className="text-center py-20 space-y-3">
          <p className="text-5xl">🚨</p>
          <h2 className="text-xl font-display text-destructive">Paris suspendus</h2>
          <p className="text-muted-foreground text-sm">Les paris sont temporairement suspendus par l'administrateur.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl pb-20 md:pb-6">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-display gold-text">🎯 Les Paris du Moment</h1>
      </div>
      {INTRO_PARIS}

      {/* Propose a new bet */}
      <div className="flex justify-center mb-4">
        <ProposeNewDialog kind="bet" buttonLabel="Propose un pari" buttonVariant="default" onSubmitted={fetchAll} />
      </div>

      {/* Pending bet proposals (community vote) */}
      <PendingProposalsSection kind="bet" />



      {/* Sort selector */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {SORT_OPTIONS.map(opt => {
          const Icon = opt.icon;
          const active = sortMode === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => handleSort(opt.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {bets.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Aucun pari en ce moment 🦌 — revenez bientôt !</p>
        </div>
      )}

      {/* Bet cards */}
      <div className="space-y-6">
        {betGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-display text-muted-foreground whitespace-nowrap">{group.label}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            <div className="space-y-4">
              {group.bets.map((bet, i) => (
                <motion.div
                  key={bet.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <BetCard
                    bet={bet}
                    pools={wagerPools[bet.id] || {}}
                    totalPool={betTotals[bet.id] || 0}
                    profileBalance={profile?.balance || 0}
                    userWager={userWagers[bet.id] || null}
                    wagerCount={wagerCounts[bet.id] || 0}
                    onOpenBet={handleOpenBet}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom sheet for binary/over-under */}
      {sheetBet && (
        <BetBottomSheet
          bet={sheetBet}
          pools={wagerPools[sheetBet.id] || {}}
          totalPool={betTotals[sheetBet.id] || 0}
          profileBalance={profile?.balance || 0}
          open={!!sheetBet}
          onOpenChange={(open) => { if (!open) setSheetBet(null); }}
          onPlaceWager={placeWagerFromSheet}
          existingWagerOptionId={userWagers[sheetBet.id]?.option_id}
        />
      )}
    </div>
  );
}
