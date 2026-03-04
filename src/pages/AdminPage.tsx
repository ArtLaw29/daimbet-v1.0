import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Shield, Plus, CheckCircle, Users, Trash2, Trophy } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;

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
  event_options: EventOption[];
}

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const [events, setEvents] = useState<BetEvent[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // New event form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('bet');
  const [options, setOptions] = useState([
    { label: '', odds: 2 },
    { label: '', odds: 2 },
  ]);

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    }
  }, [isAdmin]);

  const fetchAll = async () => {
    const [evRes, prRes] = await Promise.all([
      supabase.from('events').select('*, event_options(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('balance', { ascending: false }),
    ]);
    setEvents((evRes.data as BetEvent[]) || []);
    setProfiles(prRes.data || []);
    setLoading(false);
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const validOptions = options.filter((o) => o.label.trim());
    if (validOptions.length < 2) {
      toast.error('Il faut au moins 2 options');
      return;
    }

    const { data: event, error } = await supabase
      .from('events')
      .insert({ title: newTitle.trim(), description: newDesc.trim() || null, category: newCategory, created_by: user.id })
      .select()
      .single();

    if (error || !event) {
      toast.error('Erreur création événement');
      return;
    }

    const { error: optError } = await supabase.from('event_options').insert(
      validOptions.map((o) => ({ event_id: event.id, label: o.label.trim(), odds: o.odds }))
    );

    if (optError) {
      toast.error('Erreur ajout options');
      return;
    }

    toast.success('Événement créé ! 🎉');
    setNewTitle('');
    setNewDesc('');
    setOptions([{ label: '', odds: 2 }, { label: '', odds: 2 }]);
    fetchAll();
  };

  const resolveEvent = async (eventId: string, winnerOptionId: string) => {
    // Mark winner
    const event = events.find((e) => e.id === eventId);
    if (!event) return;

    // Update all options: mark winner
    for (const opt of event.event_options) {
      await supabase
        .from('event_options')
        .update({ is_winner: opt.id === winnerOptionId })
        .eq('id', opt.id);
    }

    // Close event
    await supabase.from('events').update({ status: 'resolved' }).eq('id', eventId);

    // Pay winners: get all bets on winning option
    const { data: winningBets } = await supabase
      .from('bets')
      .select('*')
      .eq('option_id', winnerOptionId)
      .eq('event_id', eventId);

    if (winningBets) {
      for (const bet of winningBets) {
        // Get current profile balance
        const { data: prof } = await supabase
          .from('profiles')
          .select('balance')
          .eq('user_id', bet.user_id)
          .single();
        if (prof) {
          await supabase
            .from('profiles')
            .update({ balance: prof.balance + Number(bet.potential_winnings) })
            .eq('user_id', bet.user_id);
        }
        await supabase.from('bets').update({ status: 'won' }).eq('id', bet.id);
      }
    }

    // Mark losing bets
    await supabase
      .from('bets')
      .update({ status: 'lost' })
      .eq('event_id', eventId)
      .neq('option_id', winnerOptionId);

    toast.success('Pari résolu et gains distribués ! 🏆');
    fetchAll();
  };

  const resetAllBalances = async () => {
    for (const p of profiles) {
      await supabase.from('profiles').update({ balance: 100 }).eq('user_id', p.user_id);
    }
    toast.success('Tous les soldes réinitialisés à 100 DAIMcoins !');
    fetchAll();
  };

  const updateBalance = async (userId: string, newBalance: number) => {
    await supabase.from('profiles').update({ balance: newBalance }).eq('user_id', userId);
    toast.success('Solde mis à jour');
    fetchAll();
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-20">
        <Shield className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-display text-muted-foreground">Accès refusé</h1>
        <p className="text-muted-foreground mt-2">Tu n'es pas administrateur.</p>
      </div>
    );
  }

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  const openEvents = events.filter((e) => e.status === 'open');
  const resolvedEvents = events.filter((e) => e.status === 'resolved');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <Shield className="w-12 h-12 mx-auto text-primary mb-2" />
        <h1 className="text-4xl font-display gold-text">Panel Admin</h1>
        <p className="text-muted-foreground mt-1">Gère les événements, les paris et les utilisateurs</p>
      </div>

      <Tabs defaultValue="create" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-secondary">
          <TabsTrigger value="create" className="font-display">
            <Plus className="w-4 h-4 mr-1" /> Créer
          </TabsTrigger>
          <TabsTrigger value="resolve" className="font-display">
            <CheckCircle className="w-4 h-4 mr-1" /> Résoudre
          </TabsTrigger>
          <TabsTrigger value="users" className="font-display">
            <Users className="w-4 h-4 mr-1" /> Joueurs
          </TabsTrigger>
        </TabsList>

        {/* CREATE EVENT */}
        <TabsContent value="create">
          <form onSubmit={createEvent} className="rounded-xl border border-border bg-card p-6 card-glow space-y-4">
            <h2 className="text-xl font-display">Nouvel événement</h2>
            <Input
              placeholder="Titre de l'événement"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
              maxLength={200}
            />
            <Textarea
              placeholder="Description (optionnel)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={2}
              maxLength={500}
            />
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Catégorie</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="bet">Pari classique</option>
                <option value="poll">Sondage</option>
                <option value="fun">Fun</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Options de pari</label>
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder={`Option ${i + 1}`}
                    value={opt.label}
                    onChange={(e) => {
                      const next = [...options];
                      next[i].label = e.target.value;
                      setOptions(next);
                    }}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    step="0.1"
                    min="1"
                    value={opt.odds}
                    onChange={(e) => {
                      const next = [...options];
                      next[i].odds = parseFloat(e.target.value) || 1;
                      setOptions(next);
                    }}
                    className="w-20"
                    placeholder="Cote"
                  />
                  <span className="text-xs text-muted-foreground">x</span>
                  {options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOptions([...options, { label: '', odds: 2 }])}
              >
                <Plus className="w-3 h-3 mr-1" /> Ajouter une option
              </Button>
            </div>

            <Button type="submit" className="gold-gradient font-semibold w-full">
              Créer l'événement 🦌
            </Button>
          </form>
        </TabsContent>

        {/* RESOLVE EVENTS */}
        <TabsContent value="resolve">
          <div className="space-y-4">
            <h2 className="text-xl font-display">Événements ouverts ({openEvents.length})</h2>
            {openEvents.length === 0 && (
              <p className="text-muted-foreground text-center py-8">Aucun événement ouvert à résoudre.</p>
            )}
            {openEvents.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-5"
              >
                <h3 className="text-lg font-display mb-1">{event.title}</h3>
                {event.description && (
                  <p className="text-sm text-muted-foreground mb-3">{event.description}</p>
                )}
                <p className="text-xs text-muted-foreground mb-2">Choisis le gagnant :</p>
                <div className="flex flex-wrap gap-2">
                  {event.event_options.map((opt) => (
                    <Button
                      key={opt.id}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Confirmer "${opt.label}" comme gagnant ?`)) {
                          resolveEvent(event.id, opt.id);
                        }
                      }}
                      className="hover:bg-primary/20 hover:border-primary"
                    >
                      <Trophy className="w-3 h-3 mr-1" />
                      {opt.label} (x{opt.odds})
                    </Button>
                  ))}
                </div>
              </motion.div>
            ))}

            {resolvedEvents.length > 0 && (
              <>
                <h2 className="text-xl font-display mt-8">Résolus ({resolvedEvents.length})</h2>
                {resolvedEvents.map((event) => (
                  <div key={event.id} className="rounded-xl border border-border/50 bg-card/50 p-4 opacity-60">
                    <h3 className="font-display">{event.title}</h3>
                    <div className="flex gap-2 mt-2">
                      {event.event_options.map((opt) => (
                        <span
                          key={opt.id}
                          className={`text-xs px-2 py-1 rounded ${
                            opt.is_winner ? 'bg-primary/20 text-primary font-bold' : 'bg-secondary text-muted-foreground'
                          }`}
                        >
                          {opt.label} {opt.is_winner && '✓'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </TabsContent>

        {/* MANAGE USERS */}
        <TabsContent value="users">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-display">Joueurs ({profiles.length})</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm('Réinitialiser TOUS les soldes à 100 DAIMcoins ?')) {
                    resetAllBalances();
                  }
                }}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                Réinitialiser tous les soldes
              </Button>
            </div>
            {profiles.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card"
              >
                <span className="text-sm text-muted-foreground w-8">#{i + 1}</span>
                <div className="flex-1">
                  <span className="font-semibold">{p.display_name || 'Anonyme'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    defaultValue={p.balance}
                    className="w-24 h-8 text-center text-sm"
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val !== p.balance) {
                        updateBalance(p.user_id, val);
                      }
                    }}
                  />
                  <img src={daimcoinLogo} alt="" className="w-5 h-5 rounded-full" />
                </div>
              </motion.div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
