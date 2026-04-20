import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  LogOut, MessageSquarePlus, Coins, History, XCircle, Shield, Clock,
  Send, ChevronDown, ChevronUp, TrendingUp, TrendingDown, KeyRound,
  Ticket, Plus,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Eye } from 'lucide-react';
import ProposalForm from '@/components/ProposalForm';
import TicketThread from '@/components/TicketThread';
import { calculateEstimatedNetGain } from '@/lib/pari-mutuel';
import type { Tables } from '@/integrations/supabase/types';

type Wager = Tables<'wagers'>;
type SoldeHistory = Tables<'solde_history'>;

interface ActiveWager extends Wager {
  bet_title: string;
  bet_status: string;
  bet_category: string;
  bet_is_long_terme: boolean;
  bet_close_date: string | null;
  option_label: string;
  option_cote: number;
}

interface ResolvedWager {
  bet_title: string;
  option_label: string;
  montant_dc: number;
  is_winner: boolean | null;
  gain_delta: number | null;
  resolved_at: string;
}

const CONTACT_SUBJECTS = [
  "J'ai une idée de pari",
  "Je souhaite faire une réclamation",
  "Je signale un bug ou un problème",
  "Autre",
];

export default function ProfilePage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [showCharter, setShowCharter] = useState(false);

  // Active wagers
  const [activeWagers, setActiveWagers] = useState<ActiveWager[]>([]);
  const [resolvedWagers, setResolvedWagers] = useState<ResolvedWager[]>([]);
  const [soldeHistory, setSoldeHistory] = useState<SoldeHistory[]>([]);
  const [retractionConfig, setRetractionConfig] = useState({ start_hour: 0, end_hour: 9 });
  const [loading, setLoading] = useState(true);

  // Sections
  const [showActive, setShowActive] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showSolde, setShowSolde] = useState(false);
  const [showTickets, setShowTickets] = useState(false);

  // Tickets
  const [tickets, setTickets] = useState<any[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketMessage, setNewTicketMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const unreadTickets = tickets.filter(t => t.admin_replied_at && t.user_last_seen_at && new Date(t.admin_replied_at) > new Date(t.user_last_seen_at)).length;

  // Retraction
  const [retractingId, setRetractingId] = useState<string | null>(null);
  const [retractConfirm, setRetractConfirm] = useState<ActiveWager | null>(null);

  // Contact (removed — replaced by tickets)

  // Visibility prefs
  const [kmAvailable, setKmAvailable] = useState(true);
  const [savingPref, setSavingPref] = useState<string | null>(null);

  // Password reset
  const [resettingPw, setResettingPw] = useState(false);

  useEffect(() => {
    if (user) fetchAll();
  }, [user]);

  const fetchAll = async () => {
    if (!user) return;
    const [wagersRes, betsRes, optionsRes, histRes, configRes, ticketsRes] = await Promise.all([
      supabase.from('wagers').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('bets').select('*'),
      supabase.from('bet_options').select('*'),
      supabase.from('solde_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('retraction_config').select('*').limit(1).single(),
      supabase.from('tickets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    setTickets(ticketsRes.data || []);

    const wagers = wagersRes.data || [];
    const bets = betsRes.data || [];
    const options = optionsRes.data || [];
    setSoldeHistory(histRes.data || []);
    if (configRes.data) setRetractionConfig({ start_hour: configRes.data.start_hour, end_hour: configRes.data.end_hour });

    const betsMap = new Map(bets.map(b => [b.id, b]));
    const optionsMap = new Map(options.map(o => [o.id, o]));

    // Active wagers (non-retracted, bet not resolved/supprimé)
    const active: ActiveWager[] = [];
    const resolved: ResolvedWager[] = [];

    for (const w of wagers) {
      const bet = betsMap.get(w.bet_id);
      const opt = optionsMap.get(w.option_id);
      if (!bet || !opt) continue;

      if (w.is_retracted) continue;

      if (bet.status === 'resolu') {
        // Find gain in solde_history
        const gainEntry = (histRes.data || []).find(
          h => h.reason.includes(bet.title) && h.delta_dc > 0 && h.reason.startsWith('Gain')
        );
        resolved.push({
          bet_title: bet.title,
          option_label: opt.label,
          montant_dc: w.montant_dc,
          is_winner: opt.is_winner,
          gain_delta: gainEntry?.delta_dc || null,
          resolved_at: bet.updated_at,
        });
      } else if (['ouvert', 'cloture_en_attente', 'suspendu'].includes(bet.status)) {
        active.push({
          ...w,
          bet_title: bet.title,
          bet_status: bet.status,
          bet_category: bet.category,
          bet_is_long_terme: bet.is_long_terme,
          bet_close_date: bet.close_date,
          option_label: opt.label,
          option_cote: opt.cote_actuelle,
        });
      }
    }

    setActiveWagers(active);
    setResolvedWagers(resolved);
    setLoading(false);
  };

  // Retraction eligibility
  const canRetract = (w: ActiveWager): { eligible: boolean; reason?: string } => {
    if (w.bet_status !== 'ouvert') return { eligible: false, reason: 'Les mises sont clôturées' };

    const now = new Date();
    const miseDate = new Date(w.created_at);
    const hourCET = now.getUTCHours() + 1; // Approximate CET

    // Time window check
    const inWindow = hourCET >= retractionConfig.start_hour && hourCET < retractionConfig.end_hour;

    if (w.bet_is_long_terme) {
      // 72h after bet
      const hours72 = new Date(miseDate.getTime() + 72 * 3600000);
      if (now < hours72) {
        return {
          eligible: false,
          reason: `Disponible à partir du ${hours72.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${hours72.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
        };
      }
    } else {
      // Next day
      const nextDay = new Date(miseDate);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      if (now < nextDay) {
        return { eligible: false, reason: 'Disponible à partir de demain' };
      }
    }

    if (!inWindow) {
      return {
        eligible: false,
        reason: `Annulation disponible entre ${retractionConfig.start_hour}h00 et ${retractionConfig.end_hour}h00 CET`,
      };
    }

    return { eligible: true };
  };

  const handleRetract = async (wager: ActiveWager) => {
    setRetractingId(wager.id);
    const { data, error } = await supabase.rpc('retract_wager', {
      p_wager_id: wager.id,
      p_user_id: user!.id,
    });
    if (error) { toast.error('Erreur de rétractation'); setRetractingId(null); return; }
    const result = data as { error?: string; success?: boolean };
    if (result.error) { toast.error(result.error); setRetractingId(null); return; }

    toast.success(`Mise de ${wager.montant_dc} DC remboursée ! 💰`);
    setRetractConfirm(null);
    setRetractingId(null);
    await Promise.all([fetchAll(), refreshProfile()]);
  };


  const resetPassword = async () => {
    if (!user?.email) return;
    setResettingPw(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) toast.error('Erreur');
    else toast.success('Un email de réinitialisation a été envoyé ! 📧');
    setResettingPw(false);
  };

  const injections = useMemo(() =>
    soldeHistory.filter(h => h.reason.includes('Injection')),
  [soldeHistory]);

  if (loading || !profile) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl pb-20 md:pb-6 space-y-5">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-display gold-text">👤 Mon Profil</h1>
      </div>

      {/* ─── HEADER CARD ─── */}
      <div className="rounded-xl border border-border bg-card p-5 card-glow">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-2xl">
            {profile.emoji || '🦌'}
          </div>
          <div>
            <h2 className="text-xl font-display">{profile.display_name}</h2>
            <p className="text-xs text-muted-foreground">Membre depuis {new Date(profile.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 text-center mb-4">
          <p className="text-3xl font-display text-primary">{profile.balance} DC</p>
          <p className="text-xs text-muted-foreground">Solde actuel</p>
        </div>

        {injections.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <Coins className="w-3.5 h-3.5 inline mr-1" />
            {injections.length} injection{injections.length > 1 ? 's' : ''} reçue{injections.length > 1 ? 's' : ''} (+{injections.reduce((s, i) => s + i.delta_dc, 0)} DC)
          </div>
        )}
      </div>

      {/* ─── TICKETS ─── */}
      <div className="rounded-xl border border-primary/30 bg-card overflow-hidden">
        <button onClick={() => setShowTickets(!showTickets)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/30 transition-colors">
          <span className="font-display text-sm flex items-center gap-2">
            <Ticket className="w-4 h-4 text-primary" /> 📩 Mes tickets — Contacter l'administrateur ({tickets.length})
            {unreadTickets > 0 && (
              <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full">{unreadTickets}</span>
            )}
          </span>
          {showTickets ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showTickets && !activeTicketId && (
          <div className="px-4 pb-4 space-y-2">
            <Button size="sm" variant="outline" onClick={() => setShowNewTicket(true)} className="w-full mb-2">
              <Plus className="w-3.5 h-3.5 mr-1" /> Créer un ticket
            </Button>
            {tickets.length === 0 && <p className="text-sm text-muted-foreground text-center py-3">Aucun ticket</p>}
            {tickets.map(t => {
              const hasUnread = t.admin_replied_at && t.user_last_seen_at && new Date(t.admin_replied_at) > new Date(t.user_last_seen_at);
              const statusColors: Record<string, string> = {
                ouvert: 'bg-primary/10 text-primary',
                en_cours: 'bg-yellow-500/10 text-yellow-600',
                resolu: 'bg-muted text-muted-foreground',
              };
              return (
                <button key={t.id} onClick={() => setActiveTicketId(t.id)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/30 transition-colors flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5">
                      {hasUnread && <span className="w-2 h-2 bg-destructive rounded-full flex-shrink-0" />}
                      {t.subject}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[t.status] || ''}`}>
                    {t.status === 'ouvert' ? 'Ouvert' : t.status === 'en_cours' ? 'En cours' : 'Résolu'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {showTickets && activeTicketId && (
          <div className="px-4 pb-4">
            <TicketThread
              ticketId={activeTicketId}
              subject={tickets.find(t => t.id === activeTicketId)?.subject || ''}
              status={tickets.find(t => t.id === activeTicketId)?.status || 'ouvert'}
              onBack={() => { setActiveTicketId(null); fetchAll(); }}
              onStatusChange={fetchAll}
            />
          </div>
        )}
      </div>

      {/* ─── ACTIVE WAGERS ─── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button onClick={() => setShowActive(!showActive)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/30 transition-colors">
          <span className="font-display text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Mes paris en cours ({activeWagers.length})
          </span>
          {showActive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showActive && (
          <div className="px-4 pb-4 space-y-3">
            {activeWagers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun pari en cours</p>
            )}
            {activeWagers.map(w => {
              const retraction = canRetract(w);
              const estimatedGain = calculateEstimatedNetGain(w.montant_dc, w.option_cote);
              return (
                <motion.div key={w.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{w.bet_title}</p>
                      <p className="text-xs text-muted-foreground">
                        Option : <span className="text-primary font-medium">{w.option_label}</span>
                      </p>
                    </div>
                    {w.bet_status === 'cloture_en_attente' && (
                      <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">🔒 Clôturé</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded bg-secondary/50 p-1.5">
                      <p className="text-primary font-bold">{w.montant_dc} DC</p>
                      <p className="text-muted-foreground">Mise</p>
                    </div>
                    <div className="rounded bg-secondary/50 p-1.5">
                      <p className="font-bold">×{w.option_cote.toFixed(2)}</p>
                      <p className="text-muted-foreground">Cote</p>
                    </div>
                    <div className="rounded bg-secondary/50 p-1.5">
                      <p className="text-primary font-bold">{estimatedGain} DC</p>
                      <p className="text-muted-foreground">Gain estimé</p>
                    </div>
                  </div>

                  {/* Retraction */}
                  {retraction.eligible ? (
                    <Button size="sm" variant="outline"
                      className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 text-xs"
                      disabled={retractingId === w.id}
                      onClick={() => setRetractConfirm(w)}>
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Annuler ma mise
                    </Button>
                  ) : retraction.reason && w.bet_status === 'ouvert' ? (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {retraction.reason}
                    </p>
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── RESOLVED HISTORY ─── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/30 transition-colors">
          <span className="font-display text-sm flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" /> Mon historique ({resolvedWagers.length})
          </span>
          {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showHistory && (
          <div className="px-4 pb-4 space-y-2">
            {resolvedWagers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun pari résolu</p>
            )}
            {resolvedWagers.map((w, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-border/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{w.bet_title}</p>
                  <p className="text-xs text-muted-foreground">{w.option_label} · Mise : {w.montant_dc} DC</p>
                </div>
                <div className="text-right">
                  {w.is_winner ? (
                    <p className="text-sm font-bold text-primary flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" /> +{w.gain_delta || '?'} DC
                    </p>
                  ) : (
                    <p className="text-sm font-bold text-destructive flex items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" /> -{w.montant_dc} DC
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── SOLDE HISTORY ─── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button onClick={() => setShowSolde(!showSolde)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/30 transition-colors">
          <span className="font-display text-sm flex items-center gap-2">
            <Coins className="w-4 h-4 text-muted-foreground" /> Historique des mouvements
          </span>
          {showSolde ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showSolde && (
          <div className="px-4 pb-4 space-y-1.5 max-h-60 overflow-y-auto">
            {soldeHistory.map(h => (
              <div key={h.id} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                <p className="text-xs text-muted-foreground truncate flex-1 mr-2">{h.reason}</p>
                <span className={`text-xs font-semibold whitespace-nowrap ${h.delta_dc > 0 ? 'text-primary' : 'text-destructive'}`}>
                  {h.delta_dc > 0 ? '+' : ''}{h.delta_dc} DC
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── ACTIONS ─── */}
      <div className="space-y-3">
        <Button onClick={() => setShowProposalForm(true)} className="w-full gold-gradient font-semibold">
          <MessageSquarePlus className="w-4 h-4 mr-2" /> Soumettre une proposition 🗳️
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowCharter(true)}>
            <Shield className="w-4 h-4 mr-1" /> Charte
          </Button>
          <Button variant="outline" size="sm" onClick={resetPassword} disabled={resettingPw}>
            <KeyRound className="w-4 h-4 mr-1" /> Mot de passe
          </Button>
        </div>

        <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10" onClick={signOut}>
          <LogOut className="w-4 h-4 mr-2" /> Se déconnecter
        </Button>
      </div>

      {/* ─── MODALS ─── */}
      {/* Proposal form */}
      <Dialog open={showProposalForm} onOpenChange={setShowProposalForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display gold-text">🗳️ Nouvelle Proposition</DialogTitle>
          </DialogHeader>
          <ProposalForm onClose={() => setShowProposalForm(false)} onSubmitted={() => setShowProposalForm(false)} />
        </DialogContent>
      </Dialog>

      {/* Charter */}
      <Dialog open={showCharter} onOpenChange={setShowCharter}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display gold-text">📜 Charte d'utilisation</DialogTitle>
          </DialogHeader>
          <div className="bg-secondary/50 rounded-xl p-4 border border-border/50 space-y-3">
            <p className="text-sm leading-relaxed">
              🦌 <strong>Jordaim Belfort veille au grain.</strong> Tous les paris sont modérés,
              leur résolution est assurée par l'admin, et une règle est sacrée sur DaimBet :
              <strong> on rigole ensemble, jamais aux dépens de quelqu'un</strong>.
            </p>
            <p className="text-sm leading-relaxed">
              Un <strong>rake de 5 %</strong> sur les gains nets est prélevé automatiquement.
              Mise max : <strong>30 %</strong> du capital (15 % long terme).
            </p>
            <p className="text-sm leading-relaxed">Bonne chance à toi. 💸</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* New ticket dialog */}
      <Dialog open={showNewTicket} onOpenChange={setShowNewTicket}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">🎫 Nouveau ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Jordaim Belfort te répondra dans les meilleurs délais.
            </p>
            <Select value={newTicketSubject} onValueChange={setNewTicketSubject}>
              <SelectTrigger>
                <SelectValue placeholder="Objet" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_SUBJECTS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Décris ton problème…"
              value={newTicketMessage}
              onChange={e => setNewTicketMessage(e.target.value)}
              rows={4}
              maxLength={1000}
              required
            />
            <Button onClick={async () => {
              if (!user || !newTicketSubject || !newTicketMessage.trim()) return;
              setCreatingTicket(true);
              const { data: ticket, error } = await supabase.from('tickets').insert({
                user_id: user.id,
                subject: newTicketSubject,
              }).select().single();
              if (error || !ticket) { toast.error('Erreur lors de la création du ticket'); setCreatingTicket(false); return; }
              const { error: msgError } = await supabase.from('ticket_messages').insert({
                ticket_id: ticket.id,
                sender: 'utilisateur',
                content: newTicketMessage.trim(),
              });
              if (msgError) {
                toast.error('Ticket créé, mais le message n\'a pas pu être envoyé. Réessaie depuis la conversation.');
                setCreatingTicket(false);
                fetchAll();
                return;
              }
              toast.success('✅ Ton ticket a été envoyé. Jordaim Belfort te répondra dans les meilleurs délais.');
              setNewTicketSubject('');
              setNewTicketMessage('');
              setShowNewTicket(false);
              setCreatingTicket(false);
              fetchAll();
            }} disabled={!newTicketSubject || !newTicketMessage.trim() || creatingTicket}
              className="w-full gold-gradient">
              <Send className="w-4 h-4 mr-2" /> Envoyer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Retract confirmation */}
      <AlertDialog open={!!retractConfirm} onOpenChange={(open) => { if (!open) setRetractConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler ta mise ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tu seras remboursé de <strong>{retractConfirm?.montant_dc} DC</strong> sur le pari "{retractConfirm?.bet_title}".
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Non, garder</AlertDialogCancel>
            <AlertDialogAction onClick={() => retractConfirm && handleRetract(retractConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Oui, annuler ma mise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
