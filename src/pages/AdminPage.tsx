import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Shield, Plus, CheckCircle, Users, Trash2, Trophy, XCircle, BarChart3, History, Pause, Play, Dice6, Sparkles, Eye, EyeOff, Ban, RefreshCw, Coins, AlertTriangle, MessageSquare, Search, Vote, Ticket, Bell, Download, FileJson, FileSpreadsheet, TrendingUp, Mail, Send, Power, Bomb, Loader2, Menu, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Checkbox } from '@/components/ui/checkbox';
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
import AdminCreateTicketDialog from '@/components/AdminCreateTicketDialog';
import AdminGlossary from '@/components/AdminGlossary';
import AdminGameSessions from '@/components/AdminGameSessions';
import AdminDailyContent from '@/components/AdminDailyContent';
import AdminKmFullResults from '@/components/AdminKmFullResults';
import AdminGouvernements from '@/components/AdminGouvernements';
import AdminSondages from '@/components/AdminSondages';
import AdminTournois from '@/components/AdminTournois';
import AdminModeration from '@/components/AdminModeration';
import AdminModerationLog from '@/components/AdminModerationLog';
import { logModerationAction } from '@/lib/moderationLog';
import AdminPublicContacts from '@/components/AdminPublicContacts';
import AdminGameStatusPanel from '@/components/AdminGameStatusPanel';
import { useIsMobile } from '@/hooks/use-mobile';

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
  { value: 'urgent', label: '⚡ Urgent (max 30 %)' },
  { value: 'long_terme', label: '📅 Long terme (max 15 %)' },
  { value: 'culture_daim', label: '🎪 Culture Daim (max 30 %)' },
];

