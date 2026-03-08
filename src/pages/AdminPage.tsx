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
import { calculateRake, calculateGrossWinnings, STARTING_BALANCE, DEFAULT_ODDS } from '@/lib/pari-mutuel';

type Profile = Tables<'profiles'>;
type BetRow = Tables<'bets'>;
type BetOption = Tables<'bet_options'>;
type Wager = Tables<'wagers'>;

interface BetWithOptions extends BetRow {
  bet_options: BetOption[];
}

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const [bets, setBets] = useState<BetWithOptions[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allWagers, setAllWagers] = useState<Wager[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState<string>('urgent');
  const [newEndDate, setNewEndDate] = useState('');
  const [newCloseDate, setNewCloseDate] = useState('');
  const [options, setOptions] = useState([{ label: '' }, { label: '' }]);

  // Results filter
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    if (isAdmin) fetchAll();
  }, [isAdmin]);

  const fetchAll = async () => {
    const [betsRes, prRes, wagersRes] = await Promise.all([
      supabase.from('bets').select('*, bet_options(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('balance', { ascending: false }),
      supabase.from('wagers').select('*').order('created_at', { ascending: false }),
    ]);
    setBets((betsRes.data as BetWithOptions[]) || []);
    setProfiles(prRes.data || []);
    setAllWagers((wagersRes.data as Wager[]) || []);
    setLoading(false);
  };

  // ─── CREATE BET ───
  const createBet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const validOptions = options.filter((o) => o.label.trim());
    if (validOptions.length < 2) {
      toast.error('Il faut au moins 2 options');
      return;
    }
    if (!newEndDate) {
      toast.error('La date de fin du pari est obligatoire');
      return;
    }

    const isLongTerme = newCategory === 'long_terme';

    const { data: bet, error } = await supabase
      .from('bets')
      .insert({
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        category: newCategory as any,
        created_by: user.id,
        end_date: new Date(newEndDate).toISOString(),
        close_date: newCloseDate ? new Date(newCloseDate).toISOString() : null,
        is_long_terme: isLongTerme,
        mise_max_pct: isLongTerme ? 15 : 30,
      })
      .select()
      .single();

    if (error || !bet) { toast.error('Erreur création'); return; }

    await supabase.from('bet_options').insert(
      validOptions.map((o) => ({ bet_id: bet.id, label: o.label.trim() }))
    );

    toast.success('Pari créé ! 🎉');
    setNewTitle(''); setNewDesc(''); setNewEndDate(''); setNewCloseDate('');
    setOptions([{ label: '' }, { label: '' }]);
    fetchAll();
  };

  // ─── CLOSE BETS (Clôture) ───
  const closeBet = async (betId: string) => {
    await supabase.from('bets').update({ status: 'cloture_en_attente' as any }).eq('id', betId);
    toast.success('Mises clôturées ! Les cotes sont figées. 🔒');
    fetchAll();
  };

  // ─── RESOLVE BET (Résolution — Pari Mutuel avec rake) ───
  const resolveBet = async (betId: string, winnerOptionId: string) => {
    const betWagers = allWagers.filter(w => w.bet_id === betId && !w.is_retracted);
    const totalPool = betWagers.reduce((s, w) => s + w.montant_dc, 0);
    const totalOnWinner = betWagers.filter(w => w.option_id === winnerOptionId).reduce((s, w) => s + w.montant_dc, 0);

    const bet = bets.find(b => b.id === betId);
    if (!bet) return;

    // Mark winner option
    for (const opt of bet.bet_options) {
      await supabase.from('bet_options').update({ is_winner: opt.id === winnerOptionId }).eq('id', opt.id);
    }

    // Resolve bet
    await supabase.from('bets').update({ status: 'resolu' as any }).eq('id', betId);

    // Pay winners with pari mutuel + rake
    let totalRake = 0;
    const winningWagers = betWagers.filter(w => w.option_id === winnerOptionId);
    for (const wager of winningWagers) {
      const gross = calculateGrossWinnings(wager.montant_dc, totalOnWinner, totalPool);
      const rake = calculateRake(gross, wager.montant_dc);
      const net = Math.round(gross - rake);
      totalRake += rake;

      const { data: prof } = await supabase.from('profiles').select('balance').eq('user_id', wager.user_id).single();
      if (prof) {
        await supabase.from('profiles').update({ balance: prof.balance + net }).eq('user_id', wager.user_id);
      }
      // Log in solde_history
      await supabase.from('solde_history').insert({ user_id: wager.user_id, delta_dc: net, reason: `Gain pari: ${bet.title}` });
    }

    // Log losses
    const losingWagers = betWagers.filter(w => w.option_id !== winnerOptionId);
    for (const wager of losingWagers) {
      await supabase.from('solde_history').insert({ user_id: wager.user_id, delta_dc: -wager.montant_dc, reason: `Perte pari: ${bet.title}` });
    }

    toast.success(`Pari résolu ! 🏆 Cagnotte : ${totalPool} DC · Rake prélevé : ${totalRake} DC`);
    fetchAll();
  };

  // ─── CANCEL BET & REFUND ───
  const cancelBet = async (betId: string) => {
    const betWagers = allWagers.filter(w => w.bet_id === betId && !w.is_retracted);

    for (const wager of betWagers) {
      const { data: prof } = await supabase.from('profiles').select('balance').eq('user_id', wager.user_id).single();
      if (prof) {
        await supabase.from('profiles').update({ balance: prof.balance + wager.montant_dc }).eq('user_id', wager.user_id);
      }
      await supabase.from('solde_history').insert({ user_id: wager.user_id, delta_dc: wager.montant_dc, reason: `Remboursement: pari annulé` });
    }

    await supabase.from('bets').update({ status: 'supprime' as any, suppression_motif: 'Annulé par Jordaim Belfort' }).eq('id', betId);
    toast.success(`Pari annulé et ${betWagers.length} mises remboursées ! 💰`);
    fetchAll();
  };

  // ─── USER MANAGEMENT ───
  const resetAllBalances = async () => {
    for (const p of profiles) {
      await supabase.from('profiles').update({ balance: STARTING_BALANCE }).eq('user_id', p.user_id);
    }
    toast.success(`Tous les soldes réinitialisés à ${STARTING_BALANCE} DC !`);
    fetchAll();
  };

  const updateBalance = async (userId: string, newBalance: number) => {
    await supabase.from('profiles').update({ balance: newBalance }).eq('user_id', userId);
    toast.success('Solde mis à jour');
    fetchAll();
  };

  // ─── STATS ───
  const totalUsers = profiles.length;
  const totalWagersCount = allWagers.filter(w => !w.is_retracted).length;
  const now = new Date();
  const wagersThisMonth = allWagers.filter(w => {
    const d = new Date(w.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && !w.is_retracted;
  }).length;
  const totalPoolAllTime = allWagers.filter(w => !w.is_retracted).reduce((s, w) => s + w.montant_dc, 0);
  const avgWagerSize = totalWagersCount > 0 ? Math.round(totalPoolAllTime / totalWagersCount) : 0;
  const activeBettors = new Set(allWagers.filter(w => {
    const d = new Date(w.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && !w.is_retracted;
  }).map(w => w.user_id)).size;

  // ─── RESULTS FILTERING ───
  const filteredBets = bets.filter(b => {
    if (filterStatus !== 'all' && b.status !== filterStatus) return false;
    if (filterCategory !== 'all' && b.category !== filterCategory) return false;
    return true;
  });

  const getProfileName = (userId: string) =>
    profiles.find(p => p.user_id === userId)?.display_name || 'Anonyme';

  if (!isAdmin) {
    return (
      <div className="text-center py-20">
        <Shield className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-display text-muted-foreground">Accès refusé</h1>
        <p className="text-muted-foreground mt-2">Tu n'es pas Jordaim Belfort.</p>
      </div>
    );
  }

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  const openBets = bets.filter(b => b.status === 'ouvert' || b.status === 'cloture_en_attente');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <Shield className="w-12 h-12 mx-auto text-primary mb-2" />
        <h1 className="text-4xl font-display gold-text">Jordaim Belfort</h1>
        <p className="text-muted-foreground mt-1">Panneau d'administration – Pari Mutuel avec rake 5%</p>
      </div>

      <Tabs defaultValue="create" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 bg-secondary">
          <TabsTrigger value="create" className="font-display text-xs"><Plus className="w-4 h-4 mr-1" /> Créer</TabsTrigger>
          <TabsTrigger value="manage" className="font-display text-xs"><CheckCircle className="w-4 h-4 mr-1" /> Gérer</TabsTrigger>
          <TabsTrigger value="results" className="font-display text-xs"><History className="w-4 h-4 mr-1" /> Résultats</TabsTrigger>
          <TabsTrigger value="users" className="font-display text-xs"><Users className="w-4 h-4 mr-1" /> Joueurs</TabsTrigger>
          <TabsTrigger value="stats" className="font-display text-xs"><BarChart3 className="w-4 h-4 mr-1" /> Stats</TabsTrigger>
        </TabsList>

        {/* ─── CREATE BET ─── */}
        <TabsContent value="create">
          <form onSubmit={createBet} className="rounded-xl border border-border bg-card p-6 card-glow space-y-4">
            <h2 className="text-xl font-display">Nouveau pari</h2>
            <p className="text-xs text-muted-foreground">
              Chronologie : Création → Mises ouvertes → Clôture → Fin du pari → Résolution → Archivage
            </p>
            <Input placeholder="Titre du pari" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required maxLength={200} />
            <Textarea placeholder="Description (optionnel)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} maxLength={500} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Catégorie</label>
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="urgent">⚡ Urgent (max 30%)</option>
                  <option value="long_terme">🔮 Long terme (max 15%)</option>
                  <option value="culture_daim">🦌 Culture DAIM (max 30%)</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Fin du pari</label>
                <Input type="datetime-local" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Clôture des mises (optionnel)</label>
              <Input type="datetime-local" value={newCloseDate} onChange={(e) => setNewCloseDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Options de pari (cote par défaut : {DEFAULT_ODDS})</label>
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

            <Button type="submit" className="gold-gradient font-semibold w-full">Créer le pari 🦌</Button>
          </form>
        </TabsContent>

        {/* ─── MANAGE BETS ─── */}
        <TabsContent value="manage">
          <div className="space-y-4">
            <h2 className="text-xl font-display">Paris actifs ({openBets.length})</h2>
            {openBets.length === 0 && <p className="text-muted-foreground text-center py-8">Aucun pari actif.</p>}
            {openBets.map((bet) => {
              const betWagers = allWagers.filter(w => w.bet_id === bet.id && !w.is_retracted);
              const totalPool = betWagers.reduce((s, w) => s + w.montant_dc, 0);
              const pools: Record<string, number> = {};
              betWagers.forEach(w => { pools[w.option_id] = (pools[w.option_id] || 0) + w.montant_dc; });
              const isClosed = bet.status === 'cloture_en_attente';

              return (
                <motion.div key={bet.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-display tracking-wider">{bet.emoji || ''} {bet.title}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full ${isClosed ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                      {isClosed ? '🔒 Clôturé' : '🔥 Mises ouvertes'}
                    </span>
                  </div>
                  {bet.description && <p className="text-sm text-muted-foreground mb-2">{bet.description}</p>}
                  <p className="text-xs text-muted-foreground mb-1">Cagnotte : <span className="text-primary font-bold">{totalPool} DC</span> · {betWagers.length} mises</p>

                  {bet.status === 'ouvert' && (
                    <Button variant="outline" size="sm" className="mb-3 mr-2"
                      onClick={() => { if (confirm('Clôturer les mises ? Les cotes seront figées.')) closeBet(bet.id); }}>
                      🔒 Clôturer les mises
                    </Button>
                  )}

                  <p className="text-xs text-muted-foreground mb-2 mt-2">🏆 Résolution — Choisis le résultat gagnant :</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {bet.bet_options.map((opt) => {
                      const optPool = pools[opt.id] || 0;
                      const odds = totalPool > 0 && optPool > 0 ? (totalPool / optPool).toFixed(2) : DEFAULT_ODDS.toFixed(2);
                      return (
                        <Button key={opt.id} variant="outline" size="sm"
                          onClick={() => { if (confirm(`Confirmer "${opt.label}" comme résultat gagnant ?`)) resolveBet(bet.id, opt.id); }}
                          className="hover:bg-primary/20 hover:border-primary">
                          <Trophy className="w-3 h-3 mr-1" />
                          {opt.label} (x{odds} · {optPool} DC)
                        </Button>
                      );
                    })}
                  </div>

                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => { if (confirm('Annuler ce pari et rembourser toutes les mises ?')) cancelBet(bet.id); }}>
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
                <option value="ouvert">Mises ouvertes</option>
                <option value="cloture_en_attente">Clôturé</option>
                <option value="resolu">Résolu</option>
                <option value="supprime">Supprimé</option>
              </select>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                <option value="all">Toutes catégories</option>
                <option value="urgent">⚡ Urgent</option>
                <option value="long_terme">🔮 Long terme</option>
                <option value="culture_daim">🦌 Culture DAIM</option>
              </select>
            </div>

            {filteredBets.length === 0 && <p className="text-center text-muted-foreground py-8">Aucun résultat.</p>}
            {filteredBets.map((bet) => {
              const betWagers = allWagers.filter(w => w.bet_id === bet.id && !w.is_retracted);
              const totalPool = betWagers.reduce((s, w) => s + w.montant_dc, 0);
              const date = new Date(bet.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
              const statusLabels: Record<string, string> = { ouvert: '🔥 Mises ouvertes', cloture_en_attente: '🔒 Clôturé', resolu: '✅ Résolu', supprime: '❌ Supprimé', suspendu: '⏸ Suspendu' };

              return (
                <div key={bet.id} className={`rounded-xl border bg-card p-4 ${bet.status === 'resolu' ? 'border-primary/30' : bet.status === 'supprime' ? 'border-destructive/30' : 'border-border'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display tracking-wider">{bet.title}</h3>
                      <p className="text-xs text-muted-foreground">{date} · {statusLabels[bet.status] || bet.status} · Cagnotte : {totalPool} DC · {betWagers.length} mises</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {bet.bet_options.map((opt) => (
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
              <Button variant="outline" size="sm"
                onClick={() => { if (confirm(`Réinitialiser TOUS les soldes à ${STARTING_BALANCE} DC ?`)) resetAllBalances(); }}
                className="text-destructive border-destructive/30 hover:bg-destructive/10">
                Réinitialiser tous les soldes
              </Button>
            </div>
            {profiles.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card">
                <span className="text-sm text-muted-foreground w-8">#{i + 1}</span>
                <div className="flex-1">
                  <span className="font-semibold">{p.display_name || 'Anonyme'}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {allWagers.filter(w => w.user_id === p.user_id && !w.is_retracted).length} mises
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="number" defaultValue={p.balance} className="w-24 h-8 text-center text-sm"
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
                { label: 'Mises total', value: totalWagersCount, emoji: '🎰' },
                { label: 'Mises ce mois', value: wagersThisMonth, emoji: '📅' },
                { label: 'Parieurs actifs (mois)', value: activeBettors, emoji: '🔥' },
                { label: 'Mise moyenne', value: `${avgWagerSize} DC`, emoji: '💰' },
                { label: 'Volume total', value: `${totalPoolAllTime} DC`, emoji: '📈' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-4 card-glow text-center">
                  <p className="text-2xl mb-1">{stat.emoji}</p>
                  <p className="text-2xl font-display text-primary">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            <h3 className="text-lg font-display mt-6">Mises par mois</h3>
            <div className="space-y-2">
              {(() => {
                const monthlyData: Record<string, number> = {};
                allWagers.filter(w => !w.is_retracted).forEach(w => {
                  const d = new Date(w.created_at);
                  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                  monthlyData[key] = (monthlyData[key] || 0) + 1;
                });
                return Object.entries(monthlyData).sort().reverse().map(([month, count]) => (
                  <div key={month} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border/50">
                    <span className="font-medium flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      {month}
                    </span>
                    <span className="text-primary font-bold">{count} mises</span>
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
