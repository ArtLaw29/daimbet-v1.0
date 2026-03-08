import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Flame, Clock, CheckCircle, XCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { calculatePariMutuelOdds, aggregateBetsByOption, maxBetAmount, calculateEstimatedNetGain, DEFAULT_ODDS, STARTING_BALANCE } from '@/lib/pari-mutuel';

interface EventOption {
  id: string;
  label: string;
  odds: number;
  is_winner: boolean | null;
}

interface BetEvent {
  id: string;
  title: string;
  description: string | null;
  status: string;
  category: string;
  closes_at: string | null;
  event_options: EventOption[];
}

export default function EventsPage() {
  const { user, profile } = useAuth();
  const [events, setEvents] = useState<BetEvent[]>([]);
  const [betAmounts, setBetAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [betPools, setBetPools] = useState<Record<string, Record<string, number>>>({});
  const [eventTotals, setEventTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*, event_options(*)')
      .in('status', ['open', 'closed'])
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Erreur chargement événements');
    } else {
      const evts = data as BetEvent[];
      setEvents(evts);
      if (evts.length > 0) {
        const eventIds = evts.map(e => e.id);
        const { data: bets } = await supabase
          .from('bets')
          .select('event_id, option_id, amount, status')
          .in('event_id', eventIds);
        if (bets) {
          const pools: Record<string, Record<string, number>> = {};
          const totals: Record<string, number> = {};
          for (const bet of bets) {
            if (bet.status === 'pending' || bet.status === 'won' || bet.status === 'lost') {
              if (!pools[bet.event_id]) pools[bet.event_id] = {};
              pools[bet.event_id][bet.option_id] = (pools[bet.event_id][bet.option_id] || 0) + bet.amount;
              totals[bet.event_id] = (totals[bet.event_id] || 0) + bet.amount;
            }
          }
          setBetPools(pools);
          setEventTotals(totals);
        }
      }
    }
    setLoading(false);
  };

  const placeBet = async (eventId: string, optionId: string) => {
    const amount = betAmounts[optionId] || 10;
    if (!user || !profile) return;

    const event = events.find(e => e.id === eventId);
    const isLongTerm = event?.category === 'long-term';
    const maxBet = maxBetAmount(profile.balance, isLongTerm);
    const pctLabel = isLongTerm ? '15%' : '30%';

    if (amount > maxBet) {
      toast.error(`Mise max : ${maxBet} DC (${pctLabel} de ton capital) 💸`);
      return;
    }
    if (amount > profile.balance) {
      toast.error('Pas assez de DAIMcoins ! 💸');
      return;
    }
    if (amount < 1) {
      toast.error('Mise minimum : 1 DC');
      return;
    }

    const totalPool = (eventTotals[eventId] || 0) + amount;
    const optionPool = ((betPools[eventId] || {})[optionId] || 0) + amount;
    const estimatedOdds = calculatePariMutuelOdds(totalPool, optionPool);
    const estimatedNet = calculateEstimatedNetGain(amount, estimatedOdds);

    const { error } = await supabase.from('bets').insert({
      user_id: user.id,
      event_id: eventId,
      option_id: optionId,
      amount,
      potential_winnings: estimatedNet,
    });

    if (error) {
      toast.error('Erreur lors du pari');
    } else {
      await supabase
        .from('profiles')
        .update({ balance: profile.balance - amount })
        .eq('user_id', user.id);
      toast.success(`Pari placé ! 🎰 Cote estimée : x${estimatedOdds.toFixed(2)} · Gain estimé (après rake 5%) : ${estimatedNet} DC`);
      window.location.reload();
    }
  };

  const statusConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    open: { icon: Flame, label: 'Mises ouvertes 🔥', color: 'text-primary' },
    closed: { icon: Clock, label: 'Mises clôturées', color: 'text-muted-foreground' },
    resolved: { icon: CheckCircle, label: 'Résolu ✅', color: 'text-success' },
    cancelled: { icon: XCircle, label: 'Annulé', color: 'text-destructive' },
  };

  const categoryEmojis: Record<string, string> = {
    bet: '🎲',
    poll: '📊',
    fun: '😂',
    'long-term': '🔮',
    urgent: '⚡',
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="text-center mb-4">
        <h1 className="text-4xl font-display gold-text">Les Paris du Moment</h1>
        <p className="text-muted-foreground mt-1">Place tes DAIMcoins sur les événements de la promo 🦌</p>
        <p className="text-xs text-muted-foreground mt-2 bg-secondary/50 inline-block px-3 py-1 rounded-full">
          💡 Système Pari Mutuel : les cotes évoluent en temps réel selon les mises !
        </p>
      </div>

      <div className="bg-secondary/30 border border-border rounded-lg p-3 mb-6 text-center">
        <p className="text-sm text-muted-foreground">
          🔄 Les {STARTING_BALANCE} DC sont <span className="text-primary font-semibold">réinitialisés chaque mois</span>. 
          Mise max : <span className="text-primary font-semibold">30% du capital</span> (15% pour les paris long terme). 
          Rake : <span className="text-primary font-semibold">5% sur les gains nets</span>.
        </p>
      </div>

      {events.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Aucun événement pour le moment.</p>
          <p className="text-sm mt-1">Propose-en un dans l'onglet "Proposer" !</p>
        </div>
      )}

      <div className="space-y-6">
        {events.map((event, i) => {
          const status = statusConfig[event.status] || statusConfig.open;
          const StatusIcon = status.icon;
          const emoji = categoryEmojis[event.category] || '🎲';
          const totalPool = eventTotals[event.id] || 0;
          const pools = betPools[event.id] || {};
          const isLongTerm = event.category === 'long-term';

          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-xl border border-border bg-card p-5 card-glow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-xl font-display tracking-wider">
                    {emoji} {event.title}
                  </h2>
                  {event.description && (
                    <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                  )}
                  {event.category === 'urgent' && (
                    <span className="inline-flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded-full mt-1">
                      <AlertTriangle className="w-3 h-3" /> Pari urgent
                    </span>
                  )}
                  {event.category === 'long-term' && (
                    <span className="inline-flex items-center gap-1 text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full mt-1">
                      🔮 Pari long terme · Mise max 15%
                    </span>
                  )}
                </div>
                <span className={`flex items-center gap-1 text-xs font-medium ${status.color}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {status.label}
                </span>
              </div>

              {totalPool > 0 && (
                <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Cagnotte totale : <span className="text-primary font-bold">{totalPool}</span>
                  <img src={daimcoinLogo} alt="" className="w-3.5 h-3.5 rounded-full" />
                </div>
              )}

              <div className="space-y-2">
                {event.event_options.map((option) => {
                  const optionPool = pools[option.id] || 0;
                  const liveOdds = totalPool > 0 ? calculatePariMutuelOdds(totalPool, optionPool) : DEFAULT_ODDS;
                  const percentage = totalPool > 0 ? ((optionPool / totalPool) * 100).toFixed(0) : '0';
                  const currentBetAmount = betAmounts[option.id] || 10;
                  const estimatedNet = calculateEstimatedNetGain(currentBetAmount, liveOdds);

                  return (
                    <div
                      key={option.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50"
                    >
                      <div className="flex-1">
                        <span className="font-medium">{option.label}</span>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {totalPool > 0 ? (
                            <>{percentage}% des mises · {optionPool} DC</>
                          ) : (
                            <>Aucune mise pour l'instant</>
                          )}
                        </div>
                        {event.status === 'open' && (
                          <div className="text-xs text-primary/80 mt-0.5">
                            Gain estimé (après rake de 5%) : {estimatedNet} DC
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <span className="text-primary font-bold text-sm px-2 py-1 rounded bg-primary/10 block">
                          x{liveOdds.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Cote estimée</span>
                      </div>
                      {event.status === 'open' && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={maxBetAmount(profile?.balance || 0, isLongTerm)}
                            value={betAmounts[option.id] || 10}
                            onChange={(e) =>
                              setBetAmounts({ ...betAmounts, [option.id]: parseInt(e.target.value) || 0 })
                            }
                            className="w-20 h-8 text-center text-sm"
                          />
                          <img src={daimcoinLogo} alt="" className="w-4 h-4 rounded-full" />
                          <Button
                            size="sm"
                            className="gold-gradient text-xs font-semibold"
                            onClick={() => placeBet(event.id, option.id)}
                          >
                            Parier
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
