import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Flame, Clock, CheckCircle } from 'lucide-react';
import daimcoinLogo from '@/assets/daimcoin-logo.png';

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

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*, event_options(*)')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Erreur chargement événements');
    } else {
      setEvents(data as BetEvent[]);
    }
    setLoading(false);
  };

  const placeBet = async (eventId: string, optionId: string, odds: number) => {
    const amount = betAmounts[optionId] || 10;
    if (!user || !profile) return;
    if (amount > profile.balance) {
      toast.error('Pas assez de DAIMcoins ! 💸');
      return;
    }

    const { error } = await supabase.from('bets').insert({
      user_id: user.id,
      event_id: eventId,
      option_id: optionId,
      amount,
      potential_winnings: amount * odds,
    });

    if (error) {
      toast.error('Erreur lors du pari');
    } else {
      // Deduct balance
      await supabase
        .from('profiles')
        .update({ balance: profile.balance - amount })
        .eq('user_id', user.id);
      toast.success(`Pari placé ! 🎰 Gain potentiel: ${(amount * odds).toFixed(0)} DAIMcoins`);
      // Refresh
      window.location.reload();
    }
  };

  const statusConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    open: { icon: Flame, label: 'En cours', color: 'text-primary' },
    closed: { icon: Clock, label: 'Fermé', color: 'text-muted-foreground' },
    resolved: { icon: CheckCircle, label: 'Résolu', color: 'text-success' },
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-display gold-text">Les Paris du Moment</h1>
        <p className="text-muted-foreground mt-1">Place tes DAIMcoins sur les événements de la promo 🦌</p>
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
                  <h2 className="text-xl font-display tracking-wide">{event.title}</h2>
                  {event.description && (
                    <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                  )}
                </div>
                <span className={`flex items-center gap-1 text-xs font-medium ${status.color}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {status.label}
                </span>
              </div>

              <div className="space-y-2">
                {event.event_options.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50"
                  >
                    <div className="flex-1">
                      <span className="font-medium">{option.label}</span>
                    </div>
                    <span className="text-primary font-bold text-sm px-2 py-1 rounded bg-primary/10">
                      x{option.odds}
                    </span>
                    {event.status === 'open' && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={profile?.balance || 0}
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
                          onClick={() => placeBet(event.id, option.id, option.odds)}
                        >
                          Parier
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
