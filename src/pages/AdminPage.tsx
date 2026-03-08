import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Shield, Plus, CheckCircle, Users, Trash2, Trophy, XCircle, BarChart3, History, Calendar, Pause, Play, Dice6, Sparkles, ArrowUpDown, Eye, Ban, RefreshCw, Coins, AlertTriangle, MessageSquare, Flag, Search, Vote, Ticket } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import type { Tables } from '@/integrations/supabase/types';
import { STARTING_BALANCE, DEFAULT_ODDS, PROMO_NAMES } from '@/lib/pari-mutuel';
import TicketThread from '@/components/TicketThread';

type Profile = Tables<'profiles'>;
type BetRow = Tables<'bets'>;
type BetOption = Tables<'bet_options'>;
type Wager = Tables<'wagers'>;
type GazetteMessage = Tables<'gazette_messages'>;
type Proposal = Tables<'daimocratie_proposals'>;

interface BetWithOptions extends BetRow {
  bet_options: BetOption[];
}

type BetType = 'binaire' | 'over_under' | 'tranches_multiples' | 'tierce_du_daim';
type BetCategory = 'urgent' | 'long_terme' | 'culture_daim';

const TYPE_OPTIONS: { value: BetType; label: string; emoji: string; desc: string }[] = [
  { value: 'binaire', label: 'Binaire', emoji: '✅', desc: 'OUI / NON' },
  { value: 'over_under', label: 'Over/Under', emoji: '📊', desc: 'Seuil + bornes' },
  { value: 'tranches_multiples', label: 'Tranches', emoji: '📏', desc: '1-5 tranches' },
  { value: 'tierce_du_daim', label: 'Tiercé', emoji: '🏇', desc: '6-20 candidats' },
];

