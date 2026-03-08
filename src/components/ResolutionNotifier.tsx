import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Trophy } from 'lucide-react';
import CoinRain from '@/components/CoinRain';
import LoseOverlay from '@/components/LoseOverlay';

interface ResolvedNotification {
  betId: string;
  betTitle: string;
  betEmoji: string | null;
  isWinner: boolean;
  amountWon: number; // net gain (0 if loser)
}

export default function ResolutionNotifier() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<ResolvedNotification[]>([]);
  const [activeAnimation, setActiveAnimation] = useState<ResolvedNotification | null>(null);

  // Check for unread resolutions on mount (offline catch-up)
  const checkUnread = useCallback(async () => {
    if (!user) return;
    // Find recently resolved bets where user has a wager
    const { data: myWagers } = await supabase
      .from('wagers')
      .select('bet_id, option_id, montant_dc, is_retracted')
      .eq('user_id', user.id)
      .eq('is_retracted', false);
    if (!myWagers || myWagers.length === 0) return;

    const betIds = [...new Set(myWagers.map(w => w.bet_id))];
    const { data: resolvedBets } = await supabase
      .from('bets')
      .select('id, title, emoji, status')
      .in('id', betIds)
      .eq('status', 'resolu');
    if (!resolvedBets || resolvedBets.length === 0) return;

    // Check which ones have already been seen
    const seenKey = `daimbet-seen-resolutions-${user.id}`;
    const seen: string[] = JSON.parse(localStorage.getItem(seenKey) || '[]');
    const unseen = resolvedBets.filter(b => !seen.includes(b.id));
    if (unseen.length === 0) return;

    // For each unseen, determine win/lose
    for (const bet of unseen) {
      const { data: winningOptions } = await supabase
        .from('bet_options')
        .select('id')
        .eq('bet_id', bet.id)
        .eq('is_winner', true);
      const winIds = new Set((winningOptions || []).map(o => o.id));
      const userWagersOnBet = myWagers.filter(w => w.bet_id === bet.id);
      const isWinner = userWagersOnBet.some(w => winIds.has(w.option_id));

      // Estimate amount won from solde_history
      let amountWon = 0;
      if (isWinner) {
        const { data: history } = await supabase
          .from('solde_history')
          .select('delta_dc')
          .eq('user_id', user.id)
          .ilike('reason', `%${bet.title}%`)
          .gt('delta_dc', 0)
          .order('created_at', { ascending: false })
          .limit(1);
        amountWon = history?.[0]?.delta_dc || 0;
      }

      setNotifications(prev => [...prev, {
        betId: bet.id,
        betTitle: bet.title,
        betEmoji: bet.emoji,
        isWinner,
        amountWon,
      }]);
    }

    // Mark as seen
    localStorage.setItem(seenKey, JSON.stringify([...seen, ...unseen.map(b => b.id)]));
  }, [user]);

  useEffect(() => { checkUnread(); }, [checkUnread]);

  // Realtime: listen for bet status changes to 'resolu'
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('resolution-notifier')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bets',
      }, async (payload) => {
        const newBet = payload.new as { id: string; title: string; emoji: string | null; status: string };
        if (newBet.status !== 'resolu') return;

        // Check if user has a wager on this bet
        const { data: myWagers } = await supabase
          .from('wagers')
          .select('option_id, montant_dc')
          .eq('bet_id', newBet.id)
          .eq('user_id', user.id)
          .eq('is_retracted', false);
        if (!myWagers || myWagers.length === 0) return;

        const { data: winOpts } = await supabase
          .from('bet_options')
          .select('id')
          .eq('bet_id', newBet.id)
          .eq('is_winner', true);
        const winIds = new Set((winOpts || []).map(o => o.id));
        const isWinner = myWagers.some(w => winIds.has(w.option_id));

        let amountWon = 0;
        if (isWinner) {
          const { data: history } = await supabase
            .from('solde_history')
            .select('delta_dc')
            .eq('user_id', user.id)
            .ilike('reason', `%${newBet.title}%`)
            .gt('delta_dc', 0)
            .order('created_at', { ascending: false })
            .limit(1);
          amountWon = history?.[0]?.delta_dc || 0;
        }

        const notif: ResolvedNotification = {
          betId: newBet.id,
          betTitle: newBet.title,
          betEmoji: newBet.emoji,
          isWinner,
          amountWon,
        };

        // Trigger animation immediately
        setActiveAnimation(notif);

        // Also show persistent banner
        setNotifications(prev => [...prev, notif]);

        // Mark as seen
        const seenKey = `daimbet-seen-resolutions-${user.id}`;
        const seen: string[] = JSON.parse(localStorage.getItem(seenKey) || '[]');
        localStorage.setItem(seenKey, JSON.stringify([...seen, newBet.id]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const dismissNotif = (betId: string) => {
    setNotifications(prev => prev.filter(n => n.betId !== betId));
  };

  const handleNotifClick = (notif: ResolvedNotification) => {
    // Show animation then navigate
    setActiveAnimation(notif);
    dismissNotif(notif.betId);
  };

  return (
    <>
      {/* Notification banners */}
      <div className="fixed top-16 right-4 z-50 space-y-2 max-w-sm">
        <AnimatePresence>
          {notifications.map(notif => (
            <motion.div
              key={notif.betId}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              className="bg-card border border-border rounded-xl p-3 shadow-lg cursor-pointer card-glow"
              onClick={() => handleNotifClick(notif)}
            >
              <div className="flex items-start gap-2">
                <Trophy className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    🏆 Résultat disponible
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {notif.betEmoji} {notif.betTitle}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); dismissNotif(notif.betId); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Animations */}
      {activeAnimation?.isWinner && activeAnimation.amountWon > 0 && (
        <CoinRain
          amount={activeAnimation.amountWon}
          onComplete={() => {
            setActiveAnimation(null);
            navigate(`/bet/${activeAnimation.betId}`);
          }}
        />
      )}
      {activeAnimation && !activeAnimation.isWinner && (
        <LoseOverlay
          onComplete={() => {
            setActiveAnimation(null);
            navigate(`/bet/${activeAnimation.betId}`);
          }}
        />
      )}
    </>
  );
}
