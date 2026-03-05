import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Shield, Plus, CheckCircle, Users, Trash2, Trophy, XCircle, BarChart3, History, Calendar } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import type { Tables } from '@/integrations/supabase/types';
import { calculateWinnings, aggregateBetsByOption } from '@/lib/pari-mutuel';

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
  created_at: string;
  closes_at: string | null;
  event_options: EventOption[];
}

interface BetRow {
  id: string;
  user_id: string;
  event_id: string;
  option_id: string;
  amount: number;
  potential_winnings: number;
  status: string;
  created_at: string;
}

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const [events, setEvents] = useState<BetEvent[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allBets, setAllBets] = useState<BetRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create event form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('bet');
  const [options, setOptions] = useState([
    { label: '' },
    { label: '' },
  ]);

  // Results filter
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'category'>('date');

  useEffect(() => {
    if (isAdmin) fetchAll();
  }, [isAdmin]);

  const fetchAll = async () => {
    const [evRes, prRes, betRes] = await Promise.all([
      supabase.from('events').select('*, event_options(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('balance', { ascending: false }),
      supabase.from('bets').select('*').order('created_at', { ascending: false }),
    ]);
    setEvents((evRes.data as BetEvent[]) || []);
    setProfiles(prRes.data || []);
    setAllBets((betRes.data as BetRow[]) || []);
    setLoading(false);
  };

  // ─── CREATE EVENT ───
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

    if (error || !event) { toast.error('Erreur création'); return; }

    await supabase.from('event_options').insert(
      validOptions.map((o) => ({ event_id: event.id, label: o.label.trim(), odds: 2 }))
    );

    toast.success('Événement créé ! 🎉');
    setNewTitle(''); setNewDesc('');
    setOptions([{ label: '' }, { label: '' }]);
    fetchAll();
  };

  // ─── RESOLVE EVENT (Pari Mutuel) ───
  const resolveEvent = async (eventId: string, winnerOptionId: string) => {
    const eventBets = allBets.filter(b => b.event_id === eventId && b.status === 'pending');
    const totalPool = eventBets.reduce((s, b) => s + b.amount, 0);
    const totalOnWinner = eventBets.filter(b => b.option_id === winnerOptionId).reduce((s, b) => s + b.amount, 0);

    const event = events.find(e => e.id === eventId);
    if (!event) return;

    // Mark winner option
    for (const opt of event.event_options) {
      await supabase.from('event_options').update({ is_winner: opt.id === winnerOptionId }).eq('id', opt.id);
    }

    // Close event
    await supabase.from('events').update({ status: 'resolved' }).eq('id', eventId);

    // Pay winners with pari mutuel formula
    const winningBets = eventBets.filter(b => b.option_id === winnerOptionId);
    for (const bet of winningBets) {
      const payout = calculateWinnings(bet.amount, totalOnWinner, totalPool);
      const { data: prof } = await supabase.from('profiles').select('balance').eq('user_id', bet.user_id).single();
      if (prof) {
        await supabase.from('profiles').update({ balance: prof.balance + Math.round(payout) }).eq('user_id', bet.user_id);
      }
      await supabase.from('bets').update({ status: 'won', potential_winnings: Math.round(payout) }).eq('id', bet.id);
    }

    // Mark losers
    const losingBets = eventBets.filter(b => b.option_id !== winnerOptionId);
    for (const bet of losingBets) {
      await supabase.from('bets').update({ status: 'lost' }).eq('id', bet.id);
    }

    toast.success(`Pari résolu (Pari Mutuel) ! 🏆 Cagnotte: ${totalPool} DC redistribuée.`);
    fetchAll();
  };

  // ─── CANCEL EVENT & REFUND ───
  const cancelEvent = async (eventId: string) => {
    const eventBets = allBets.filter(b => b.event_id === eventId && b.status === 'pending');

    // Refund all bettors
    for (const bet of eventBets) {
      const { data: prof } = await supabase.from('profiles').select('balance').eq('user_id', bet.user_id).single();
      if (prof) {
        await supabase.from('profiles').update({ balance: prof.balance + bet.amount }).eq('user_id', bet.user_id);
      }
      await supabase.from('bets').update({ status: 'refunded' }).eq('id', bet.id);
    }

    await supabase.from('events').update({ status: 'cancelled' }).eq('id', eventId);
    toast.success(`Pari annulé et ${eventBets.length} mises remboursées ! 💰`);
    fetchAll();
  };

  // ─── USER MANAGEMENT ───
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

  // ─── STATS ───
  const totalUsers = profiles.length;
  const totalBetsCount = allBets.length;
  const now = new Date();
  const betsThisMonth = allBets.filter(b => {
    const d = new Date(b.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const totalPoolAllTime = allBets.reduce((s, b) => s + b.amount, 0);
  const avgBetSize = totalBetsCount > 0 ? Math.round(totalPoolAllTime / totalBetsCount) : 0;
  const activeBettors = new Set(allBets.filter(b => {
    const d = new Date(b.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).map(b => b.user_id)).size;

  // ─── RESULTS FILTERING ───
  const filteredEvents = events.filter(e => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    return true;
  });

  const getProfileName = (userId: string) =>
    profiles.find(p => p.user_id === userId)?.display_name || 'Anonyme';

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

  const openEvents = events.filter(e => e.status === 'open');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <Shield className="w-12 h-12 mx-auto text-primary mb-2" />
        <h1 className="text-4xl font-display gold-text">Panel Admin</h1>
        <p className="text-muted-foreground mt-1">Système Pari Mutuel – Gère les événements et les joueurs</p>
      </div>

      <Tabs defaultValue="create" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 bg-secondary">
          <TabsTrigger value="create" className="font-display text-xs">
            <Plus className="w-4 h-4 mr-1" /> Créer
          </TabsTrigger>
          <TabsTrigger value="manage" className="font-display text-xs">
            <CheckCircle className="w-4 h-4 mr-1" /> Gérer
          </TabsTrigger>
          <TabsTrigger value="results" className="font-display text-xs">
            <History className="w-4 h-4 mr-1" /> Résultats
          </TabsTrigger>
          <TabsTrigger value="users" className="font-display text-xs">
            <Users className="w-4 h-4 mr-1" /> Joueurs
          </TabsTrigger>
          <TabsTrigger value="stats" className="font-display text-xs">
            <BarChart3 className="w-4 h-4 mr-1" /> Stats
          </TabsTrigger>
        </TabsList>

        {/* ─── CREATE EVENT ─── */}
        <TabsContent value="create">
          <form onSubmit={createEvent} className="rounded-xl border border-border bg-card p-6 card-glow space-y-4">
            <h2 className="text-xl font-display">Nouvel événement (Pari Mutuel)</h2>
            <p className="text-xs text-muted-foreground">Les cotes seront calculées automatiquement par la répartition des mises.</p>
            <Input placeholder="Titre de l'événement" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required maxLength={200} />
            <Textarea placeholder="Description (optionnel)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} maxLength={500} />
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Catégorie</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="bet">🎲 Pari classique</option>
                <option value="poll">📊 Sondage</option>
                <option value="fun">😂 Fun</option>
                <option value="urgent">⚡ Urgent</option>
                <option value="long-term">🔮 Long terme</option>
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
                  {options.length > 2 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setOptions([...options, { label: '' }])}>
                <Plus className="w-3 h-3 mr-1" /> Ajouter une option
              </Button>
            </div>

            <Button type="submit" className="gold-gradient font-semibold w-full">Créer l'événement 🦌</Button>
          </form>
        </TabsContent>

        {/* ─── MANAGE EVENTS (resolve / cancel) ─── */}
        <TabsContent value="manage">
          <div className="space-y-4">
            <h2 className="text-xl font-display">Événements ouverts ({openEvents.length})</h2>
            {openEvents.length === 0 && <p className="text-muted-foreground text-center py-8">Aucun événement ouvert.</p>}
            {openEvents.map((event) => {
              const eventBets = allBets.filter(b => b.event_id === event.id && b.status === 'pending');
              const totalPool = eventBets.reduce((s, b) => s + b.amount, 0);
              const pools = aggregateBetsByOption(eventBets);

              return (
                <motion.div key={event.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-lg font-display tracking-wider mb-1">{event.title}</h3>
                  {event.description && <p className="text-sm text-muted-foreground mb-2">{event.description}</p>}
                  <p className="text-xs text-muted-foreground mb-1">Cagnotte: <span className="text-primary font-bold">{totalPool} DC</span> · {eventBets.length} paris</p>

                  <p className="text-xs text-muted-foreground mb-2 mt-3">🏆 Choisis le gagnant (Pari Mutuel) :</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {event.event_options.map((opt) => {
                      const optPool = pools[opt.id] || 0;
                      const odds = totalPool > 0 ? (totalPool / optPool).toFixed(2) : '—';
                      return (
                        <Button
                          key={opt.id}
                          variant="outline"
                          size="sm"
                          onClick={() => { if (confirm(`Confirmer "${opt.label}" comme gagnant ?`)) resolveEvent(event.id, opt.id); }}
                          className="hover:bg-primary/20 hover:border-primary"
                        >
                          <Trophy className="w-3 h-3 mr-1" />
                          {opt.label} (x{odds} · {optPool} DC)
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => { if (confirm('Annuler ce pari et rembourser toutes les mises ?')) cancelEvent(event.id); }}
                  >
                    <XCircle className="w-3 h-3 mr-1" /> Annuler & Rembourser
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        {/* ─── RESULTS ─── */}
        <TabsContent value="results">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <h2 className="text-xl font-display">Historique des paris</h2>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                <option value="all">Tous les statuts</option>
                <option value="open">En cours</option>
                <option value="resolved">Résolus</option>
                <option value="cancelled">Annulés</option>
              </select>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                <option value="all">Toutes catégories</option>
                <option value="bet">🎲 Classique</option>
                <option value="poll">📊 Sondage</option>
                <option value="fun">😂 Fun</option>
                <option value="urgent">⚡ Urgent</option>
                <option value="long-term">🔮 Long terme</option>
              </select>
            </div>

            {filteredEvents.length === 0 && <p className="text-center text-muted-foreground py-8">Aucun résultat.</p>}
            {filteredEvents.map((event) => {
              const eventBets = allBets.filter(b => b.event_id === event.id);
              const totalPool = eventBets.reduce((s, b) => s + b.amount, 0);
              const date = new Date(event.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
              const statusLabels: Record<string, string> = { open: '🔥 En cours', resolved: '✅ Résolu', cancelled: '❌ Annulé', closed: '🔒 Fermé' };

              return (
                <div key={event.id} className={`rounded-xl border bg-card p-4 ${event.status === 'resolved' ? 'border-primary/30' : event.status === 'cancelled' ? 'border-destructive/30' : 'border-border'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display tracking-wider">{event.title}</h3>
                      <p className="text-xs text-muted-foreground">{date} · {statusLabels[event.status] || event.status} · Cagnotte: {totalPool} DC · {eventBets.length} paris</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {event.event_options.map((opt) => (
                      <span key={opt.id} className={`text-xs px-2 py-1 rounded ${opt.is_winner ? 'bg-primary/20 text-primary font-bold' : 'bg-secondary text-muted-foreground'}`}>
                        {opt.label} {opt.is_winner && '✓'}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ─── USERS ─── */}
        <TabsContent value="users">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-display">Joueurs ({profiles.length})</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { if (confirm('Réinitialiser TOUS les soldes à 100 DAIMcoins ?')) resetAllBalances(); }}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                Réinitialiser tous les soldes
              </Button>
            </div>
            {profiles.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card">
                <span className="text-sm text-muted-foreground w-8">#{i + 1}</span>
                <div className="flex-1">
                  <span className="font-semibold">{p.display_name || 'Anonyme'}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {allBets.filter(b => b.user_id === p.user_id).length} paris
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    defaultValue={p.balance}
                    className="w-24 h-8 text-center text-sm"
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val !== p.balance) updateBalance(p.user_id, val);
                    }}
                  />
                  <img src={daimcoinLogo} alt="" className="w-5 h-5 rounded-full" />
                </div>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* ─── STATS ─── */}
        <TabsContent value="stats">
          <div className="space-y-4">
            <h2 className="text-xl font-display">Statistiques 📊</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Utilisateurs inscrits', value: totalUsers, emoji: '👥' },
                { label: 'Paris total', value: totalBetsCount, emoji: '🎰' },
                { label: 'Paris ce mois', value: betsThisMonth, emoji: '📅' },
                { label: 'Parieurs actifs (mois)', value: activeBettors, emoji: '🔥' },
                { label: 'Mise moyenne', value: `${avgBetSize} DC`, emoji: '💰' },
                { label: 'Volume total', value: `${totalPoolAllTime} DC`, emoji: '📈' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-4 card-glow text-center">
                  <p className="text-2xl mb-1">{stat.emoji}</p>
                  <p className="text-2xl font-display text-primary">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Monthly breakdown */}
            <h3 className="text-lg font-display mt-6">Paris par mois</h3>
            <div className="space-y-2">
              {(() => {
                const monthlyData: Record<string, number> = {};
                allBets.forEach(b => {
                  const d = new Date(b.created_at);
                  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                  monthlyData[key] = (monthlyData[key] || 0) + 1;
                });
                return Object.entries(monthlyData).sort().reverse().map(([month, count]) => (
                  <div key={month} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border/50">
                    <span className="font-medium flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      {month}
                    </span>
                    <span className="text-primary font-bold">{count} paris</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