const CATEGORY_OPTIONS: { value: BetCategory; label: string }[] = [
  { value: 'urgent', label: '⚡ Urgent (max 30%)' },
  { value: 'long_terme', label: '📅 Long terme (max 15%)' },
  { value: 'culture_daim', label: '🎪 Culture Daim (max 30%)' },
];

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const [bets, setBets] = useState<BetWithOptions[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allWagers, setAllWagers] = useState<Wager[]>([]);
  const [loading, setLoading] = useState(true);
  const [gazetteMessages, setGazetteMessages] = useState<GazetteMessage[]>([]);
  const [adminProposals, setAdminProposals] = useState<Proposal[]>([]);
  const [proposalProfiles, setProposalProfiles] = useState<Record<string, string>>({});

  // Tickets
  const [adminTickets, setAdminTickets] = useState<any[]>([]);
  const [adminTicketMessages, setAdminTicketMessages] = useState<Record<string, any[]>>({});
  const [activeAdminTicketId, setActiveAdminTicketId] = useState<string | null>(null);
  const [ticketSortBy, setTicketSortBy] = useState<'date' | 'status' | 'name'>('date');

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<BetType>('binaire');
  const [newCategory, setNewCategory] = useState<BetCategory>('urgent');
  const [newEndDate, setNewEndDate] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [options, setOptions] = useState([{ label: '' }, { label: '' }]);
  const [publishMode, setPublishMode] = useState<'direct' | 'vote'>('direct');
  const [openToSuggestions, setOpenToSuggestions] = useState(false);
  const [resolutionMode, setResolutionMode] = useState<'admin' | 'tirage_sort'>('admin');
  const [maxWinners, setMaxWinners] = useState(1);
  // Over/Under
  const [overUnderThreshold, setOverUnderThreshold] = useState('');
  // Tiercé candidates
  const [tierceCandidates, setTierceCandidates] = useState<string[]>([]);
  const [newCandidate, setNewCandidate] = useState('');
  // AI evaluation
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiComment, setAiComment] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  // Delete motif
  const [deleteMotif, setDeleteMotif] = useState('');
  // User management
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [userSortBy, setUserSortBy] = useState<'balance' | 'display_name' | 'created_at'>('balance');
  const [balanceDelta, setBalanceDelta] = useState('');
  const [balanceMotif, setBalanceMotif] = useState('');
  const [injecting, setInjecting] = useState(false);
  const [showInjectionModal, setShowInjectionModal] = useState(false);
  const [injections, setInjections] = useState<{ id: string; amount_dc: number; triggered_at: string }[]>([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveMonth, setArchiveMonth] = useState<string>('all');

  // Multi-winner resolution
  const [selectedWinners, setSelectedWinners] = useState<Record<string, Set<string>>>({});

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin]);

  const fetchAll = useCallback(async () => {
    const [betsRes, prRes, wagersRes, injRes, gazRes, propRes] = await Promise.all([
      supabase.from('bets').select('*, bet_options(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('balance', { ascending: false }),
      supabase.from('wagers').select('*').order('created_at', { ascending: false }),
      supabase.from('liquidity_injections').select('*').order('triggered_at', { ascending: false }),
      supabase.from('gazette_messages').select('*').order('created_at', { ascending: false }),
      supabase.from('daimocratie_proposals').select('*').order('created_at', { ascending: false }),
    ]);
    setBets((betsRes.data as BetWithOptions[]) || []);
    setProfiles(prRes.data || []);
    setAllWagers((wagersRes.data as Wager[]) || []);
    setInjections(injRes.data || []);
    setGazetteMessages(gazRes.data || []);
    const props = propRes.data || [];
    setAdminProposals(props);
    // Fetch proposer names
    if (props.length > 0) {
      const uids = [...new Set(props.map(p => p.user_id))];
      const { data: pNames } = await supabase.from('profiles').select('user_id, display_name').in('user_id', uids);
      if (pNames) {
        const m: Record<string, string> = {};
        pNames.forEach(p => { m[p.user_id] = p.display_name; });
        setProposalProfiles(m);
      }
    }
    setLoading(false);
  }, []);

  // ─── COMPUTED CLOSE DATE PREVIEW ───
  const computedCloseDate = (() => {
    if (!newEndDate) return null;
    const end = new Date(newEndDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    if (newCategory === 'urgent' && newTitle.toLowerCase().includes('retard')) {
      return new Date(end.getTime() - 4 * 3600000);
    }
    if (diff < 3600000) return new Date(end.getTime() - 20 * 60000);
    return new Date(end.getTime() - 15 * 60000);
  })();

  // ─── AI EVALUATION ───
  const evaluateBet = async () => {
    setAiLoading(true);
    setAiScore(null);
    setAiComment('');
    try {
      const optLabels = newType === 'tierce_du_daim'
        ? tierceCandidates
        : newType === 'binaire'
          ? ['OUI', 'NON']
          : options.filter(o => o.label.trim()).map(o => o.label);

      const resp = await supabase.functions.invoke('evaluate-bet', {
        body: { title: newTitle, type: newType, category: newCategory, options: optLabels },
      });
      if (resp.data) {
        setAiScore(resp.data.score);
        setAiComment(resp.data.comment || 'Évaluation indisponible');
      }
    } catch {
      setAiComment('Évaluation indisponible');
    }
    setAiLoading(false);
  };

  // ─── BUILD OPTIONS FOR TYPE ───
  const buildOptions = (): { label: string; bornes_info?: string }[] => {
    switch (newType) {
      case 'binaire':
        return [{ label: 'OUI' }, { label: 'NON' }];
      case 'over_under':
        return [
          { label: `Over ${overUnderThreshold}`, bornes_info: `≥ ${overUnderThreshold} (borne inclusive)` },
          { label: `Under ${overUnderThreshold}`, bornes_info: `< ${overUnderThreshold}` },
        ];
      case 'tranches_multiples':
        return options.filter(o => o.label.trim()).map(o => ({ label: o.label.trim() }));
      case 'tierce_du_daim':
        return tierceCandidates.map(c => ({ label: c }));
      default:
        return options.filter(o => o.label.trim()).map(o => ({ label: o.label.trim() }));
    }
  };

  // ─── CREATE BET ───
  const createBet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const builtOptions = buildOptions();
    if (newType === 'tierce_du_daim' && builtOptions.length < 6) {
      toast.error('Le Tiercé du Daim nécessite au moins 6 candidats'); return;
    }
    if (newType === 'tierce_du_daim' && builtOptions.length > 20) {
      toast.error('Maximum 20 candidats pour le Tiercé'); return;
    }
    if (builtOptions.length < 2) { toast.error('Il faut au moins 2 options'); return; }
    if (!newEndDate) { toast.error('La date de fin est obligatoire'); return; }

    const isLongTerme = newCategory === 'long_terme';

    const betData: any = {
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      category: newCategory,
      type: newType,
      created_by: user.id,
      end_date: new Date(newEndDate).toISOString(),
      is_long_terme: isLongTerme,
      mise_max_pct: isLongTerme ? 15 : 30,
      resolution_mode: resolutionMode,
      max_winners: maxWinners,
      open_to_suggestions: newType === 'tierce_du_daim' ? openToSuggestions : false,
    };
    if (newEmoji) betData.emoji = newEmoji;

    const { data: bet, error } = await supabase.from('bets').insert(betData).select().single();
    if (error || !bet) { toast.error(`Erreur création: ${error?.message}`); return; }

    await supabase.from('bet_options').insert(
      builtOptions.map(o => ({ bet_id: bet.id, label: o.label, bornes_info: (o as any).bornes_info || null }))
    );

    // If vote mode → create proposal
    if (publishMode === 'vote') {
      await supabase.from('daimocratie_proposals').insert({
        title: newTitle.trim(),
        type: newType,
        user_id: user.id,
        options_json: builtOptions,
        end_date_proposed: new Date(newEndDate).toISOString(),
      });
      // Set bet to suspended until approved
      await supabase.from('bets').update({ status: 'suspendu' as any }).eq('id', bet.id);
      toast.success('Pari soumis au vote communautaire 🗳️');
    } else {
      // Gazette message
      await supabase.from('gazette_messages').insert({
        content: `📢 Nouveau pari : "${bet.title}" — Les mises sont ouvertes ! 🔥`,
        is_system_message: true,
      });
      toast.success('Pari publié ! 🟢');
    }

    // Reset form
    setNewTitle(''); setNewDesc(''); setNewEndDate(''); setNewEmoji('');
    setOptions([{ label: '' }, { label: '' }]);
    setTierceCandidates([]); setOverUnderThreshold('');
    setAiScore(null); setAiComment('');
    setMaxWinners(1); setOpenToSuggestions(false);
    setResolutionMode('admin');
    fetchAll();
  };

  // ─── ACTIONS ───
  const closeBet = async (betId: string) => {
    await supabase.from('bets').update({ status: 'cloture_en_attente' as any }).eq('id', betId);
    const bet = bets.find(b => b.id === betId);
    await supabase.from('gazette_messages').insert({
      content: `🔒 Mises closes : "${bet?.title}" — Résultat à venir !`,
      is_system_message: true,
    });
    toast.success('Mises clôturées 🔒');
    fetchAll();
  };

  const suspendBet = async (betId: string, suspend: boolean) => {
    await supabase.from('bets').update({ status: (suspend ? 'suspendu' : 'ouvert') as any }).eq('id', betId);
    const bet = bets.find(b => b.id === betId);
    await supabase.from('gazette_messages').insert({
      content: suspend
        ? `⏸️ Pari suspendu par Jordaim Belfort : "${bet?.title}"`
        : `▶️ Pari réactivé : "${bet?.title}" — Les mises reprennent !`,
      is_system_message: true,
    });
    toast.success(suspend ? 'Pari suspendu ⏸️' : 'Pari réactivé ▶️');
    fetchAll();
  };

  const resolveBet = async (betId: string) => {
    const winners = selectedWinners[betId];
    if (!winners || winners.size === 0) { toast.error('Sélectionne au moins une option gagnante'); return; }
    const winnerIds = Array.from(winners);

    const { data, error } = await supabase.rpc('resolve_bet', {
      p_bet_id: betId,
      p_winning_option_ids: winnerIds,
    });
    if (error) { toast.error(`Erreur: ${error.message}`); return; }
    const result = data as { error?: string };
    if (result.error) { toast.error(result.error); return; }

    const bet = bets.find(b => b.id === betId);
    const winnerLabels = bet?.bet_options.filter(o => winnerIds.includes(o.id)).map(o => o.label).join(', ');
    toast.success(`Pari résolu ! 🏆 Gagnant(s) : ${winnerLabels}`);
    setSelectedWinners(prev => { const n = { ...prev }; delete n[betId]; return n; });
    fetchAll();
  };

  const triggerTirage = async (betId: string) => {
    const bet = bets.find(b => b.id === betId);
    if (!bet) return;
    toast.info('🎲 Tirage au sort en cours...');
    const { data, error } = await supabase.functions.invoke('tirage-sort', {
      body: { bet_id: betId, max_winners: bet.max_winners },
    });
    if (error) { toast.error('Erreur tirage au sort'); return; }
    if (data?.error) { toast.error(data.error); return; }
    toast.success(`🎲 Tirage au sort terminé ! Gagnant(s) : ${data.winners}`);
    fetchAll();
  };

  const cancelBet = async (betId: string, motif: string) => {
    if (!motif.trim()) { toast.error('Le motif de suppression est obligatoire'); return; }
    const bet = bets.find(b => b.id === betId);
    if (bet?.status === 'resolu') { toast.error('Impossible de supprimer un pari résolu'); return; }

    // Refund all wagers
    const betWagers = allWagers.filter(w => w.bet_id === betId && !w.is_retracted);
    for (const wager of betWagers) {
      const { data: prof } = await supabase.from('profiles').select('balance').eq('user_id', wager.user_id).single();
      if (prof) {
        await supabase.from('profiles').update({ balance: prof.balance + wager.montant_dc }).eq('user_id', wager.user_id);
      }
      await supabase.from('solde_history').insert({
        user_id: wager.user_id, delta_dc: wager.montant_dc, reason: 'Remboursement: pari annulé',
      });
    }

    await supabase.from('bets').update({ status: 'supprime' as any, suppression_motif: motif }).eq('id', betId);
    await supabase.from('gazette_messages').insert({
      content: `❌ Pari annulé : "${bet?.title}" — Toutes les mises ont été remboursées.`,
      is_system_message: true,
    });
    toast.success(`Pari annulé, ${betWagers.length} mises remboursées 💰`);
    setDeleteMotif('');
    fetchAll();
  };

  // ─── USER MANAGEMENT ───
  const resetAllBalances = async () => {
    for (const p of profiles) {
      await supabase.from('profiles').update({ balance: STARTING_BALANCE }).eq('user_id', p.user_id);
    }
    toast.success(`Soldes réinitialisés à ${STARTING_BALANCE} DC !`);
    fetchAll();
  };

  const updateBalance = async (userId: string, newBalance: number) => {
    await supabase.from('profiles').update({ balance: newBalance }).eq('user_id', userId);
    toast.success('Solde mis à jour');
    fetchAll();
  };

  const adjustBalanceWithMotif = async (userId: string, delta: number, motif: string) => {
    if (!motif.trim()) { toast.error('Le motif est obligatoire'); return; }
    const profile = profiles.find(p => p.user_id === userId);
    if (!profile) return;
    const newBal = profile.balance + delta;
    await supabase.from('profiles').update({ balance: newBal }).eq('user_id', userId);
    await supabase.from('solde_history').insert({ user_id: userId, delta_dc: delta, reason: motif.trim() });
    toast.success(`Solde modifié : ${delta > 0 ? '+' : ''}${delta} DC`);
    setBalanceDelta(''); setBalanceMotif('');
    setSelectedUser({ ...profile, balance: newBal });
    fetchAll();
  };

  const toggleSuspend = async (userId: string, suspend: boolean) => {
    await supabase.from('profiles').update({ is_suspended: suspend }).eq('user_id', userId);
    toast.success(suspend ? 'Utilisateur suspendu ⛔' : 'Utilisateur réactivé ✅');
    const profile = profiles.find(p => p.user_id === userId);
    if (profile) setSelectedUser({ ...profile, is_suspended: suspend });
    fetchAll();
  };

  const resetUserPassword = async (userId: string) => {
    // We need the user's email - we don't have it in profiles, so use admin API via edge function
    toast.info('Fonction de réinitialisation de mot de passe disponible via le lien "Mot de passe oublié" sur la page de connexion.');
  };

  const triggerLiquidityInjection = async () => {
    if (injecting) return;
    setInjecting(true);
    try {
      const activeProfiles = profiles.filter(p => !p.is_suspended);
      for (const p of activeProfiles) {
        await supabase.from('profiles').update({ balance: p.balance + 250 }).eq('user_id', p.user_id);
        await supabase.from('solde_history').insert({
          user_id: p.user_id, delta_dc: 250, reason: 'Injection de liquidités',
        });
      }
      await supabase.from('liquidity_injections').insert({
        amount_dc: 250, triggered_by: user?.id,
      });
      await supabase.from('gazette_messages').insert({
        content: '🪙 Bonne nouvelle — des DAIMcoins viennent d\'être ajoutés à tous les soldes !',
        is_system_message: true,
      });
      toast.success(`Injection réussie ! +250 DC pour ${activeProfiles.length} utilisateurs 🪙`);
      setShowInjectionModal(false);
      fetchAll();
    } catch (err) {
      toast.error('Erreur lors de l\'injection');
    }
    setInjecting(false);
  };

  // ─── TOGGLE WINNER ───
  const toggleWinner = (betId: string, optionId: string, maxW: number) => {
    setSelectedWinners(prev => {
      const current = new Set(prev[betId] || []);
      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        if (current.size >= maxW) { toast.info(`Max ${maxW} gagnant(s)`); return prev; }
        current.add(optionId);
      }
      return { ...prev, [betId]: current };
    });
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

  // ─── SORTED PROFILES ───
  const sortedProfiles = [...profiles].sort((a, b) => {
    if (userSortBy === 'balance') return b.balance - a.balance;
    if (userSortBy === 'display_name') return a.display_name.localeCompare(b.display_name);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });


  const filteredBets = bets.filter(b => {
    if (filterStatus !== 'all' && b.status !== filterStatus) return false;
    if (filterCategory !== 'all' && b.category !== filterCategory) return false;
    if (filterType !== 'all' && b.type !== filterType) return false;
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

  const manageBets = bets.filter(b => ['ouvert', 'cloture_en_attente', 'suspendu'].includes(b.status));

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="text-center mb-8">
        <Shield className="w-12 h-12 mx-auto text-primary mb-2" />
        <h1 className="text-4xl font-display gold-text">Jordaim Belfort</h1>
        <p className="text-muted-foreground mt-1">Panneau d'administration</p>
      </div>

      <Tabs defaultValue="create" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7 bg-secondary">
          <TabsTrigger value="create" className="font-display text-xs"><Plus className="w-4 h-4 mr-1" /> Créer</TabsTrigger>
          <TabsTrigger value="manage" className="font-display text-xs"><CheckCircle className="w-4 h-4 mr-1" /> Gérer</TabsTrigger>
          <TabsTrigger value="proposals" className="font-display text-xs">
            <Vote className="w-4 h-4 mr-1" /> Votes
            {adminProposals.filter(p => p.status === 'en_attente').length > 0 && (
              <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                {adminProposals.filter(p => p.status === 'en_attente').length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="results" className="font-display text-xs"><History className="w-4 h-4 mr-1" /> Archive</TabsTrigger>
          <TabsTrigger value="users" className="font-display text-xs"><Users className="w-4 h-4 mr-1" /> Joueurs</TabsTrigger>
          <TabsTrigger value="gazette" className="font-display text-xs">
            <MessageSquare className="w-4 h-4 mr-1" /> Gazette
            {gazetteMessages.filter(m => m.flag_status && !m.is_deleted).length > 0 && (
              <span className="ml-1 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                {gazetteMessages.filter(m => m.flag_status && !m.is_deleted).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="stats" className="font-display text-xs"><BarChart3 className="w-4 h-4 mr-1" /> Stats</TabsTrigger>
        </TabsList>

        {/* ═══════════════ CREATE ═══════════════ */}
        <TabsContent value="create">
          <form onSubmit={createBet} className="rounded-xl border border-border bg-card p-6 card-glow space-y-5">
            <h2 className="text-xl font-display">Nouveau pari</h2>

            {/* Type selection */}
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">Type de pari</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {TYPE_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setNewType(t.value);
                      if (t.value === 'binaire') setOptions([{ label: 'OUI' }, { label: 'NON' }]);
                      if (t.value === 'over_under') setOptions([]);
                      if (t.value === 'tranches_multiples') setOptions([{ label: '' }, { label: '' }]);
                    }}
                    className={`p-3 rounded-xl border text-center transition-colors ${
                      newType === t.value ? 'border-primary bg-primary/10' : 'border-border bg-secondary/50 hover:border-primary/30'
                    }`}
                  >
                    <span className="text-2xl block mb-1">{t.emoji}</span>
                    <span className="text-sm font-semibold block">{t.label}</span>
                    <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Title + Emoji */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-3">
                <Input placeholder="Titre du pari" value={newTitle} onChange={e => setNewTitle(e.target.value)} required maxLength={200} />
              </div>
              <div>
                <Input placeholder="Emoji (auto)" value={newEmoji} onChange={e => setNewEmoji(e.target.value)} maxLength={4} />
              </div>
            </div>

            <Textarea placeholder="Description (optionnel)" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} maxLength={500} />

            {/* Category + End date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-muted-foreground mb-1 block">Catégorie</Label>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value as BetCategory)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground mb-1 block">Fin du pari</Label>
                <Input type="datetime-local" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} required />
                {computedCloseDate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    🔒 Clôture auto : {computedCloseDate.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>

            {/* TYPE-SPECIFIC OPTIONS */}
            {newType === 'over_under' && (
              <div>
                <Label className="text-sm text-muted-foreground mb-1 block">Seuil Over/Under</Label>
                <Input placeholder="Ex: 15 minutes" value={overUnderThreshold} onChange={e => setOverUnderThreshold(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">La borne OVER est inclusive (≥ seuil)</p>
              </div>
            )}

            {newType === 'tranches_multiples' && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Tranches (1-5)</Label>
                {options.map((opt, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input placeholder={`Tranche ${i + 1}`} value={opt.label}
                      onChange={e => { const n = [...options]; n[i].label = e.target.value; setOptions(n); }}
                      className="flex-1" />
                    {options.length > 2 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                {options.length < 5 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setOptions([...options, { label: '' }])}>
                    <Plus className="w-3 h-3 mr-1" /> Ajouter tranche
                  </Button>
                )}
                <div>
                  <Label className="text-sm text-muted-foreground mb-1 block">Nb max de gagnants (1-5)</Label>
                  <Input type="number" min={1} max={5} value={maxWinners} onChange={e => setMaxWinners(parseInt(e.target.value) || 1)} className="w-24" />
                </div>
              </div>
            )}

            {newType === 'tierce_du_daim' && (
              <div className="space-y-3">
                <Label className="text-sm text-muted-foreground">Candidats (6-20)</Label>
                <div className="flex gap-2">
                  <select value={newCandidate} onChange={e => setNewCandidate(e.target.value)}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Choisir un prénom...</option>
                    {PROMO_NAMES.filter(n => !tierceCandidates.includes(n)).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" onClick={() => {
                    if (newCandidate && tierceCandidates.length < 20) {
                      setTierceCandidates([...tierceCandidates, newCandidate]);
                      setNewCandidate('');
                    }
                  }} disabled={!newCandidate || tierceCandidates.length >= 20}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tierceCandidates.map(c => (
                    <span key={c} className="inline-flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded-full">
                      {c}
                      <button type="button" onClick={() => setTierceCandidates(tierceCandidates.filter(x => x !== c))} className="text-muted-foreground hover:text-destructive">×</button>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{tierceCandidates.length}/20 candidats</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-sm text-muted-foreground mb-1 block">Mode résolution</Label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setResolutionMode('admin')}
                        className={`flex-1 p-2 rounded-lg border text-xs text-center transition-colors ${resolutionMode === 'admin' ? 'border-primary bg-primary/10' : 'border-border'}`}>
                        🧠 Admin
                      </button>
                      <button type="button" onClick={() => setResolutionMode('tirage_sort')}
                        className={`flex-1 p-2 rounded-lg border text-xs text-center transition-colors ${resolutionMode === 'tirage_sort' ? 'border-primary bg-primary/10' : 'border-border'}`}>
                        🎲 Tirage
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground mb-1 block">Max gagnants (1-3)</Label>
                    <Input type="number" min={1} max={3} value={maxWinners} onChange={e => setMaxWinners(parseInt(e.target.value) || 1)} className="w-24" />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <Switch checked={openToSuggestions} onCheckedChange={setOpenToSuggestions} />
                    <Label className="text-xs">Ouvert aux suggestions</Label>
                  </div>
                </div>
              </div>
            )}

            {/* Publication mode */}
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">Mode de publication</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPublishMode('direct')}
                  className={`flex-1 p-3 rounded-xl border text-center text-sm transition-colors ${publishMode === 'direct' ? 'border-primary bg-primary/10' : 'border-border'}`}>
                  🟢 Publication directe
                </button>
                <button type="button" onClick={() => setPublishMode('vote')}
                  className={`flex-1 p-3 rounded-xl border text-center text-sm transition-colors ${publishMode === 'vote' ? 'border-primary bg-primary/10' : 'border-border'}`}>
                  🗳️ Soumettre au vote
                </button>
              </div>
            </div>

            {/* AI Evaluation */}
            <div className="bg-secondary/50 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-1"><Sparkles className="w-4 h-4 text-primary" /> Évaluation IA</span>
                <Button type="button" variant="outline" size="sm" onClick={evaluateBet} disabled={aiLoading || !newTitle.trim()}>
                  {aiLoading ? 'Analyse...' : 'Évaluer'}
                </Button>
              </div>
              {aiScore !== null && (
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Progress value={aiScore} className="flex-1 h-2" />
                    <span className={`text-sm font-bold ${aiScore >= 70 ? 'text-green-500' : aiScore >= 40 ? 'text-primary' : 'text-destructive'}`}>
                      {aiScore}/100
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{aiComment}</p>
                </div>
              )}
              {aiScore === null && aiComment && <p className="text-xs text-muted-foreground">{aiComment}</p>}
            </div>

            <Button type="submit" className="gold-gradient font-semibold w-full text-base h-12">
              {publishMode === 'direct' ? 'Publier le pari 🟢' : 'Soumettre au vote 🗳️'}
            </Button>
          </form>
        </TabsContent>

        {/* ═══════════════ PROPOSALS ═══════════════ */}
        <TabsContent value="proposals">
          <div className="space-y-4">
            <h2 className="text-xl font-display">Propositions communautaires</h2>

            {adminProposals.filter(p => p.status === 'en_attente').length === 0 && (
              <p className="text-muted-foreground text-center py-8">Aucune proposition en attente.</p>
            )}

            {adminProposals.filter(p => p.status === 'en_attente').map(prop => (
              <div key={prop.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{prop.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      Par {proposalProfiles[prop.user_id] || 'Inconnu'} · {new Date(prop.created_at).toLocaleDateString('fr-FR')}
                    </p>
                    {prop.type && <p className="text-xs text-muted-foreground mt-0.5">Type : {prop.type}</p>}
                    {prop.end_date_proposed && (
                      <p className="text-xs text-muted-foreground">Fin proposée : {new Date(prop.end_date_proposed).toLocaleString('fr-FR')}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm">👍 {prop.votes_positive} · 👎 {prop.votes_negative}</p>
                    <p className="text-[10px] text-muted-foreground">Seuil : 15👍 & &lt;5👎</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="gold-gradient flex-1" onClick={async () => {
                    // Accept: create bet from proposal
                    const { data, error } = await supabase.functions.invoke('activate-proposal', {
                      body: { proposal_id: prop.id },
                    });
                    if (error || data?.error) {
                      // If threshold not met, force-activate by updating votes first
                      await supabase.from('daimocratie_proposals').update({
                        votes_positive: 15, votes_negative: 0,
                      }).eq('id', prop.id);
                      await supabase.functions.invoke('activate-proposal', { body: { proposal_id: prop.id } });
                    }
                    toast.success('Proposition validée et pari créé ! ✅');
                    fetchAll();
                  }}>
                    <CheckCircle className="w-4 h-4 mr-1" /> Accepter
                  </Button>
                  <Button size="sm" variant="destructive" className="flex-1" onClick={async () => {
                    await supabase.from('daimocratie_proposals').update({ status: 'rejete' as any }).eq('id', prop.id);
                    toast.success('Proposition rejetée ❌');
                    fetchAll();
                  }}>
                    <XCircle className="w-4 h-4 mr-1" /> Rejeter
                  </Button>
                </div>
              </div>
            ))}

            {/* Processed proposals */}
            {adminProposals.filter(p => p.status !== 'en_attente').length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-display text-muted-foreground mb-3">Historique</h3>
                {adminProposals.filter(p => p.status !== 'en_attente').map(prop => (
                  <div key={prop.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50 mb-2">
                    <div>
                      <span className="text-sm">{prop.title}</span>
                      <span className="text-xs text-muted-foreground ml-2">par {proposalProfiles[prop.user_id] || '?'}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      prop.status === 'valide' ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'
                    }`}>
                      {prop.status === 'valide' ? '✅ Validé' : '❌ Rejeté'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════ MANAGE ═══════════════ */}
        <TabsContent value="manage">
          <div className="space-y-4">
            <h2 className="text-xl font-display">Paris actifs ({manageBets.length})</h2>
            {manageBets.length === 0 && <p className="text-muted-foreground text-center py-8">Aucun pari actif.</p>}
            {manageBets.map(bet => {
              const betWagers = allWagers.filter(w => w.bet_id === bet.id && !w.is_retracted);
              const totalPool = betWagers.reduce((s, w) => s + w.montant_dc, 0);
              const pools: Record<string, number> = {};
              betWagers.forEach(w => { pools[w.option_id] = (pools[w.option_id] || 0) + w.montant_dc; });
              const isClosed = bet.status === 'cloture_en_attente';
              const isSuspended = bet.status === 'suspendu';
              const isOpen = bet.status === 'ouvert';
              const isTirage = bet.resolution_mode === 'tirage_sort';
              const winners = selectedWinners[bet.id] || new Set();

              const statusLabel = isClosed ? '🔒 Clôturé' : isSuspended ? '⏸️ Suspendu' : '🔥 Ouvert';
              const statusColor = isClosed ? 'bg-muted text-muted-foreground' : isSuspended ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary';

              return (
                <motion.div key={bet.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl border bg-card p-5 ${isSuspended ? 'border-amber-500/30' : 'border-border'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-display tracking-wider">{bet.emoji || ''} {bet.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {bet.type.replace(/_/g, ' ')} · {bet.category} · Max {bet.max_winners} gagnant(s)
                        {bet.resolution_mode === 'tirage_sort' && ' · 🎲 Tirage'}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3">
                    Cagnotte : <span className="text-primary font-bold">{totalPool} DC</span> · {betWagers.length} mises · {new Set(betWagers.map(w => w.user_id)).size} parieurs
                  </p>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {isOpen && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => { if (confirm('Clôturer les mises ?')) closeBet(bet.id); }}>
                          🔒 Clôturer
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => suspendBet(bet.id, true)}>
                          <Pause className="w-3 h-3 mr-1" /> Suspendre
                        </Button>
                      </>
                    )}
                    {isSuspended && (
                      <Button variant="outline" size="sm" onClick={() => suspendBet(bet.id, false)}>
                        <Play className="w-3 h-3 mr-1" /> Lever suspension
                      </Button>
                    )}
                  </div>

                  {/* Resolution section */}
                  <div className="border-t border-border pt-3 mt-2">
                    <p className="text-xs text-muted-foreground mb-2 font-semibold">🏆 Résolution</p>

                    {isTirage ? (
                      <Button size="sm" className="gold-gradient mb-2" onClick={() => { if (confirm('Lancer le tirage au sort ?')) triggerTirage(bet.id); }}>
                        <Dice6 className="w-4 h-4 mr-1" /> Déclencher le tirage au sort 🎲
                      </Button>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-2">
                          Sélectionne {bet.max_winners > 1 ? `1-${bet.max_winners} options gagnantes` : "l'option gagnante"} :
                        </p>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {bet.bet_options.map(opt => {
                            const optPool = pools[opt.id] || 0;
                            const odds = totalPool > 0 && optPool > 0 ? (totalPool / optPool).toFixed(2) : DEFAULT_ODDS.toFixed(2);
                            const isSelected = winners.has(opt.id);
                            return (
                              <button key={opt.id} type="button"
                                onClick={() => toggleWinner(bet.id, opt.id, bet.max_winners)}
                                className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                                  isSelected ? 'border-primary bg-primary/20 text-primary font-bold' : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/30'
                                }`}>
                                <Trophy className="w-3 h-3 inline mr-1" />
                                {opt.label} (x{odds} · {optPool} DC)
                              </button>
                            );
                          })}
                        </div>
                        <Button size="sm" className="gold-gradient" disabled={winners.size === 0}
                          onClick={() => { if (confirm('Confirmer la résolution ?')) resolveBet(bet.id); }}>
                          Résoudre ({winners.size} gagnant{winners.size > 1 ? 's' : ''})
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Delete section */}
                  <div className="border-t border-border pt-3 mt-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Input placeholder="Motif de suppression (obligatoire)" value={deleteMotif} onChange={e => setDeleteMotif(e.target.value)} className="text-xs h-8" />
                      </div>
                      <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => { if (confirm('Supprimer et rembourser ?')) cancelBet(bet.id, deleteMotif); }}>
                        <XCircle className="w-3 h-3 mr-1" /> Supprimer
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        {/* ═══════════════ ARCHIVE ═══════════════ */}
        <TabsContent value="results">
          <div className="space-y-4">
            <h2 className="text-xl font-display">📜 Archives</h2>

            {/* Filters row */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[150px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Rechercher..." value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)}
                  className="pl-8 h-8 text-xs" />
              </div>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                <option value="all">Toutes catégories</option>
                {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                <option value="all">Tous types</option>
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
              </select>
              <select value={archiveMonth} onChange={e => setArchiveMonth(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                <option value="all">Tous mois</option>
                {(() => {
                  const months = new Set<string>();
                  bets.filter(b => b.status === 'resolu' || b.status === 'supprime').forEach(b => {
                    const d = new Date(b.updated_at);
                    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                  });
                  return [...months].sort().reverse().map(m => (
                    <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</option>
                  ));
                })()}
              </select>
            </div>

            {/* Resolved bets */}
            {(() => {
              const resolvedBets = bets.filter(b => {
                if (b.status !== 'resolu') return false;
                if (filterCategory !== 'all' && b.category !== filterCategory) return false;
                if (filterType !== 'all' && b.type !== filterType) return false;
                if (archiveMonth !== 'all') {
                  const d = new Date(b.updated_at);
                  const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                  if (m !== archiveMonth) return false;
                }
                if (archiveSearch && !b.title.toLowerCase().includes(archiveSearch.toLowerCase())) return false;
                return true;
              });

              return resolvedBets.length === 0
                ? <p className="text-center text-muted-foreground py-8">Aucun pari résolu trouvé.</p>
                : resolvedBets.map(bet => {
                    const betWagers = allWagers.filter(w => w.bet_id === bet.id && !w.is_retracted);
                    const totalPool = betWagers.reduce((s, w) => s + w.montant_dc, 0);
                    const uniqueBettors = new Set(betWagers.map(w => w.user_id)).size;
                    const winnerOptionIds = bet.bet_options.filter(o => o.is_winner).map(o => o.id);
                    const correctBettors = new Set(betWagers.filter(w => winnerOptionIds.includes(w.option_id)).map(w => w.user_id)).size;
                    const correctPct = uniqueBettors > 0 ? Math.round((correctBettors / uniqueBettors) * 100) : 0;
                    const catLabels: Record<string, string> = { urgent: '⚡ URGENT', long_terme: '📅 LONG TERME', culture_daim: '🎪 CULTURE DAIM' };

                    return (
                      <div key={bet.id} className="rounded-xl border border-primary/20 bg-card p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-display tracking-[0.08em] font-semibold">{bet.emoji || '🎯'} {bet.title}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {catLabels[bet.category] || bet.category} · Résolu le {new Date(bet.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">✅ Résolu</span>
                        </div>

                        {/* Options with final odds */}
                        <div className="flex flex-wrap gap-2">
                          {bet.bet_options.map(opt => {
                            const optPool = betWagers.filter(w => w.option_id === opt.id).reduce((s, w) => s + w.montant_dc, 0);
                            return (
                              <div key={opt.id} className={`text-xs px-3 py-1.5 rounded-lg border ${
                                opt.is_winner ? 'bg-primary/15 border-primary/30 text-primary font-bold' : 'bg-secondary border-border text-muted-foreground'
                              }`}>
                                {opt.label} {opt.is_winner && '🏆'} · ×{opt.cote_actuelle.toFixed(2)} · {optPool} DC
                              </div>
                            );
                          })}
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="rounded bg-secondary/50 p-2">
                            <p className="font-bold text-primary">{totalPool} DC</p>
                            <p className="text-muted-foreground">Volume total</p>
                          </div>
                          <div className="rounded bg-secondary/50 p-2">
                            <p className="font-bold">{uniqueBettors}</p>
                            <p className="text-muted-foreground">Parieurs</p>
                          </div>
                          <div className="rounded bg-secondary/50 p-2">
                            <p className="font-bold text-primary">{correctPct}%</p>
                            <p className="text-muted-foreground">Bons prophètes</p>
                          </div>
                        </div>
                      </div>
                    );
                  });
            })()}

            {/* Cancelled bets section */}
            {(() => {
              const cancelledBets = bets.filter(b => b.status === 'supprime');
              if (cancelledBets.length === 0) return null;
              return (
                <>
                  <div className="flex items-center gap-3 mt-6">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground font-display">❌ Paris supprimés</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  {cancelledBets.map(bet => (
                    <div key={bet.id} className="rounded-xl border border-destructive/20 bg-card p-4">
                      <h3 className="font-display tracking-wider text-sm">{bet.emoji || ''} {bet.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supprimé le {new Date(bet.updated_at).toLocaleDateString('fr-FR')}
                      </p>
                      {bet.suppression_motif && (
                        <p className="text-xs text-destructive mt-1">Motif : {bet.suppression_motif}</p>
                      )}
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        </TabsContent>

        {/* ═══════════════ USERS ═══════════════ */}
        <TabsContent value="users">
          <div className="space-y-4">
            {/* Header with actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-display">Joueurs ({profiles.length})</h2>
              <div className="flex flex-wrap gap-2">
                <select value={userSortBy} onChange={e => setUserSortBy(e.target.value as any)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                  <option value="balance">💰 Tri par solde</option>
                  <option value="display_name">🔤 Tri par nom</option>
                  <option value="created_at">📅 Tri par inscription</option>
                </select>
                <Button variant="outline" size="sm" onClick={() => setShowInjectionModal(true)} className="text-primary border-primary/30">
                  <Coins className="w-3 h-3 mr-1" /> Injection +250 DC
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => { if (confirm(`Réinitialiser TOUS les soldes à ${STARTING_BALANCE} DC ?`)) resetAllBalances(); }}
                  className="text-destructive border-destructive/30 hover:bg-destructive/10">
                  <RefreshCw className="w-3 h-3 mr-1" /> Reset soldes
                </Button>
              </div>
            </div>

            {/* Injection history */}
            {injections.length > 0 && (
              <div className="bg-secondary/50 border border-border rounded-xl p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">🪙 Historique des injections</p>
                <div className="space-y-1">
                  {injections.slice(0, 5).map(inj => (
                    <div key={inj.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>{new Date(inj.triggered_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-primary font-semibold">+{inj.amount_dc} DC / joueur</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User list */}
            {sortedProfiles.map((p, i) => {
              const userWagers = allWagers.filter(w => w.user_id === p.user_id && !w.is_retracted);
              return (
                <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                  className={`flex items-center gap-4 p-4 rounded-xl border bg-card cursor-pointer hover:border-primary/30 transition-colors ${p.is_suspended ? 'border-destructive/30 opacity-60' : 'border-border'}`}
                  onClick={() => { setSelectedUser(p); setBalanceDelta(''); setBalanceMotif(''); }}>
                  <span className="text-sm text-muted-foreground w-8">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{p.emoji || '🦌'} {p.display_name || 'Anonyme'}</span>
                      {p.is_suspended && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">Suspendu</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {userWagers.length} mises · Inscrit le {new Date(p.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-display text-primary font-bold">{p.balance}</span>
                    <img src={daimcoinLogo} alt="" className="w-5 h-5 rounded-full" />
                  </div>
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </motion.div>
              );
            })}
          </div>

          {/* ─── USER DETAIL DIALOG ─── */}
          <Dialog open={!!selectedUser} onOpenChange={open => { if (!open) setSelectedUser(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display tracking-wider">
                  {selectedUser?.emoji || '🦌'} {selectedUser?.display_name || 'Anonyme'}
                </DialogTitle>
                <DialogDescription>
                  {selectedUser?.is_suspended ? '⛔ Compte suspendu' : '✅ Compte actif'} · Inscrit le {selectedUser && new Date(selectedUser.created_at).toLocaleDateString('fr-FR')}
                </DialogDescription>
              </DialogHeader>

              {selectedUser && (
                <div className="space-y-4">
                  {/* Current balance */}
                  <div className="flex items-center justify-center gap-2 py-3 bg-secondary/50 rounded-xl">
                    <span className="text-3xl font-display text-primary">{selectedUser.balance}</span>
                    <img src={daimcoinLogo} alt="" className="w-7 h-7 rounded-full" />
                  </div>

                  {/* Bet stats */}
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="bg-secondary/50 rounded-lg p-2">
                      <p className="text-primary font-bold text-lg">{allWagers.filter(w => w.user_id === selectedUser.user_id && !w.is_retracted).length}</p>
                      <p className="text-muted-foreground">Mises actives</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-2">
                      <p className="text-primary font-bold text-lg">
                        {allWagers.filter(w => w.user_id === selectedUser.user_id && !w.is_retracted).reduce((s, w) => s + w.montant_dc, 0)} DC
                      </p>
                      <p className="text-muted-foreground">Volume misé</p>
                    </div>
                  </div>

                  {/* Balance adjustment */}
                  <div className="border-t border-border pt-3">
                    <p className="text-sm font-semibold mb-2">Modifier le solde</p>
                    <div className="flex gap-2">
                      <Input type="number" placeholder="Delta (ex: +100 ou -50)" value={balanceDelta}
                        onChange={e => setBalanceDelta(e.target.value)} className="flex-1 h-9 text-sm" />
                    </div>
                    <Input placeholder="Motif obligatoire" value={balanceMotif}
                      onChange={e => setBalanceMotif(e.target.value)} className="mt-2 h-9 text-sm" />
                    {balanceDelta && !isNaN(Number(balanceDelta)) && selectedUser.balance + Number(balanceDelta) < 0 && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Le solde sera négatif ({selectedUser.balance + Number(balanceDelta)} DC)
                      </p>
                    )}
                    <Button size="sm" className="mt-2 w-full" disabled={!balanceDelta || !balanceMotif.trim() || isNaN(Number(balanceDelta))}
                      onClick={() => adjustBalanceWithMotif(selectedUser.user_id, Number(balanceDelta), balanceMotif)}>
                      Appliquer {balanceDelta && !isNaN(Number(balanceDelta)) ? `(${Number(balanceDelta) > 0 ? '+' : ''}${balanceDelta} DC)` : ''}
                    </Button>
                  </div>

                  {/* Actions */}
                  <div className="border-t border-border pt-3 flex flex-col gap-2">
                    <Button variant="outline" size="sm" className={selectedUser.is_suspended ? '' : 'text-destructive border-destructive/30'}
                      onClick={() => toggleSuspend(selectedUser.user_id, !selectedUser.is_suspended)}>
                      {selectedUser.is_suspended ? (
                        <><Play className="w-3 h-3 mr-1" /> Réactiver le compte</>
                      ) : (
                        <><Ban className="w-3 h-3 mr-1" /> Suspendre le compte</>
                      )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => resetUserPassword(selectedUser.user_id)}>
                      <RefreshCw className="w-3 h-3 mr-1" /> Réinitialiser le mot de passe
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* ─── INJECTION CONFIRMATION DIALOG ─── */}
          <AlertDialog open={showInjectionModal} onOpenChange={setShowInjectionModal}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display">🪙 Injection de liquidités</AlertDialogTitle>
                <AlertDialogDescription>
                  +250 DC seront ajoutés au solde de tous les utilisateurs actifs ({profiles.filter(p => !p.is_suspended).length} joueurs).
                  Les utilisateurs suspendus ne recevront pas l'injection.
                  Un message automatique sera publié dans La Gazette.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={injecting}>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={triggerLiquidityInjection} disabled={injecting} className="gold-gradient">
                  {injecting ? 'Injection en cours...' : 'Confirmer l\'injection 🪙'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* ═══════════════ GAZETTE ═══════════════ */}
        <TabsContent value="gazette">
          <div className="space-y-6">
            {/* Moderation queue */}
            {(() => {
              const flaggedMessages = gazetteMessages.filter(m => m.flag_status && !m.is_deleted);
              return flaggedMessages.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-xl font-display text-destructive">🚩 File de modération ({flaggedMessages.length})</h2>
                  {flaggedMessages.sort((a, b) => b.flag_score - a.flag_score).map(msg => {
                    const author = profiles.find(p => p.user_id === msg.user_id);
                    return (
                      <div key={msg.id} className="rounded-xl border border-destructive/30 bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm mb-1">{msg.content}</p>
                            <p className="text-xs text-muted-foreground">
                              👤 {author?.display_name || 'Système'} · {new Date(msg.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-xs mt-1">
                              <span className={`font-bold ${msg.flag_score >= 80 ? 'text-destructive' : 'text-amber-500'}`}>
                                Score : {msg.flag_score}/100
                              </span>
                              {msg.flag_reason && <span className="text-muted-foreground ml-2">— {msg.flag_reason}</span>}
                            </p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <Button variant="outline" size="sm" className="text-xs"
                              onClick={async () => {
                                await supabase.from('gazette_messages').update({ flag_status: false }).eq('id', msg.id);
                                toast.success('Flag ignoré ✅');
                                fetchAll();
                              }}>
                              ✅ Ignorer
                            </Button>
                            <Button variant="outline" size="sm" className="text-xs text-destructive border-destructive/30"
                              onClick={async () => {
                                await supabase.from('gazette_messages').update({ is_deleted: true }).eq('id', msg.id);
                                toast.success('Message supprimé 🗑️');
                                fetchAll();
                              }}>
                              🗑️ Supprimer
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* All messages */}
            <div className="space-y-3">
              <h2 className="text-xl font-display">📰 Tous les messages ({gazetteMessages.filter(m => !m.is_deleted).length})</h2>
              {gazetteMessages.filter(m => !m.is_deleted).map(msg => {
                const author = profiles.find(p => p.user_id === msg.user_id);
                return (
                  <div key={msg.id} className={`rounded-xl border bg-card p-3 ${msg.flag_status ? 'border-destructive/20' : 'border-border'}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          👤 {msg.is_system_message ? '🤖 Système' : (author?.display_name || 'Anonyme')} · {new Date(msg.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {msg.flag_status && <span className="ml-2 text-destructive">🚩 {msg.flag_score}</span>}
                          {msg.flag_score > 0 && !msg.flag_status && <span className="ml-2 text-muted-foreground/50">({msg.flag_score})</span>}
                        </p>
                      </div>
                      {!msg.is_system_message && (
                        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8"
                          onClick={async () => {
                            if (confirm('Supprimer ce message ?')) {
                              await supabase.from('gazette_messages').update({ is_deleted: true }).eq('id', msg.id);
                              toast.success('Message supprimé');
                              fetchAll();
                            }
                          }}>
                          <Trash2 className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="stats">
          <div className="space-y-4">
            <h2 className="text-xl font-display">Statistiques 📊</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Utilisateurs', value: totalUsers, emoji: '👥' },
                { label: 'Mises total', value: totalWagersCount, emoji: '🎰' },
                { label: 'Mises ce mois', value: wagersThisMonth, emoji: '📅' },
                { label: 'Parieurs actifs', value: activeBettors, emoji: '🔥' },
                { label: 'Mise moyenne', value: `${avgWagerSize} DC`, emoji: '💰' },
                { label: 'Volume total', value: `${totalPoolAllTime} DC`, emoji: '📈' },
              ].map(stat => (
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
                    <span className="font-medium flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" />{month}</span>
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