const ADMIN_SECTIONS = [
  { id: 'dashboard', label: 'Tableau de bord', emoji: '📊' },
  { id: 'paris', label: 'Paris', emoji: '🎯' },
  { id: 'jeux', label: 'Jeux Promo', emoji: '🎮' },
  { id: 'jeux_dc', label: 'Casino', emoji: '🎰' },
  { id: 'gouvernements', label: 'Gouvernements', emoji: '🏛️' },
  { id: 'gazette', label: 'Gazette', emoji: '📰' },
  { id: 'users', label: 'Utilisateurs', emoji: '👥' },
  { id: 'tickets', label: 'Tickets', emoji: '🎫' },
  { id: 'contacts_publics', label: 'Contacts publics', emoji: '📬' },
  { id: 'moderation', label: 'Modération', emoji: '🛡️' },
  { id: 'journal', label: 'Journal de modération', emoji: '📋' },
  { id: 'urgence', label: "Contrôle d'urgence", emoji: '🚨' },
  { id: 'pipeline', label: 'Pipeline', emoji: '📋' },
  { id: 'lexique', label: 'Lexique', emoji: '📖' },
  { id: 'exports', label: 'Exports / Rapports', emoji: '📥' },
] as const;

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exportingStats, setExportingStats] = useState(false);

  const [bets, setBets] = useState<BetWithOptions[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allWagers, setAllWagers] = useState<Wager[]>([]);
  const [loading, setLoading] = useState(true);
  const [gazetteMessages, setGazetteMessages] = useState<GazetteMessage[]>([]);
  const [adminProposals, setAdminProposals] = useState<Proposal[]>([]);
  const [proposalProfiles, setProposalProfiles] = useState<Record<string, string>>({});

  // Notifications
  const [adminNotifications, setAdminNotifications] = useState<any[]>([]);

  // Tickets
  const [adminTickets, setAdminTickets] = useState<any[]>([]);
  const [adminTicketMessages, setAdminTicketMessages] = useState<Record<string, any[]>>({});
  const [activeAdminTicketId, setActiveAdminTicketId] = useState<string | null>(null);
  const [ticketSortBy, setTicketSortBy] = useState<'date' | 'status' | 'name'>('date');

  // Tierce suggestions
  const [tierceSuggestions, setTierceSuggestions] = useState<any[]>([]);
  const [suggestionProfiles, setSuggestionProfiles] = useState<Record<string, string>>({});

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
  const [deleteOptionLoading, setDeleteOptionLoading] = useState(false);
  // User management
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [userSortBy, setUserSortBy] = useState<'balance' | 'display_name' | 'created_at'>('balance');
  const [balanceDelta, setBalanceDelta] = useState('');
  const [balanceMotif, setBalanceMotif] = useState('');
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [resetPwValue, setResetPwValue] = useState('');
  const [injecting, setInjecting] = useState(false);
  const [showInjectionModal, setShowInjectionModal] = useState(false);
  const [injections, setInjections] = useState<{ id: string; amount_dc: number; triggered_at: string }[]>([]);

  // Per-tab nuclear reset
  const [tabResetTarget, setTabResetTarget] = useState<string | null>(null);
  const [tabResetConfirm, setTabResetConfirm] = useState('');
  const [tabResetExecuting, setTabResetExecuting] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveMonth, setArchiveMonth] = useState<string>('all');

  // Messagerie
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);
  const [emailRecipientInput, setEmailRecipientInput] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [emailTodayCount, setEmailTodayCount] = useState(0);

  // Game subtitles
  const [gameSubtitles, setGameSubtitles] = useState<Record<string, string>>({});

  // Kiss/Marry reveal
  const [kmRevealStep, setKmRevealStep] = useState(0);
  const [kmShowCoupSoir, setKmShowCoupSoir] = useState(false);
  const [kmShowPlanQ, setKmShowPlanQ] = useState(false);

  // Maintenance
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  // Emergency suspension
  const [suspensionStatus, setSuspensionStatus] = useState<Record<string, boolean>>({});
  const [hideStatus, setHideStatus] = useState<Record<string, boolean>>({});
  const [nuclearOpen, setNuclearOpen] = useState(false);
  const [nuclearStep, setNuclearStep] = useState(1);
  const [nuclearCheck1, setNuclearCheck1] = useState(false);
  const [nuclearPhrase, setNuclearPhrase] = useState('');
  const [nuclearReportSent, setNuclearReportSent] = useState(false);
  const [nuclearReportCheck, setNuclearReportCheck] = useState(false);
  const [nuclearCountdown, setNuclearCountdown] = useState(10);
  const [nuclearCountdownDone, setNuclearCountdownDone] = useState(false);
  const [nuclearExecuting, setNuclearExecuting] = useState(false);
  const [nuclearDone, setNuclearDone] = useState(false);
  const [nuclearSendingReport, setNuclearSendingReport] = useState(false);
  const [nuclearReportError, setNuclearReportError] = useState('');

  // Nav config (tab visibility)
  const [navConfig, setNavConfig] = useState<Record<string, boolean>>({});

  // Retraction config
  const [retractionStart, setRetractionStart] = useState(0);
  const [retractionEnd, setRetractionEnd] = useState(9);
  const [retractionSaving, setRetractionSaving] = useState(false);

  // Multi-winner resolution
  const [selectedWinners, setSelectedWinners] = useState<Record<string, Set<string>>>({});

  useEffect(() => { if (isAdmin) { fetchAll(); fetchUserEmails(); } }, [isAdmin]);

  const fetchUserEmails = async () => {
    const { data, error } = await supabase.functions.invoke('get-user-emails');
    if (!error && data?.emails) {
      setUserEmails(data.emails);
    }
  };

  const fetchAll = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [betsRes, prRes, wagersRes, injRes, gazRes, propRes, ticketsRes, notifRes, emailLogsRes, emailTodayRes, maintRes, navConfigRes, retractionRes, suggestionsRes, gameSubRes] = await Promise.all([
      supabase.from('bets').select('*, bet_options(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('balance', { ascending: false }),
      supabase.from('wagers').select('*').order('created_at', { ascending: false }),
      supabase.from('liquidity_injections').select('*').order('triggered_at', { ascending: false }),
      supabase.from('gazette_messages').select('*').order('created_at', { ascending: false }),
      supabase.from('daimocratie_proposals').select('*').order('created_at', { ascending: false }),
      supabase.from('tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('admin_notifications').select('*').order('created_at', { ascending: false }),
      supabase.from('admin_emails_log').select('*').order('sent_at', { ascending: false }).limit(50),
      supabase.from('admin_emails_log').select('*', { count: 'exact', head: true }).gte('sent_at', todayStart.toISOString()).eq('status', 'succes'),
      supabase.from('platform_settings').select('value').eq('key', 'maintenance_mode').single(),
      supabase.from('nav_config').select('tab_key, is_visible'),
      supabase.from('retraction_config').select('*').limit(1).single(),
      supabase.from('tierce_suggestions').select('*').eq('status', 'en_attente').order('created_at', { ascending: false }),
      supabase.from('platform_settings').select('key, value').or('key.like.game_subtitle_%,key.like.km_show_%,key.like.suspend_%,key.like.hide_%'),
    ]);
    setBets((betsRes.data as BetWithOptions[]) || []);
    setProfiles(prRes.data || []);
    setAllWagers((wagersRes.data as Wager[]) || []);
    setInjections(injRes.data || []);
    setGazetteMessages(gazRes.data || []);
    setAdminTickets(ticketsRes.data || []);
    setAdminNotifications(notifRes.data || []);
    setEmailLogs(emailLogsRes.data || []);
    setEmailTodayCount(emailTodayRes.count ?? 0);
    setMaintenanceMode(maintRes.data?.value === 'true');
    if (navConfigRes.data) {
      const nc: Record<string, boolean> = {};
      navConfigRes.data.forEach((r: any) => { nc[r.tab_key] = r.is_visible; });
      setNavConfig(nc);
    }
    if (gameSubRes.data) {
      const gs: Record<string, string> = {};
      const susp: Record<string, boolean> = {};
      const hid: Record<string, boolean> = {};
      gameSubRes.data.forEach((r: any) => {
        if (r.key.startsWith('suspend_')) {
          susp[r.key] = r.value === 'true';
        } else if (r.key.startsWith('hide_')) {
          hid[r.key] = r.value === 'true';
        } else {
          gs[r.key] = r.value;
        }
        if (r.key === 'km_show_coup_soir') setKmShowCoupSoir(r.value === 'true');
        if (r.key === 'km_show_plan_q') setKmShowPlanQ(r.value === 'true');
      });
      setGameSubtitles(gs);
      setSuspensionStatus(susp);
      setHideStatus(hid);
    }
    if (retractionRes.data) {
      setRetractionStart(retractionRes.data.start_hour);
      setRetractionEnd(retractionRes.data.end_hour);
    }
    const props = propRes.data || [];
    setAdminProposals(props);
    // Fetch proposer names
    if (props.length > 0) {
      const uids = [...new Set(props.map(p => p.user_id))];
      const { data: pNames } = await (supabase as any).from('profiles_public').select('user_id, display_name').in('user_id', uids);
      if (pNames) {
        const m: Record<string, string> = {};
        pNames.forEach(p => { m[p.user_id] = p.display_name; });
        setProposalProfiles(m);
      }
    }
    // Tierce suggestions
    const suggestions = suggestionsRes.data || [];
    setTierceSuggestions(suggestions);
    if (suggestions.length > 0) {
      const sUids = [...new Set(suggestions.map((s: any) => s.suggested_by))];
      const { data: sNames } = await (supabase as any).from('profiles_public').select('user_id, display_name').in('user_id', sUids);
      if (sNames) {
        const sm: Record<string, string> = {};
        sNames.forEach((p: any) => { sm[p.user_id] = p.display_name; });
        setSuggestionProfiles(sm);
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
    logModerationAction({ action_type: 'modification', target_type: 'pari', target_id: betId, description: `Mises clôturées sur "${bet?.title}"` });
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
    logModerationAction({
      action_type: suspend ? 'suspension' : 'validation',
      target_type: 'pari',
      target_id: betId,
      description: suspend ? `Pari suspendu : "${bet?.title}"` : `Pari réactivé : "${bet?.title}"`,
    });
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
    logModerationAction({
      action_type: 'validation',
      target_type: 'pari',
      target_id: betId,
      description: `Pari résolu : "${bet?.title}" — Gagnant(s) : ${winnerLabels}`,
    });
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
    logModerationAction({
      action_type: 'validation',
      target_type: 'pari',
      target_id: betId,
      description: `Tirage au sort exécuté sur "${bet.title}" — Gagnant(s) : ${data.winners}`,
    });
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
    logModerationAction({
      action_type: 'suppression',
      target_type: 'pari',
      target_id: betId,
      description: `Pari annulé : "${bet?.title}" (${betWagers.length} mises remboursées)`,
      motif,
    });
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
    logModerationAction({
      action_type: suspend ? 'suspension' : 'validation',
      target_type: 'utilisateur',
      target_id: userId,
      description: suspend ? `Utilisateur suspendu : ${profile?.display_name}` : `Utilisateur réactivé : ${profile?.display_name}`,
    });
    fetchAll();
  };

  const resetUserPassword = async (userId: string, newPassword: string) => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    const { data, error } = await supabase.functions.invoke('admin-reset-password', {
      body: { target_user_id: userId, new_password: newPassword },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Erreur');
    } else {
      toast.success('Mot de passe réinitialisé ! Communique-le à l\'utilisateur.');
      setResetPwValue('');
    }
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

  if (authLoading) {
    return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;
  }

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

  const openTicketsCount = adminTickets.filter(t => t.status === 'ouvert').length;
  const flaggedGazetteCount = gazetteMessages.filter(m => m.flag_status && !m.is_deleted).length;
  const unreadNotifCount = adminNotifications.filter(n => !n.is_read).length;
  const activeBetsCount = bets.filter(b => b.status === 'ouvert').length;
  const activeGamesCount = bets.filter(b => ['ouvert', 'cloture_en_attente'].includes(b.status)).length;
  const totalDcCirculation = profiles.reduce((s, p) => s + p.balance, 0);

  const sectionBadge = (sectionId: string): number => {
    if (sectionId === 'tickets') return openTicketsCount;
    if (sectionId === 'gazette') return flaggedGazetteCount;
    if (sectionId === 'dashboard') return unreadNotifCount;
    if (sectionId === 'pipeline') return adminProposals.filter(p => p.status === 'en_attente').length;
    if (sectionId === 'contacts_publics') return adminNotifications.filter(n => !n.is_read && n.type === 'public_contact').length;
    return 0;
  };

  const navigateTo = (id: string) => {
    setActiveSection(id);
    setSidebarOpen(false);
  };

  const handleExportStats = async () => {
    setExportingStats(true);
    try {
      const [
        profilesRes, wagersRes, betsRes, sessionsRes, participationsRes,
        kmRes, soldeRes, ticketsRes, proposalsRes, gazetteRes, injectionsRes,
      ] = await Promise.all([
        supabase.from('profiles').select('user_id, balance, created_at, is_suspended'),
        supabase.from('wagers').select('user_id, bet_id, montant_dc, is_retracted, created_at'),
        supabase.from('bets').select('id, status, created_at, close_date, updated_at'),
        supabase.from('game_sessions').select('id, game_type, status, title, created_at'),
        supabase.from('game_participations').select('user_id, session_id, created_at'),
        supabase.from('kiss_marry_votes').select('id, month_year, created_at'),
        supabase.from('solde_history').select('user_id, delta_dc, reason, created_at'),
        supabase.from('tickets').select('id, status, created_at'),
        supabase.from('daimocratie_proposals').select('id, status, created_at'),
        supabase.from('gazette_messages').select('id, created_at'),
        supabase.from('liquidity_injections').select('id, triggered_at'),
      ]);

      const errs = [profilesRes, wagersRes, betsRes, sessionsRes, participationsRes, kmRes, soldeRes, ticketsRes, proposalsRes, gazetteRes, injectionsRes].map(r => r.error).filter(Boolean);
      if (errs.length) throw errs[0];

      const profilesD = profilesRes.data ?? [];
      const wagersD = wagersRes.data ?? [];
      const betsD = betsRes.data ?? [];
      const sessionsD = sessionsRes.data ?? [];
      const partsD = participationsRes.data ?? [];
      const kmD = kmRes.data ?? [];
      const soldeD = soldeRes.data ?? [];
      const ticketsD = ticketsRes.data ?? [];
      const proposalsD = proposalsRes.data ?? [];
      const gazetteD = gazetteRes.data ?? [];
      const injectionsD = injectionsRes.data ?? [];

      const total_users = profilesD.length;
      const balances = profilesD.map((p: any) => p.balance ?? 0);
      const sortedBal = [...balances].sort((a, b) => a - b);
      const median_balance_dc = sortedBal.length === 0 ? 0 : (sortedBal.length % 2 ? sortedBal[Math.floor(sortedBal.length / 2)] : (sortedBal[sortedBal.length / 2 - 1] + sortedBal[sortedBal.length / 2]) / 2);
      const sumBal = balances.reduce((s, x) => s + x, 0);

      const activeWagerUsers = new Set(wagersD.filter((w: any) => !w.is_retracted).map((w: any) => w.user_id));
      const partUsers = new Set(partsD.map((p: any) => p.user_id));
      const active_users = new Set([...activeWagerUsers, ...partUsers]).size;

      const total_wagered_dc = wagersD.filter((w: any) => !w.is_retracted).reduce((s, w: any) => s + w.montant_dc, 0);
      const total_retracted_dc = wagersD.filter((w: any) => w.is_retracted).reduce((s, w: any) => s + w.montant_dc, 0);
      const total_retraction_count = wagersD.filter((w: any) => w.is_retracted).length;
      const total_gains_bruts_dc = soldeD.filter((s: any) => s.delta_dc > 0 && (s.reason ?? '').startsWith('Gain')).reduce((s, h: any) => s + h.delta_dc, 0);

      // Paris
      const countStatus = (st: string) => betsD.filter((b: any) => b.status === st).length;
      const bettorsByBet = new Map<string, Set<string>>();
      for (const w of wagersD) {
        if (w.is_retracted) continue;
        if (!bettorsByBet.has(w.bet_id)) bettorsByBet.set(w.bet_id, new Set());
        bettorsByBet.get(w.bet_id)!.add(w.user_id);
      }
      const total_unique_bettors = activeWagerUsers.size;
      const avg_bettors_per_bet = bettorsByBet.size === 0 ? 0 : Math.round([...bettorsByBet.values()].reduce((s, set) => s + set.size, 0) / bettorsByBet.size);

      // Jeux
      const gameTypes = ['sondage', 'tournoi', 'gouvernement', 'fantasy'];
      const jeux = gameTypes.map(gt => {
        const sessOfType = sessionsD.filter((s: any) => s.game_type === gt);
        const sessIds = new Set(sessOfType.map((s: any) => s.id));
        const partsOfType = partsD.filter((p: any) => sessIds.has(p.session_id));
        const uniqueParts = new Set(partsOfType.map((p: any) => p.user_id));
        const total_sessions = sessOfType.length;
        const unique_participants = uniqueParts.size;
        return {
          game_type: gt,
          total_sessions,
          active_sessions: sessOfType.filter((s: any) => s.status === 'active' || s.status === 'voting').length,
          total_submissions: partsOfType.length,
          unique_participants,
          avg_participants_per_session: total_sessions === 0 ? 0 : Math.round(unique_participants / total_sessions),
          participation_rate_pct: total_users === 0 ? 0 : Math.round(unique_participants / total_users * 100),
          users_not_participated: total_users - unique_participants,
        };
      });

      // Kiss/Marry
      const now = new Date();
      const current_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const votes_this_month = kmD.filter((v: any) => v.month_year === current_month).length;
      const estimated_voters_this_month = Math.round(votes_this_month / 4);

      // Non-participants
      const non_participants = [
        ...jeux.map(j => ({
          game: ({ sondage: 'Sondages', tournoi: 'Tournois', gouvernement: 'Gouvernement', fantasy: 'Fantasy Firm' } as any)[j.game_type],
          users_not_participated: j.users_not_participated,
          pct_not_participated: total_users === 0 ? 0 : Math.round(j.users_not_participated / total_users * 100),
        })),
        {
          game: 'Paris',
          users_not_participated: total_users - total_unique_bettors,
          pct_not_participated: total_users === 0 ? 0 : Math.round((total_users - total_unique_bettors) / total_users * 100),
        },
        {
          game: 'Kiss/Marry ce mois',
          users_not_participated: total_users - estimated_voters_this_month,
          pct_not_participated: total_users === 0 ? 0 : Math.round((total_users - estimated_voters_this_month) / total_users * 100),
        },
      ];

      // Timeline helper
      const groupByDay = (rows: any[], field: string, sumField?: string) => {
        const map: Record<string, number> = {};
        for (const r of rows) {
          const d = String(r[field]).slice(0, 10);
          map[d] = (map[d] ?? 0) + (sumField ? (r[sumField] ?? 0) : 1);
        }
        return map;
      };

      const report = {
        generated_at: new Date().toISOString(),
        global: {
          total_users,
          active_users,
          total_circulation_dc: sumBal,
          avg_balance_dc: total_users === 0 ? 0 : Math.round(sumBal / total_users),
          median_balance_dc,
          min_balance_dc: balances.length ? Math.min(...balances) : 0,
          max_balance_dc: balances.length ? Math.max(...balances) : 0,
          total_wagered_dc,
          total_retracted_dc,
          total_retraction_count,
          total_gains_bruts_dc,
        },
        paris: {
          open: countStatus('ouvert'),
          closed_pending: countStatus('cloture_en_attente'),
          resolved: countStatus('resolu'),
          suspended: countStatus('suspendu'),
          deleted: countStatus('supprime'),
          total_unique_bettors,
          pct_users_who_bet: total_users === 0 ? 0 : Math.round(total_unique_bettors / total_users * 100),
          avg_bettors_per_bet,
        },
        jeux,
        kiss_marry: {
          total_votes_all_time: kmD.length,
          current_month,
          votes_this_month,
          estimated_voters_this_month,
          participation_rate_pct: total_users === 0 ? 0 : Math.round(estimated_voters_this_month / total_users * 100),
          users_not_voted_this_month: total_users - estimated_voters_this_month,
        },
        engagement: {
          open_tickets: ticketsD.filter((t: any) => t.status === 'ouvert' || t.status === 'en_cours').length,
          pending_proposals: proposalsD.filter((p: any) => p.status === 'en_attente').length,
          total_gazette_messages: gazetteD.length,
          total_liquidity_injections: injectionsD.length,
        },
        non_participants,
        timeline: {
          users_by_day: groupByDay(profilesD, 'created_at'),
          wagers_by_day: groupByDay(wagersD, 'created_at', 'montant_dc'),
          participations_by_day: groupByDay(partsD, 'created_at'),
          bets_created_by_day: groupByDay(betsD, 'created_at'),
          gazette_messages_by_day: groupByDay(gazetteD, 'created_at'),
        },
      };

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daimbet-stats-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Statistiques exportées');
    } catch (err: any) {
      console.error('Export stats error:', err);
      toast.error("Échec de l'export des statistiques");
    } finally {
      setExportingStats(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* ══════ SIDEBAR ══════ */}
      <aside className={`fixed md:sticky top-16 left-0 z-40 w-60 h-[calc(100vh-4rem)] overflow-y-auto bg-card border-r border-border transition-transform duration-200 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="p-4 text-center border-b border-border">
          <Shield className="w-8 h-8 mx-auto text-primary mb-1" />
          <h1 className="text-lg font-display gold-text">Jordaim Belfort</h1>
          <p className="text-[10px] text-muted-foreground">Panneau d'administration</p>
        </div>

        {maintenanceMode && (
          <div className="mx-2 mt-2 rounded-lg bg-destructive/10 border border-destructive/30 p-2 text-center">
            <p className="text-[10px] font-semibold text-destructive">🚨 Mode maintenance actif</p>
          </div>
        )}

        <nav className="p-2 space-y-0.5">
          {ADMIN_SECTIONS.map(s => {
            const badge = sectionBadge(s.id);
            return (
              <button
                key={s.id}
                onClick={() => navigateTo(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-colors ${
                  activeSection === s.id
                    ? 'bg-primary/10 text-primary font-medium border border-primary/20'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <span className="text-base">{s.emoji}</span>
                <span className="flex-1 truncate">{s.label}</span>
                {badge > 0 && (
                  <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile hamburger */}
      <button
        className="md:hidden fixed top-[4.5rem] left-3 z-50 p-2 rounded-lg bg-card border border-border shadow-lg"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* ══════ MAIN CONTENT ══════ */}
      <main className="flex-1 p-4 md:p-8 max-w-5xl w-full overflow-x-hidden">
        {/* Section header */}
        <div className="mb-6 ml-10 md:ml-0">
          <h2 className="text-2xl font-display flex items-center gap-2">
            {ADMIN_SECTIONS.find(s => s.id === activeSection)?.emoji}{' '}
            {ADMIN_SECTIONS.find(s => s.id === activeSection)?.label}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {activeSection === 'dashboard' && 'Vue d\'ensemble de la plateforme.'}
            {activeSection === 'paris' && 'Créer, gérer et résoudre les paris.'}
            {activeSection === 'jeux' && 'Gérer les sondages, tournois et jeux de la promo.'}
            {activeSection === 'gouvernements' && 'Modérer les ministères personnalisés créés par les utilisateurs.'}
            {activeSection === 'gazette' && 'Modérer les messages de la Gazette.'}
            {activeSection === 'users' && 'Gérer les comptes, soldes et accès des joueurs.'}
            {activeSection === 'tickets' && 'Répondre aux tickets de support.'}
            {activeSection === 'contacts_publics' && 'Messages reçus via le portail public (utilisateurs hors plateforme).'}
            {activeSection === 'moderation' && 'Mots interdits, signalements et logs.'}
            {activeSection === 'urgence' && 'Suspension, réinitialisation et configuration d\'urgence.'}
            {activeSection === 'pipeline' && 'Propositions de la communauté.'}
            {activeSection === 'lexique' && 'Glossaire des termes DaimBet.'}
            {activeSection === 'exports' && 'Télécharger les données et envoyer des emails.'}
          </p>
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ DASHBOARD ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'dashboard' && (
          <div className="space-y-6">
            {/* Notifications */}
            {(() => {
              const unread = adminNotifications.filter(n => !n.is_read);
              return unread.length > 0 && (
                <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-display flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Notifications ({unread.length})</h3>
                    <Button variant="outline" size="sm" className="text-xs" onClick={async () => {
                      for (const n of unread) {
                        await supabase.from('admin_notifications').update({ is_read: true }).eq('id', n.id);
                      }
                      toast.success('Toutes les notifications marquées comme lues');
                      fetchAll();
                    }}>Tout marquer comme lu</Button>
                  </div>
                  {unread.slice(0, 10).map((n: any) => (
                    <div key={n.id} className="flex items-start gap-3 p-2 rounded-lg bg-secondary/50 text-xs">
                      <span className="shrink-0">{n.type === 'proposal' ? '🗳️' : n.type === 'flag' ? '🚩' : n.type === 'ticket' ? '🎫' : n.type === 'contact' ? '✉️' : n.type === 'report' ? '🚩' : '🔔'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{n.title}</p>
                        {n.detail && <p className="text-muted-foreground">{n.detail}</p>}
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap">{new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Utilisateurs actifs', value: totalUsers, emoji: '👥' },
                { label: 'Paris en cours', value: activeBetsCount, emoji: '🎯' },
                { label: 'DC en circulation', value: `${totalDcCirculation}`, emoji: '💰' },
                { label: 'Parieurs actifs (mois)', value: activeBettors, emoji: '🔥' },
                { label: 'Mises ce mois', value: wagersThisMonth, emoji: '📅' },
                { label: 'Volume total', value: `${totalPoolAllTime} DC`, emoji: '📈' },
                { label: 'Mise moyenne', value: `${avgWagerSize} DC`, emoji: '🎰' },
                { label: 'Propositions', value: adminProposals.filter(p => p.status === 'en_attente').length, emoji: '🗳️' },
              ].map(stat => (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-3 card-glow text-center">
                  <p className="text-xl mb-0.5">{stat.emoji}</p>
                  <p className="text-xl font-display text-primary">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-display mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Mises par mois</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(() => {
                    const monthly: Record<string, { mises: number; volume: number }> = {};
                    allWagers.filter(w => !w.is_retracted).forEach(w => {
                      const d = new Date(w.created_at);
                      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                      if (!monthly[key]) monthly[key] = { mises: 0, volume: 0 };
                      monthly[key].mises++;
                      monthly[key].volume += w.montant_dc;
                    });
                    return Object.entries(monthly).sort().map(([m, d]) => ({ month: m, ...d }));
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 20%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(220 18% 11%)', border: '1px solid hsl(220 15% 20%)', borderRadius: '8px', fontSize: '12px' }} />
                    <Bar dataKey="mises" fill="hsl(42 92% 55%)" radius={[4, 4, 0, 0]} name="Mises" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-display mb-3 flex items-center gap-2"><Coins className="w-4 h-4 text-primary" /> Volume DC par mois</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(() => {
                    const monthly: Record<string, number> = {};
                    allWagers.filter(w => !w.is_retracted).forEach(w => {
                      const d = new Date(w.created_at);
                      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                      monthly[key] = (monthly[key] || 0) + w.montant_dc;
                    });
                    return Object.entries(monthly).sort().map(([m, v]) => ({ month: m, volume: v }));
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 20%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(220 18% 11%)', border: '1px solid hsl(220 15% 20%)', borderRadius: '8px', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="volume" stroke="hsl(42 92% 55%)" strokeWidth={2} dot={{ fill: 'hsl(42 92% 55%)', r: 4 }} name="Volume DC" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-display mb-3">🗳️ Propositions Daim-ocratie</h3>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'En attente', value: adminProposals.filter(p => p.status === 'en_attente').length },
                          { name: 'Validées', value: adminProposals.filter(p => p.status === 'valide').length },
                          { name: 'Rejetées', value: adminProposals.filter(p => p.status === 'rejete').length },
                        ].filter(d => d.value > 0)}
                        cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        <Cell fill="hsl(42 92% 55%)" />
                        <Cell fill="hsl(142 71% 45%)" />
                        <Cell fill="hsl(0 72% 51%)" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-display mb-3">🏆 Top parieurs (volume misé)</h3>
                <div className="space-y-2">
                  {(() => {
                    const userVolumes: Record<string, number> = {};
                    allWagers.filter(w => !w.is_retracted).forEach(w => {
                      userVolumes[w.user_id] = (userVolumes[w.user_id] || 0) + w.montant_dc;
                    });
                    return Object.entries(userVolumes)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([uid, vol], i) => {
                        const p = profiles.find(pr => pr.user_id === uid);
                        return (
                          <div key={uid} className="flex items-center justify-between text-xs p-2 rounded-lg bg-secondary/50">
                            <span className="font-medium">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} {p?.display_name || 'Anonyme'}</span>
                            <span className="text-primary font-bold">{vol} DC</span>
                          </div>
                        );
                      });
                  })()}
                </div>
              </div>
            </div>

            {/* 💰 Économie DC */}
            {(() => {
              const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
              const wagersThisWeek = allWagers.filter(w => !w.is_retracted && new Date(w.created_at) >= oneWeekAgo);
              const dcSpentWeek = wagersThisWeek.reduce((s, w) => s + w.montant_dc, 0);
              // Gains distributed this week: approximate from winning wagers (cote * montant - montant) * 0.95
              // We don't have solde_history loaded, so we estimate from resolved bets this week
              const resolvedBetsWeek = bets.filter(b => b.status === 'resolu' && new Date(b.updated_at) >= oneWeekAgo);
              const resolvedBetIds = new Set(resolvedBetsWeek.map(b => b.id));
              const winningWagersWeek = allWagers.filter(w => !w.is_retracted && resolvedBetIds.has(w.bet_id) && (() => {
                const bet = bets.find(b => b.id === w.bet_id);
                if (!bet) return false;
                const winOpt = bet.bet_options?.find(o => o.id === w.option_id && o.is_winner);
                return !!winOpt;
              })());
              const dcDistributedWeek = winningWagersWeek.reduce((s, w) => {
                const opt = bets.find(b => b.id === w.bet_id)?.bet_options?.find(o => o.id === w.option_id);
                if (!opt) return s;
                const gross = Math.round(w.montant_dc * opt.cote_actuelle);
                const rake = Math.max(0, Math.round((gross - w.montant_dc) * 0.05));
                return s + (gross - rake);
              }, 0);
              const ratio = dcSpentWeek > 0 ? (dcDistributedWeek / dcSpentWeek).toFixed(2) : '—';
              return (
                <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
                  <h3 className="text-sm font-display flex items-center gap-2"><Coins className="w-4 h-4 text-primary" /> 💰 Économie DC</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center p-2 rounded-lg bg-secondary/50">
                      <p className="text-lg font-display text-primary">{totalDcCirculation.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">DC en circulation</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-secondary/50">
                      <p className="text-lg font-display text-primary">{dcDistributedWeek.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">DC distribués (7j)</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-secondary/50">
                      <p className="text-lg font-display text-primary">{dcSpentWeek.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">DC misés (7j)</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-secondary/50">
                      <p className="text-lg font-display text-primary">{ratio}</p>
                      <p className="text-[10px] text-muted-foreground">Ratio entrées/sorties</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">
                    Note : le rake (5 %) ne s'applique qu'aux paris classiques. Les sondages et jeux n'ont pas de rake.
                  </p>
                </div>
              );
            })()}

            {/* Quick actions */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-display mb-3">⚡ Accès rapide</h3>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => navigateTo('paris')}><Plus className="w-3 h-3 mr-1" /> Créer un pari</Button>
                <Button variant="outline" size="sm" onClick={() => navigateTo('tickets')}><Ticket className="w-3 h-3 mr-1" /> Tickets ({openTicketsCount})</Button>
                <Button variant="outline" size="sm" onClick={() => navigateTo('gazette')}><MessageSquare className="w-3 h-3 mr-1" /> Gazette ({flaggedGazetteCount})</Button>
                <Button variant="outline" size="sm" onClick={() => navigateTo('pipeline')}><Vote className="w-3 h-3 mr-1" /> Pipeline</Button>
                <Button variant="outline" size="sm" onClick={handleExportStats} disabled={exportingStats}>
                  {exportingStats ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Calcul en cours…</> : <>📊 Exporter les statistiques</>}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ PARIS ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'paris' && (
          <Tabs defaultValue="create" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 bg-secondary">
              <TabsTrigger value="create" className="font-display text-xs"><Plus className="w-4 h-4 mr-1" /> Créer</TabsTrigger>
              <TabsTrigger value="manage" className="font-display text-xs"><CheckCircle className="w-4 h-4 mr-1" /> Gérer ({manageBets.length})</TabsTrigger>
              <TabsTrigger value="archive" className="font-display text-xs"><History className="w-4 h-4 mr-1" /> Archives</TabsTrigger>
            </TabsList>

            {/* CREATE */}
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

            {/* MANAGE */}
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
                                  <div key={opt.id} className="flex items-center gap-1">
                                    <button type="button"
                                      onClick={() => toggleWinner(bet.id, opt.id, bet.max_winners)}
                                      className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
                                        isSelected ? 'border-primary bg-primary/20 text-primary font-bold' : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/30'
                                      }`}>
                                      <Trophy className="w-3 h-3 inline mr-1" />
                                      {opt.label} (x{odds} · {optPool} DC)
                                    </button>
                                    <button type="button" title="Supprimer cette option"
                                      onClick={async () => {
                                        const motif = prompt('Motif de suppression de cette option :');
                                        if (!motif) return;
                                        setDeleteOptionLoading(true);
                                        const { data, error } = await supabase.functions.invoke('delete-bet-option', {
                                          body: { option_id: opt.id, motif },
                                        });
                                        setDeleteOptionLoading(false);
                                        if (error || data?.error) {
                                          toast.error(data?.error || 'Erreur');
                                        } else {
                                          toast.success(`Option "${opt.label}" supprimée. ${data?.refunded_count || 0} mise(s) remboursée(s).`);
                                          fetchAll();
                                        }
                                      }}
                                      className="text-destructive hover:bg-destructive/10 p-1 rounded">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
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

              {/* ─── TIERCE SUGGESTIONS ─── */}
              {tierceSuggestions.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-4 mt-6">
                  <h3 className="text-lg font-display flex items-center gap-2">
                    🏇 Suggestions Tiercé en attente
                    <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">{tierceSuggestions.length}</span>
                  </h3>
                  {(() => {
                    // Group by bet_id
                    const grouped: Record<string, any[]> = {};
                    tierceSuggestions.forEach((s: any) => {
                      if (!grouped[s.bet_id]) grouped[s.bet_id] = [];
                      grouped[s.bet_id].push(s);
                    });
                    return Object.entries(grouped).map(([betId, suggestions]) => {
                      const bet = bets.find(b => b.id === betId);
                      return (
                        <div key={betId} className="space-y-2">
                          <p className="text-sm font-semibold text-muted-foreground">{bet?.emoji} {bet?.title || 'Pari inconnu'}</p>
                          <p className="text-[10px] text-muted-foreground">{bet?.bet_options.length || 0}/20 options actuelles</p>
                          {suggestions.map((s: any) => (
                            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border/50">
                              <div>
                                <p className="text-sm font-medium">{s.prenom_suggested}</p>
                                {s.comment && <p className="text-xs text-muted-foreground">{s.comment}</p>}
                                <p className="text-[10px] text-muted-foreground">
                                  Par {suggestionProfiles[s.suggested_by] || '?'} · {new Date(s.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="text-green-500 border-green-500/30 hover:bg-green-500/10"
                                  onClick={async () => {
                                    const currentBet = bets.find(b => b.id === betId);
                                    if (currentBet && currentBet.bet_options.length >= 20) {
                                      toast.error('Ce pari a déjà 20 options — impossible d\'en ajouter.');
                                      return;
                                    }
                                    // Add option to bet
                                    await supabase.from('bet_options').insert({
                                      bet_id: betId,
                                      label: s.prenom_suggested,
                                      cote_actuelle: 1.10,
                                    });
                                    // Update suggestion status
                                    await supabase.from('tierce_suggestions').update({ status: 'approuve' as any }).eq('id', s.id);
                                    toast.success(`✅ ${s.prenom_suggested} ajouté au pari`);
                                    fetchAll();
                                  }}>
                                  ✅ Approuver
                                </Button>
                                <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                  onClick={async () => {
                                    await supabase.from('tierce_suggestions').update({ status: 'rejete' as any }).eq('id', s.id);
                                    toast.success('Suggestion rejetée');
                                    logModerationAction({
                                      action_type: 'rejet',
                                      target_type: 'pari',
                                      target_id: s.bet_id,
                                      description: `Suggestion Tiercé rejetée : "${s.prenom_suggested}"`,
                                    });
                                    fetchAll();
                                  }}>
                                  ❌ Rejeter
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </TabsContent>
            <TabsContent value="archive">
              <div className="space-y-4">
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
          </Tabs>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ JEUX ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'jeux' && (
          <Tabs defaultValue="sessions" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 bg-secondary">
              <TabsTrigger value="sessions" className="font-display text-xs"><Sparkles className="w-4 h-4 mr-1" /> Sessions</TabsTrigger>
              <TabsTrigger value="sondages" className="font-display text-xs">🗳️ Sondages</TabsTrigger>
              <TabsTrigger value="tournois" className="font-display text-xs">⚔️ Tournois</TabsTrigger>
            </TabsList>
            <TabsContent value="sessions"><AdminGameSessions /></TabsContent>
            <TabsContent value="sondages"><AdminSondages /></TabsContent>
            <TabsContent value="tournois"><AdminTournois /></TabsContent>
          </Tabs>
        )}

        {activeSection === 'jeux_dc' && <AdminDailyContent />}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ GOUVERNEMENTS ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'gouvernements' && <AdminGouvernements />}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ GAZETTE ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'gazette' && (
          <div className="space-y-6">
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
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ USERS ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
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

            {injections.length > 0 && (
              <div className="bg-secondary/50 border border-border rounded-xl p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><img src={daimcoinLogo} alt="" className="w-3.5 h-3.5 rounded-full" />Historique des injections</p>
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

            {sortedProfiles.map((p, i) => {
              const userWagers = allWagers.filter(w => w.user_id === p.user_id && !w.is_retracted);
              return (
                <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                  className={`flex items-center gap-4 p-4 rounded-xl border bg-card cursor-pointer hover:border-primary/30 transition-colors ${p.is_suspended ? 'border-destructive/30 opacity-60' : 'border-border'}`}
                  onClick={() => { setSelectedUser(p); setBalanceDelta(''); setBalanceMotif(''); }}>
                  <span className="text-sm text-muted-foreground w-8">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{p.emoji || '🦌'} {p.display_name || 'Anonyme'}</span>
                      {p.is_suspended && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">Suspendu</span>}
                      {(p as any).visible_in_sondages === false && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded" title="L'utilisateur a choisi de ne pas apparaître dans les sondages">🙈 Sondages</span>
                      )}
                      {(p as any).visible_in_kiss_marry === false && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded" title="L'utilisateur a choisi de ne pas apparaître dans Kiss/Marry">🙈 Kiss/Marry</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      📧 {userEmails[p.user_id] || '—'} · {userWagers.length} mises · Inscrit le {new Date(p.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-display text-primary font-bold">{p.balance}</span>
                    <img src={daimcoinLogo} alt="" className="w-5 h-5 rounded-full" />
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <AdminCreateTicketDialog
                      targetUserId={p.user_id}
                      targetUserName={p.display_name || 'Utilisateur'}
                      iconOnly
                      onCreated={fetchAll}
                    />
                  </div>
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ TICKETS ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'tickets' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground">Double-clic pour supprimer</span>
              </div>
              <div className="flex items-center gap-2">
                <select value={ticketSortBy} onChange={e => setTicketSortBy(e.target.value as any)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                  <option value="date">📅 Par date</option>
                  <option value="status">🔄 Par statut</option>
                  <option value="name">🔤 Par nom</option>
                </select>
              </div>
            </div>

            {/* New: pick a user to start a conversation with */}
            {!activeAdminTicketId && (
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground mb-2">📩 Démarrer une conversation avec un utilisateur :</p>
                <div className="flex flex-wrap gap-2">
                  {[...profiles]
                    .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''))
                    .map(p => (
                      <AdminCreateTicketDialog
                        key={p.user_id}
                        targetUserId={p.user_id}
                        targetUserName={p.display_name || 'Utilisateur'}
                        buttonLabel={`${p.emoji || '🦌'} ${p.display_name || 'Anonyme'}`}
                        buttonVariant="outline"
                        onCreated={fetchAll}
                      />
                    ))}
                </div>
              </div>
            )}

            {activeAdminTicketId ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <TicketThread
                  ticketId={activeAdminTicketId}
                  subject={adminTickets.find(t => t.id === activeAdminTicketId)?.subject || ''}
                  status={adminTickets.find(t => t.id === activeAdminTicketId)?.status || 'ouvert'}
                  isAdmin
                  onBack={() => { setActiveAdminTicketId(null); fetchAll(); }}
                  onStatusChange={fetchAll}
                />
              </div>
            ) : (
              <>
                {adminTickets.length === 0 && <p className="text-muted-foreground text-center py-8">Aucun ticket.</p>}
                {[...adminTickets].sort((a, b) => {
                  if (ticketSortBy === 'status') {
                    const order: Record<string, number> = { ouvert: 0, en_cours: 1, resolu: 2 };
                    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
                  }
                  if (ticketSortBy === 'name') {
                    const na = profiles.find(p => p.user_id === a.user_id)?.display_name || '';
                    const nb = profiles.find(p => p.user_id === b.user_id)?.display_name || '';
                    return na.localeCompare(nb);
                  }
                  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                }).map(t => {
                  const userName = profiles.find(p => p.user_id === t.user_id)?.display_name || 'Inconnu';
                  const statusColors: Record<string, string> = {
                    ouvert: 'bg-primary/10 text-primary',
                    en_cours: 'bg-yellow-500/10 text-yellow-600',
                    resolu: 'bg-muted text-muted-foreground',
                  };
                  return (
                    <div key={t.id} onClick={() => setActiveAdminTicketId(t.id)}
                      onDoubleClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Supprimer définitivement le ticket "${t.subject}" ?`)) return;
                        await supabase.from('ticket_messages').delete().eq('ticket_id', t.id);
                        await supabase.from('tickets').delete().eq('id', t.id);
                        toast.success('Ticket supprimé');
                        fetchAll();
                      }}
                      className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card cursor-pointer hover:border-primary/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{t.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {userName} · {new Date(t.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[t.status] || ''}`}>
                        {t.status === 'ouvert' ? '🟢 Ouvert' : t.status === 'en_cours' ? '🟡 En cours' : '✅ Résolu'}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ MODERATION ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'moderation' && <AdminModeration />}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ URGENCE ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'urgence' && (
          <div className="space-y-6">
            {/* Platform suspension */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-display">Suspension de la plateforme</h3>
              <p className="text-xs text-muted-foreground">
                {maintenanceMode
                  ? '🔴 La plateforme est actuellement suspendue. Les utilisateurs voient un écran de maintenance.'
                  : '🟢 La plateforme est active et accessible à tous les utilisateurs.'}
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant={maintenanceMode ? 'default' : 'outline'} className={maintenanceMode ? '' : 'text-destructive border-destructive/30'}>
                    {maintenanceMode ? <><Play className="w-4 h-4 mr-2" /> Réactiver la plateforme</> : <><Pause className="w-4 h-4 mr-2" /> Suspendre la plateforme</>}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-display">
                      {maintenanceMode ? '▶️ Réactiver la plateforme ?' : '⏸️ Suspendre la plateforme ?'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {maintenanceMode
                        ? 'La plateforme redeviendra accessible à tous les utilisateurs immédiatement.'
                        : 'Tous les utilisateurs verront un écran de maintenance. Seul le portail admin restera accessible via /admin/login.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => {
                      const newVal = maintenanceMode ? 'false' : 'true';
                      await supabase.from('platform_settings').update({ value: newVal, updated_at: new Date().toISOString() }).eq('key', 'maintenance_mode');
                      if (newVal === 'true') {
                        await supabase.from('gazette_messages').insert({ content: '🔧 DaimBet est temporairement en maintenance. On revient vite ! 🦌', is_system_message: true });
                      } else {
                        await supabase.from('gazette_messages').insert({ content: '🟢 DaimBet est de retour ! Les paris sont ouverts 🔥', is_system_message: true });
                      }
                      toast.success(newVal === 'true' ? 'Plateforme suspendue ⏸️' : 'Plateforme réactivée ▶️');
                      fetchAll();
                    }} className={maintenanceMode ? 'gold-gradient' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}>
                      {maintenanceMode ? 'Réactiver' : 'Suspendre'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Tab configuration */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-display flex items-center gap-2"><Eye className="w-4 h-4 text-primary" /> Configuration des onglets</h3>
              <div className="space-y-3">
                {[
                  { key: 'paris', label: '🎯 Paris', maskable: false, tooltip: 'Onglet obligatoire' },
                  { key: 'gazette', label: '📰 Gazette', maskable: false, tooltip: 'Non masquable — canal de communication système' },
                  { key: 'classement', label: '🏆 Classement', maskable: true },
                  { key: 'jeux', label: '🎮 Jeux', maskable: true },
                  { key: 'profil', label: '👤 Profil', maskable: false, tooltip: 'Onglet obligatoire' },
                ].map((tab) => (
                  <div key={tab.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50 border border-border/50">
                    <span className="text-sm">{tab.label}</span>
                    <div className="flex items-center gap-2">
                      {!tab.maskable && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{tab.tooltip}</span>
                      )}
                      <Switch
                        checked={tab.maskable ? navConfig[tab.key] !== false : true}
                        disabled={!tab.maskable}
                        onCheckedChange={async (checked) => {
                          if (!tab.maskable) return;
                          await supabase.from('nav_config').update({ is_visible: checked, updated_at: new Date().toISOString() }).eq('tab_key', tab.key);
                          setNavConfig(prev => ({ ...prev, [tab.key]: checked }));
                          toast.success(`Onglet ${tab.label} ${checked ? 'activé' : 'masqué'}`);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Emergency per-game suspension */}
            <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-5 space-y-4">
              <h3 className="text-sm font-display flex items-center gap-2 text-destructive">🚨 Suspension par jeu (legacy)</h3>
              <p className="text-xs text-muted-foreground">Suspendre ou réactiver instantanément un jeu ou les paris. Aucune donnée n'est supprimée.</p>
              <div className="space-y-2">
                {[
                  { key: 'suspend_paris', label: '🎯 Paris' },
                  { key: 'suspend_kiss-marry', label: '💋 Kiss/Marry' },
                  { key: 'suspend_daimocratie', label: '🗳️ Daimocratie' },
                  { key: 'suspend_you-decide', label: '⚔️ You Decide' },
                  { key: 'suspend_gouvernement', label: '🏛️ Gouvernement' },
                  { key: 'suspend_fantasy-firm', label: '⚖️ Fantasy Firm' },
                ].map(item => {
                  const isSuspended = !!suspensionStatus[item.key];
                  const gameId = item.key.replace('suspend_', '');
                  const hideKey = `hide_${gameId}`;
                  const isHidden = !!hideStatus[hideKey];
                  const isParis = gameId === 'paris';
                  return (
                    <div key={item.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-card border border-border/50 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${isSuspended ? 'bg-destructive' : 'bg-primary'}`} />
                        <span className="text-sm">{item.label}</span>
                        {isSuspended && <span className="text-[10px] text-destructive font-medium">SUSPENDU</span>}
                        {isHidden && <span className="text-[10px] text-muted-foreground font-medium">CACHÉ</span>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button size="sm" variant={isSuspended ? 'outline' : 'destructive'} className="text-xs h-7"
                          onClick={async () => {
                            const newVal = isSuspended ? 'false' : 'true';
                            const { data: existing } = await supabase.from('platform_settings').select('id').eq('key', item.key).maybeSingle();
                            if (existing) {
                              await supabase.from('platform_settings').update({ value: newVal, updated_at: new Date().toISOString() }).eq('key', item.key);
                            } else {
                              await supabase.from('platform_settings').insert({ key: item.key, value: newVal });
                            }
                            setSuspensionStatus(prev => ({ ...prev, [item.key]: !isSuspended }));
                            toast.success(`${item.label} ${isSuspended ? 'réactivé ✅' : 'suspendu 🚨'}`);
                          }}>
                          {isSuspended ? <><Play className="w-3 h-3 mr-1" /> Activer</> : <><Pause className="w-3 h-3 mr-1" /> Suspendre</>}
                        </Button>
                        {!isParis && (
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={async () => {
                              const newVal = isHidden ? 'false' : 'true';
                              const { data: existing } = await supabase.from('platform_settings').select('id').eq('key', hideKey).maybeSingle();
                              if (existing) {
                                await supabase.from('platform_settings').update({ value: newVal, updated_at: new Date().toISOString() }).eq('key', hideKey);
                              } else {
                                await supabase.from('platform_settings').insert({ key: hideKey, value: newVal });
                              }
                              setHideStatus(prev => ({ ...prev, [hideKey]: !isHidden }));
                              toast.success(`${item.label} ${isHidden ? 'visible 👁️' : 'caché 🙈'}`);
                            }}>
                            {isHidden ? <><Eye className="w-3 h-3 mr-1" /> Afficher</> : <><EyeOff className="w-3 h-3 mr-1" /> Cacher</>}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="text-xs h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => { setTabResetTarget(item.key.replace('suspend_', '')); setTabResetConfirm(''); }}>
                          🔴 Réinitialiser
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* NEW game_status panel */}
            <AdminGameStatusPanel />

            {/* Game subtitles */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-display flex items-center gap-2">🎮 Sous-titres des jeux</h3>
              <p className="text-xs text-muted-foreground">Modifie les sous-titres affichés sous chaque jeu dans l'onglet Jeux.</p>
              <div className="space-y-3">
                {[
                  { key: 'game_subtitle_daimocratie', label: '🗳️ Daimocratie' },
                  { key: 'game_subtitle_you_decide', label: '⚔️ Tournois' },
                  { key: 'game_subtitle_gouvernement', label: '🏛️ Gouvernement' },
                  { key: 'game_subtitle_fantasy_firm', label: '⚖️ Fantasy Firm' },
                  { key: 'game_subtitle_kiss_marry', label: '💋 Kiss/Marry' },
                ].map(g => (
                  <div key={g.key} className="flex items-center gap-3">
                    <span className="text-sm w-40 flex-shrink-0">{g.label}</span>
                    <Input
                      value={gameSubtitles[g.key] ?? ''}
                      onChange={e => setGameSubtitles(prev => ({ ...prev, [g.key]: e.target.value }))}
                      placeholder="Sous-titre..."
                      className="text-xs flex-1"
                    />
                    <Button size="sm" variant="outline" onClick={async () => {
                      const val = gameSubtitles[g.key] ?? '';
                      const { data: existing } = await supabase.from('platform_settings').select('id').eq('key', g.key).maybeSingle();
                      if (existing) {
                        await supabase.from('platform_settings').update({ value: val, updated_at: new Date().toISOString() }).eq('key', g.key);
                      } else {
                        await supabase.from('platform_settings').insert({ key: g.key, value: val });
                      }
                      toast.success('Sous-titre mis à jour');
                    }}>Sauver</Button>
                  </div>
                ))}
              </div>
            </div>

            {/* KM categories */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-display flex items-center gap-2">💋 Catégories Kiss/Marry</h3>
              <p className="text-xs text-muted-foreground">Affiche ou cache les catégories sensibles pour tous les utilisateurs.</p>
              {[
                { key: 'km_show_coup_soir', label: "🌙 Coup d'un soir", value: kmShowCoupSoir, setter: setKmShowCoupSoir },
                { key: 'km_show_plan_q', label: '🔥 Plan Q', value: kmShowPlanQ, setter: setKmShowPlanQ },
              ].map(cat => (
                <div key={cat.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50 border border-border/50">
                  <span className="text-sm">{cat.label}</span>
                  <Switch
                    checked={cat.value}
                    onCheckedChange={async (checked) => {
                      const { data: existing } = await supabase.from('platform_settings').select('id').eq('key', cat.key).maybeSingle();
                      if (existing) {
                        await supabase.from('platform_settings').update({ value: checked ? 'true' : 'false', updated_at: new Date().toISOString() }).eq('key', cat.key);
                      } else {
                        await supabase.from('platform_settings').insert({ key: cat.key, value: checked ? 'true' : 'false' });
                      }
                      cat.setter(checked);
                      toast.success(`Catégorie ${cat.label} ${checked ? 'affichée' : 'cachée'}`);
                    }}
                  />
                </div>
              ))}
            </div>

            {/* KM Reveal */}
            <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-pink-500/10 to-violet-500/10 p-5 space-y-4">
              <h3 className="text-lg font-display flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> 💋 Révélation Kiss/Marry</h3>
              <p className="text-sm text-muted-foreground">
                Dévoile le Top 3 de chaque catégorie à tous les utilisateurs. <strong>Action visible par tous.</strong>
              </p>
              {kmRevealStep === 0 && (() => {
                const now = new Date();
                const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                return (
                  <div className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full border-primary/50 text-primary hover:bg-primary/10 h-12 text-base"
                      onClick={() => setKmRevealStep(1)}
                    >
                      <Sparkles className="w-4 h-4 mr-2" /> Activer la révélation 🏆
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted-foreground"
                      onClick={async () => {
                        await supabase.from('platform_settings').update({ value: 'false', updated_at: new Date().toISOString() }).eq('key', `km_reveal_${monthYear}`);
                        toast.success('Révélation désactivée');
                      }}
                    >
                      Désactiver la révélation en cours
                    </Button>
                  </div>
                );
              })()}

              {kmRevealStep === 1 && (
                <div className="space-y-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
                  <p className="text-sm font-semibold text-destructive">⚠️ Étape 1/3 — Es-tu sûr ?</p>
                  <p className="text-xs text-muted-foreground">Les résultats seront visibles par <strong>tous les utilisateurs</strong> immédiatement.</p>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setKmRevealStep(0)}>Annuler</Button>
                    <Button variant="outline" className="border-destructive/50 text-destructive" onClick={() => setKmRevealStep(2)}>Continuer →</Button>
                  </div>
                </div>
              )}

              {kmRevealStep === 2 && (() => {
                const now = new Date();
                const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                return (
                  <div className="space-y-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                    <p className="text-sm font-semibold text-amber-500">⚠️ Étape 2/3 — Confirmation</p>
                    <p className="text-xs text-muted-foreground">Les utilisateurs verront les résultats du mois <strong>{monthYear}</strong>.</p>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setKmRevealStep(0)}>Annuler</Button>
                      <Button variant="outline" className="border-amber-500/50 text-amber-500" onClick={() => setKmRevealStep(3)}>Continuer →</Button>
                    </div>
                  </div>
                );
              })()}

              {kmRevealStep === 3 && (() => {
                const now = new Date();
                const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                return (
                  <div className="space-y-3 p-4 rounded-xl bg-primary/20 border border-primary/40">
                    <p className="text-sm font-semibold text-primary">🏆 Étape 3/3 — Validation finale</p>
                    <p className="text-xs text-muted-foreground">Clique sur le bouton ci-dessous pour révéler les résultats à tout le monde.</p>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setKmRevealStep(0)}>Annuler</Button>
                      <Button
                        className="gold-gradient font-semibold"
                        onClick={async () => {
                          const { data: existing } = await supabase.from('platform_settings').select('id').eq('key', `km_reveal_${monthYear}`).maybeSingle();
                          if (existing) {
                            await supabase.from('platform_settings').update({ value: 'true', updated_at: new Date().toISOString() }).eq('key', `km_reveal_${monthYear}`);
                          } else {
                            await supabase.from('platform_settings').insert({ key: `km_reveal_${monthYear}`, value: 'true' });
                          }
                          toast.success('🏆 Révélation Kiss/Marry activée pour tous !');
                          setKmRevealStep(0);
                        }}
                      >
                        <Sparkles className="w-4 h-4 mr-2" /> RÉVÉLER LES RÉSULTATS 🏆
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* KM Full Results (admin-only) */}
            <AdminKmFullResults />

            {/* Retraction config */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-display flex items-center gap-2"><RefreshCw className="w-4 h-4 text-primary" /> Option de rétractation</h3>
              <p className="text-xs text-muted-foreground">
                Plage horaire actuelle : <span className="font-semibold text-foreground">{String(retractionStart).padStart(2, '0')}h00 → {String(retractionEnd).padStart(2, '0')}h00 CET</span>
              </p>
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Début</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={retractionStart}
                    onChange={e => setRetractionStart(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="h-9"
                  />
                </div>
                <span className="text-muted-foreground mt-5">→</span>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Fin</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={retractionEnd}
                    onChange={e => setRetractionEnd(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="h-9"
                  />
                </div>
              </div>
              <Button
                disabled={retractionSaving || retractionStart === retractionEnd}
                onClick={async () => {
                  if (retractionStart === retractionEnd) {
                    toast.error('L\'heure de début et de fin ne peuvent pas être identiques');
                    return;
                  }
                  setRetractionSaving(true);
                  await supabase.from('retraction_config').update({
                    start_hour: retractionStart,
                    end_hour: retractionEnd,
                    updated_at: new Date().toISOString(),
                  }).eq('id', (await supabase.from('retraction_config').select('id').limit(1).single()).data?.id || '');
                  await supabase.from('gazette_messages').insert({
                    content: `⏰ La fenêtre d'annulation des mises est désormais de ${String(retractionStart).padStart(2, '0')}h00 à ${String(retractionEnd).padStart(2, '0')}h00 CET.`,
                    is_system_message: true,
                  });
                  toast.success('Plage de rétractation mise à jour');
                  setRetractionSaving(false);
                  fetchAll();
                }}
                className="w-full"
              >
                {retractionSaving ? 'Enregistrement...' : 'Enregistrer la nouvelle plage'}
              </Button>
              {retractionStart === retractionEnd && (
                <p className="text-xs text-destructive">⚠️ L'heure de début et de fin ne peuvent pas être identiques.</p>
              )}
            </div>

            {/* Nuclear */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4 mt-12">
              <div className="flex items-center gap-3">
                <Bomb className="w-5 h-5 text-muted-foreground" />
                <div>
                  <h3 className="text-sm font-display text-muted-foreground">Réinitialisation totale</h3>
                  <p className="text-[10px] text-muted-foreground">Supprime TOUTES les données sauf le compte admin. Irréversible.</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-muted-foreground border-muted-foreground/20 hover:text-destructive hover:border-destructive/30"
                onClick={() => { setNuclearOpen(true); setNuclearStep(1); setNuclearCheck1(false); setNuclearPhrase(''); setNuclearReportSent(false); setNuclearReportCheck(false); setNuclearCountdown(10); setNuclearCountdownDone(false); setNuclearDone(false); setNuclearReportError(''); }}>
                Bouton nucléaire ☢️
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ PIPELINE ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'pipeline' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Toutes les propositions de la communauté (paris, sondages, tournois, simulations, Kiss/Marry).
              Validation auto à 10 👍 et &lt; 3 👎, ou manuelle ci-dessous.
            </p>
            {adminProposals.length === 0 && (
              <p className="text-muted-foreground text-center py-8">Aucune proposition.</p>
            )}
            {adminProposals.map(prop => {
              const kind = ((prop as any).proposal_kind as string) || 'bet';
              const kindEmoji: Record<string, string> = { bet: '🎯', sondage: '📊', tournoi: '⚔️', gouvernement: '🏛️', fantasy: '⚖️', kiss_marry: '💋' };
              return (
                <div key={prop.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary">{kindEmoji[kind] || '📋'} {kind}</span>
                        <span className="text-[10px] text-muted-foreground">
                          👍 {prop.votes_positive} · 👎 {prop.votes_negative}
                        </span>
                      </div>
                      <h3 className="font-semibold">{prop.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        Par {proposalProfiles[prop.user_id] || 'Inconnu'} · {new Date(prop.created_at).toLocaleDateString('fr-FR')}
                      </p>
                      {prop.type && <p className="text-xs text-muted-foreground mt-0.5">{prop.type}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                      prop.status === 'valide' ? 'bg-primary/20 text-primary' :
                      prop.status === 'rejete' ? 'bg-destructive/20 text-destructive' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {prop.status === 'valide' ? '✅ Actif' : prop.status === 'rejete' ? '❌ Supprimé' : '⏳ En attente'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {prop.status === 'en_attente' && (
                      <Button size="sm" className="gold-gradient" onClick={async () => {
                        const { data, error } = await supabase.functions.invoke('activate-proposal', { body: { proposal_id: prop.id } });
                        if (error || (data as any)?.error) { toast.error((data as any)?.error || 'Erreur'); return; }
                        toast.success('Proposition validée et publiée ✅');
                        logModerationAction({
                          action_type: 'validation',
                          target_type: 'proposition',
                          target_id: prop.id,
                          description: `Proposition validée : "${prop.title}" (${prop.proposal_kind})`,
                        });
                        fetchAll();
                      }}>
                        <CheckCircle className="w-4 h-4 mr-1" /> Valider maintenant
                      </Button>
                    )}
                    {prop.status !== 'rejete' && (
                      <Button size="sm" variant="destructive" onClick={async () => {
                        await supabase.from('daimocratie_proposals').update({ status: 'rejete' as any }).eq('id', prop.id);
                        toast.success('Proposition rejetée ❌');
                        logModerationAction({
                          action_type: 'rejet',
                          target_type: 'proposition',
                          target_id: prop.id,
                          description: `Proposition rejetée : "${prop.title}" (${prop.proposal_kind})`,
                        });
                        fetchAll();
                      }}>
                        <Trash2 className="w-4 h-4 mr-1" /> Rejeter
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ LEXIQUE ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'lexique' && <AdminGlossary />}

        {activeSection === 'journal' && <AdminModerationLog />}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════ CONTACTS PUBLICS ═══════════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'contacts_publics' && <AdminPublicContacts />}

        {/* ═══════════════════════════════════════════════ */}
        {/* ═══════════════ EXPORTS ═══════════════ */}
        {/* ═══════════════════════════════════════════════ */}
        {activeSection === 'exports' && (
          <div className="space-y-6">
            {/* Report downloads */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-display mb-3 flex items-center gap-2"><Download className="w-4 h-4 text-primary" /> Télécharger le rapport</h3>
              <div className="flex flex-wrap gap-2">
                {(['week', 'month', 'all'] as const).map(period => (
                  <div key={period} className="flex gap-1">
                    <Button variant="outline" size="sm" className="text-xs" onClick={async () => {
                      toast.info('Génération du rapport JSON...');
                      const { data, error } = await supabase.functions.invoke('generate-report', { body: { period, format: 'json' } });
                      if (error) { toast.error('Erreur génération rapport'); return; }
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = `daimbet-${period}.json`; a.click();
                      URL.revokeObjectURL(url);
                      toast.success('Rapport téléchargé !');
                    }}>
                      <FileJson className="w-3 h-3 mr-1" /> {period === 'week' ? 'Semaine' : period === 'month' ? 'Mois' : 'Tout'} (JSON)
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs" onClick={async () => {
                      toast.info('Génération du rapport CSV...');
                      const resp = await supabase.functions.invoke('generate-report', { body: { period, format: 'csv' } });
                      if (resp.error) { toast.error('Erreur génération rapport'); return; }
                      const csvText = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
                      const blob = new Blob([csvText], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = `daimbet-${period}.csv`; a.click();
                      URL.revokeObjectURL(url);
                      toast.success('Rapport CSV téléchargé !');
                    }}>
                      <FileSpreadsheet className="w-3 h-3 mr-1" /> CSV
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Les rapports sont optimisés pour analyse IA — données structurées en JSON avec timestamps.</p>
            </div>

            {/* Email */}
            <div className={`rounded-xl border p-3 flex items-center justify-between ${emailTodayCount >= 80 ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-card'}`}>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Emails envoyés aujourd'hui</span>
              </div>
              <span className={`text-sm font-display font-bold ${emailTodayCount >= 80 ? 'text-destructive' : 'text-primary'}`}>
                {emailTodayCount} / 100
              </span>
            </div>
            {emailTodayCount >= 80 && (
              <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Attention : tu approches de la limite journalière Resend (100/jour).</p>
            )}

            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="text-lg font-display flex items-center gap-2"><Send className="w-4 h-4 text-primary" /> Composer un email</h2>

              {/* Recipients */}
              <div>
                <Label className="text-sm text-muted-foreground mb-1 block">Destinataire(s)</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {emailRecipients.map(r => (
                    <span key={r} className="inline-flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded-full">
                      {r}
                      <button type="button" onClick={() => setEmailRecipients(emailRecipients.filter(x => x !== r))} className="text-muted-foreground hover:text-destructive">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Email ou sélectionner ci-dessous" value={emailRecipientInput}
                    onChange={e => setEmailRecipientInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && emailRecipientInput.includes('@')) {
                        e.preventDefault();
                        if (!emailRecipients.includes(emailRecipientInput.trim())) {
                          setEmailRecipients([...emailRecipients, emailRecipientInput.trim()]);
                        }
                        setEmailRecipientInput('');
                      }
                    }}
                    className="flex-1 h-9 text-sm" />
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    if (emailRecipientInput.includes('@') && !emailRecipients.includes(emailRecipientInput.trim())) {
                      setEmailRecipients([...emailRecipients, emailRecipientInput.trim()]);
                      setEmailRecipientInput('');
                    }
                  }}>Ajouter</Button>
                </div>
                {/* Quick-add from registered users */}
                <div className="mt-2">
                  <p className="text-[10px] text-muted-foreground mb-1">Sélection rapide (utilisateurs inscrits) :</p>
                  <div className="flex flex-wrap gap-1">
                    <Button type="button" variant="outline" size="sm" className="text-[10px] h-6 text-primary border-primary/30" onClick={() => {
                      // We don't have emails from profiles directly
                      // Users registered with school emails
                      toast.info('Les emails des utilisateurs ne sont pas disponibles côté client. Utilise le champ de saisie.');
                    }}>
                      📋 Tous les inscrits
                    </Button>
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div>
                <Label className="text-sm text-muted-foreground mb-1 block">Objet</Label>
                <Input placeholder="Objet de l'email" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="h-9 text-sm" />
              </div>

              {/* Body */}
              <div>
                <Label className="text-sm text-muted-foreground mb-1 block">Corps du message</Label>
                <div className="flex gap-1 mb-1">
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                    onClick={() => setEmailBody(emailBody + '<b></b>')}>B</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2 italic"
                    onClick={() => setEmailBody(emailBody + '<i></i>')}>I</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                    onClick={() => setEmailBody(emailBody + '<ul><li></li></ul>')}>Liste</Button>
                </div>
                <Textarea placeholder="Corps de l'email (HTML basique supporté : <b>, <i>, <ul><li>)" value={emailBody}
                  onChange={e => setEmailBody(e.target.value)} rows={6} className="text-sm" />
              </div>

              {/* Send warning */}
              {emailRecipients.length > 0 && emailTodayCount + emailRecipients.length > 100 && (
                <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Attention : cet envoi porterait le total à {emailTodayCount + emailRecipients.length}/100 pour aujourd'hui. La limite Resend est de 100 emails/jour.</span>
                </div>
              )}

              <Button className="gold-gradient w-full h-11 font-semibold" disabled={emailSending || emailRecipients.length === 0 || !emailSubject.trim() || !emailBody.trim()}
                onClick={async () => {
                  setEmailSending(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('send-admin-email', {
                      body: {
                        recipients: emailRecipients,
                        subject: emailSubject.trim(),
                        body_html: emailBody,
                      },
                    });
                    if (error) { toast.error('Erreur envoi email'); setEmailSending(false); return; }
                    if (data?.error) { toast.error(data.error); setEmailSending(false); return; }
                    toast.success(`✅ ${data.sent} email(s) envoyé(s)${data.failed > 0 ? `, ${data.failed} échec(s)` : ''}`);
                    setEmailRecipients([]);
                    setEmailSubject('');
                    setEmailBody('');
                    fetchAll();
                  } catch {
                    toast.error('Erreur inattendue');
                  }
                  setEmailSending(false);
                }}>
                {emailSending ? 'Envoi en cours...' : `Envoyer (${emailRecipients.length} destinataire${emailRecipients.length > 1 ? 's' : ''})`}
              </Button>
            </div>

            {/* Email history */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-sm font-display flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Historique des envois</h3>
              {emailLogs.length === 0 ? (
                <p className="text-muted-foreground text-center text-sm py-6">Aucun email envoyé.</p>
              ) : (
                emailLogs.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
                    <span className={`shrink-0 text-sm ${log.status === 'succes' ? 'text-green-500' : 'text-destructive'}`}>
                      {log.status === 'succes' ? '✅' : '❌'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{log.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        → {Array.isArray(log.recipients_json) ? log.recipients_json.join(', ') : log.recipients_json}
                      </p>
                      {log.body_preview && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{log.body_preview.replace(/<[^>]+>/g, '').substring(0, 120)}...</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(log.sent_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* User detail dialog */}
      <Dialog open={!!selectedUser} onOpenChange={open => { if (!open) setSelectedUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">
              {selectedUser?.emoji || '🦌'} {selectedUser?.display_name || 'Anonyme'}
            </DialogTitle>
            <DialogDescription>
              📧 {selectedUser ? (userEmails[selectedUser.user_id] || '—') : ''}<br />
              {selectedUser?.is_suspended ? '⛔ Compte suspendu' : '✅ Compte actif'} · Inscrit le {selectedUser && new Date(selectedUser.created_at).toLocaleDateString('fr-FR')}
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 py-3 bg-secondary/50 rounded-xl">
                <span className="text-3xl font-display text-primary">{selectedUser.balance}</span>
                <img src={daimcoinLogo} alt="" className="w-7 h-7 rounded-full" />
              </div>
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
              <div className="border-t border-border pt-3 flex flex-col gap-2">
                <Button variant="outline" size="sm" className={selectedUser.is_suspended ? '' : 'text-destructive border-destructive/30'}
                  onClick={() => toggleSuspend(selectedUser.user_id, !selectedUser.is_suspended)}>
                  {selectedUser.is_suspended ? (
                    <><Play className="w-3 h-3 mr-1" /> Réactiver le compte</>
                  ) : (
                    <><Ban className="w-3 h-3 mr-1" /> Suspendre le compte</>
                  )}
                </Button>
                <div className="flex gap-2">
                  <Input type="text" placeholder="Nouveau mot de passe" value={resetPwValue}
                    onChange={e => setResetPwValue(e.target.value)} className="flex-1 h-8 text-sm" />
                  <Button variant="outline" size="sm" disabled={resetPwValue.length < 6}
                    onClick={() => resetUserPassword(selectedUser.user_id, resetPwValue)}>
                    <RefreshCw className="w-3 h-3 mr-1" /> Reset
                  </Button>
                </div>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30"
                  onClick={async () => {
                    if (!confirm(`Supprimer définitivement le compte de ${selectedUser.display_name} ? Cette action est irréversible.`)) return;
                    const { data, error } = await supabase.functions.invoke('admin-delete-user', {
                      body: { target_user_id: selectedUser.user_id },
                    });
                    if (error || data?.error) {
                      toast.error(data?.error || error?.message || 'Erreur');
                    } else {
                      toast.success(`Compte de ${selectedUser.display_name} supprimé`);
                      logModerationAction({
                        action_type: 'suppression',
                        target_type: 'utilisateur',
                        target_id: selectedUser.user_id,
                        description: `Compte utilisateur supprimé : ${selectedUser.display_name}`,
                      });
                      setSelectedUser(null);
                      fetchAll();
                    }
                  }}>
                  <Trash2 className="w-3 h-3 mr-1" /> Supprimer le compte
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Injection dialog */}
      <AlertDialog open={showInjectionModal} onOpenChange={setShowInjectionModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display flex items-center gap-2"><img src={daimcoinLogo} alt="" className="w-5 h-5 rounded-full" />Injection de liquidités</AlertDialogTitle>
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

      {/* Tab reset dialog */}
      <Dialog open={!!tabResetTarget} onOpenChange={open => { if (!open) { setTabResetTarget(null); setTabResetConfirm(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-destructive">🔴 Réinitialiser — {tabResetTarget}</DialogTitle>
            <DialogDescription>Cette action est irréversible.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-xs space-y-1">
              <p>⚠️ <strong>Attention</strong> : cette action supprimera <strong>TOUTES</strong> les données de l'onglet <strong>"{tabResetTarget}"</strong> (votes, paris, propositions, résultats).</p>
              <p>Cette action est <strong>irréversible</strong>.</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Tape <strong className="text-destructive">CONFIRMER</strong> pour valider :</p>
              <Input value={tabResetConfirm} onChange={e => setTabResetConfirm(e.target.value)}
                placeholder="CONFIRMER" className="font-mono text-center tracking-widest" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setTabResetTarget(null)}>Annuler</Button>
              <Button variant="destructive" className="flex-1"
                disabled={tabResetConfirm !== 'CONFIRMER' || tabResetExecuting}
                onClick={async () => {
                  if (!tabResetTarget) return;
                  setTabResetExecuting(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('nuclear-reset-tab', {
                      body: { tab: tabResetTarget },
                    });
                    if (error) throw error;
                    toast.success(`🔴 Onglet "${tabResetTarget}" réinitialisé avec succès.`);
                    logModerationAction({
                      action_type: 'reinitialisation',
                      target_type: 'autre',
                      description: `Réinitialisation de l'onglet : ${tabResetTarget}`,
                    });
                    setTabResetTarget(null);
                    setTabResetConfirm('');
                    fetchAll();
                  } catch (err: any) {
                    toast.error('Erreur : ' + (err?.message || String(err)));
                  } finally {
                    setTabResetExecuting(false);
                  }
                }}>
                {tabResetExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : '🔴 Réinitialiser'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nuclear dialog */}
      <Dialog open={nuclearOpen} onOpenChange={open => { if (!open) { setNuclearOpen(false); setNuclearStep(1); } }}>
        <DialogContent className="max-w-lg">
          {nuclearDone ? (
            <div className="text-center py-8 space-y-4">
              <h2 className="text-2xl font-display text-primary">Réinitialisation effectuée</h2>
              <p className="text-muted-foreground">La plateforme est vide.</p>
              <Button onClick={() => { setNuclearOpen(false); setNuclearDone(false); fetchAll(); }} className="gold-gradient">
                Retour au portail admin
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-destructive">☢️ Réinitialisation totale — Étape {nuclearStep}/5</DialogTitle>
                <DialogDescription>Cette action est irréversible.</DialogDescription>
              </DialogHeader>
              {nuclearStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-destructive">Sera supprimé :</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                      <li>Tous les comptes utilisateurs (sauf admin)</li>
                      <li>Tous les paris, options et mises</li>
                      <li>L'historique des soldes</li>
                      <li>La Gazette (messages + réactions)</li>
                      <li>Les votes Kiss/Marry</li>
                      <li>Les propositions Daim-ocratie</li>
                      <li>Les tickets et réclamations</li>
                      <li>Les injections de liquidités</li>
                      <li>Les notifications et emails loggés</li>
                    </ul>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox checked={nuclearCheck1} onCheckedChange={v => setNuclearCheck1(!!v)} id="nuke1" />
                    <label htmlFor="nuke1" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                      Je comprends que cette action est irréversible et supprimera tous les comptes, paris et données.
                    </label>
                  </div>
                  <Button disabled={!nuclearCheck1} onClick={() => setNuclearStep(2)} className="w-full">
                    Étape suivante →
                  </Button>
                </div>
              )}
              {nuclearStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Saisissez exactement la phrase suivante (sensible à la casse) :</p>
                  <p className="text-center font-mono text-sm font-bold text-destructive bg-destructive/5 rounded-lg p-3">RÉINITIALISATION TOTALE DAIM</p>
                  <Input value={nuclearPhrase} onChange={e => setNuclearPhrase(e.target.value)} placeholder="Saisir la phrase..." className="font-mono text-sm" />
                  <Button disabled={nuclearPhrase !== 'RÉINITIALISATION TOTALE DAIM'} onClick={() => setNuclearStep(3)} className="w-full">
                    Étape suivante →
                  </Button>
                </div>
              )}
              {nuclearStep === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Un rapport complet va être envoyé à l'adresse admin avant la suppression.</p>
                  {nuclearReportError && (
                    <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-2 space-y-2">
                      <p>{nuclearReportError}</p>
                      <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => {
                        setNuclearReportSent(true);
                        setNuclearReportError('');
                        toast.info('Étape rapport ignorée');
                      }}>
                        ⏭️ Passer cette étape
                      </Button>
                    </div>
                  )}
                  {!nuclearReportSent ? (
                    <Button onClick={async () => {
                      setNuclearSendingReport(true);
                      setNuclearReportError('');
                      try {
                        const { data, error } = await supabase.functions.invoke('nuclear-reset', { body: { action: 'send_report' } });
                        if (error) {
                          const detail = typeof error === 'object' && 'message' in error ? error.message : String(error);
                          setNuclearReportError(`Erreur: ${detail}`);
                          setNuclearSendingReport(false);
                          return;
                        }
                        if (data?.error) {
                          setNuclearReportError(data.error);
                          setNuclearSendingReport(false);
                          return;
                        }
                        if (data?.skipped) {
                          toast.info(data.message || 'Rapport ignoré (pas de clé email)');
                        } else {
                          toast.success('Rapport envoyé à l\'adresse admin');
                        }
                        setNuclearReportSent(true);
                        setNuclearSendingReport(false);
                      } catch (e: any) {
                        setNuclearReportError(`Erreur inattendue: ${e?.message || String(e)}`);
                        setNuclearSendingReport(false);
                      }
                    }} disabled={nuclearSendingReport} className="w-full">
                      {nuclearSendingReport ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Envoi en cours...</> : '📧 Envoyer le rapport'}
                    </Button>
                  ) : (
                    <>
                      <p className="text-xs text-green-500">✅ Le rapport a été envoyé à votre adresse.</p>
                      <div className="flex items-start gap-2">
                        <Checkbox checked={nuclearReportCheck} onCheckedChange={v => setNuclearReportCheck(!!v)} id="nuke3" />
                        <label htmlFor="nuke3" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                          J'ai reçu le rapport et je confirme vouloir continuer.
                        </label>
                      </div>
                      <Button disabled={!nuclearReportCheck} onClick={() => {
                        setNuclearStep(4);
                        setNuclearCountdown(10);
                        setNuclearCountdownDone(false);
                        const timer = setInterval(() => {
                          setNuclearCountdown(prev => {
                            if (prev <= 1) { clearInterval(timer); setNuclearCountdownDone(true); return 0; }
                            return prev - 1;
                          });
                        }, 1000);
                      }} className="w-full">Étape suivante →</Button>
                    </>
                  )}
                </div>
              )}
              {nuclearStep === 4 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center">Compte à rebours de sécurité</p>
                  <div className="text-center">
                    <p className="text-5xl font-display text-destructive">{nuclearCountdown}</p>
                  </div>
                  <Progress value={(10 - nuclearCountdown) * 10} className="h-3" />
                  {!nuclearCountdownDone && <p className="text-xs text-muted-foreground text-center">Patientez {nuclearCountdown} seconde{nuclearCountdown > 1 ? 's' : ''}...</p>}
                  <Button disabled={!nuclearCountdownDone} onClick={() => setNuclearStep(5)} className="w-full">
                    {nuclearCountdownDone ? 'Continuer →' : 'Veuillez patienter...'}
                  </Button>
                </div>
              )}
              {nuclearStep === 5 && (
                <div className="space-y-4">
                  <p className="text-sm text-center text-destructive font-bold">⚠️ DERNIÈRE CHANCE — POINT DE NON-RETOUR</p>
                  <p className="text-xs text-muted-foreground text-center">Toutes les données seront supprimées définitivement.</p>
                  <Button className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 h-12 text-base font-bold"
                    disabled={nuclearExecuting}
                    onClick={async () => {
                      setNuclearExecuting(true);
                      const { data, error } = await supabase.functions.invoke('nuclear-reset', { body: { action: 'execute_reset' } });
                      if (error || data?.error) {
                        toast.error(data?.error || error?.message || 'Erreur lors de la réinitialisation');
                        setNuclearExecuting(false);
                        return;
                      }
                      setNuclearDone(true);
                      setNuclearExecuting(false);
                      toast.success('Réinitialisation totale effectuée');
                      logModerationAction({
                        action_type: 'reinitialisation',
                        target_type: 'autre',
                        description: 'Réinitialisation TOTALE de la plateforme (nuclear reset)',
                      });
                    }}>
                    {nuclearExecuting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Réinitialisation en cours...</> : 'Confirmer la réinitialisation totale ☢️'}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
