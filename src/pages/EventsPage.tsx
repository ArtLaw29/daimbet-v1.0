import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { calculateEstimatedNetGain, STARTING_BALANCE } from '@/lib/pari-mutuel';
import { INTRO_PARIS } from '@/components/TabIntro';
import BetCard, { type BetWithOptions } from '@/components/BetCard';

export default function EventsPage() {
  const { user, profile } = useAuth();
  const [bets, setBets] = useState<BetWithOptions[]>([]);
  const [betAmounts, setBetAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [wagerPools, setWagerPools] = useState<Record<string, Record<string, number>>>({});
  const [betTotals, setBetTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchBets();
  }, []);

  const fetchBets = async () => {
    const { data, error } = await supabase
      .from('bets')
      .select('*, bet_options(*)')
      .in('status', ['ouvert', 'cloture_en_attente', 'suspendu'])
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Erreur chargement des paris');
    } else {
      const items = (data as BetWithOptions[]) || [];
      setBets(items);
      if (items.length > 0) {
        const betIds = items.map(b => b.id);
        const { data: wagers } = await supabase
          .from('wagers')
          .select('bet_id, option_id, montant_dc, is_retracted')
          .in('bet_id', betIds);
        if (wagers) {
          const pools: Record<string, Record<string, number>> = {};
          const totals: Record<string, number> = {};
          for (const w of wagers) {
            if (!w.is_retracted) {
              if (!pools[w.bet_id]) pools[w.bet_id] = {};
              pools[w.bet_id][w.option_id] = (pools[w.bet_id][w.option_id] || 0) + w.montant_dc;
              totals[w.bet_id] = (totals[w.bet_id] || 0) + w.montant_dc;
            }
          }
          setWagerPools(pools);
          setBetTotals(totals);
        }
      }
    }
    setLoading(false);
  };

  const placeWager = async (betId: string, optionId: string) => {
    const amount = betAmounts[optionId] || 10;
    if (!user || !profile) return;

    const { data, error } = await supabase.rpc('place_wager', {
      p_user_id: user.id,
      p_bet_id: betId,
      p_option_id: optionId,
      p_montant_dc: amount,
    });

    if (error) {
      toast.error('Erreur lors de la mise');
      return;
    }

    const result = data as { error?: string; success?: boolean; new_odds?: number };
    if (result.error) {
      toast.error(result.error);
      return;
    }

    const newOdds = result.new_odds || 1.10;
    const estimatedNet = calculateEstimatedNetGain(amount, newOdds);
    toast.success(`Mise placée ! 🎰 Cote : x${newOdds.toFixed(2)} · Gain estimé (après rake 5%) : ${estimatedNet} DC`);
    window.location.reload();
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl pb-20 md:pb-6">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-display gold-text">🎯 Les Paris du Moment</h1>
      </div>
      {INTRO_PARIS}

      <div className="bg-secondary/30 border border-border rounded-lg p-3 mb-6 text-center">
        <p className="text-sm text-muted-foreground">
          🔄 Les {STARTING_BALANCE} DC sont <span className="text-primary font-semibold">réinitialisés chaque mois</span>.
          Mise max : <span className="text-primary font-semibold">30% du capital</span> (15% pour les paris long terme).
          Rake : <span className="text-primary font-semibold">5% sur les gains nets</span>.
        </p>
      </div>

      {bets.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Aucun pari pour le moment.</p>
          <p className="text-sm mt-1">Propose-en un dans l'onglet "Proposer" !</p>
        </div>
      )}

      <div className="space-y-6">
        {bets.map((bet, i) => (
          <motion.div
            key={bet.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <BetCard
              bet={bet}
              pools={wagerPools[bet.id] || {}}
              totalPool={betTotals[bet.id] || 0}
              betAmounts={betAmounts}
              onAmountChange={(optionId, amount) =>
                setBetAmounts(prev => ({ ...prev, [optionId]: amount }))
              }
              onPlaceWager={placeWager}
              profileBalance={profile?.balance || 0}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
