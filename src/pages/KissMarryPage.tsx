import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Eye, CalendarClock } from 'lucide-react';
import { PROMO_NAMES } from '@/lib/pari-mutuel';
import { fetchHiddenNames, filterNames } from '@/lib/visibility';
import { IntroKissMarry } from '@/components/TabIntro';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import PendingProposalsSection from '@/components/PendingProposalsSection';
import ProposeNewDialog from '@/components/ProposeNewDialog';
import ContactFooter from '@/components/ContactFooter';
import { useCountdown } from '@/hooks/useCountdown';

const CATEGORIES_REQUIRED = ['kiss', 'marry'] as const;
const CATEGORIES_OPTIONAL = ['coup_soir', 'plan_q'] as const;
const ALL_CATEGORIES = [...CATEGORIES_REQUIRED, ...CATEGORIES_OPTIONAL] as const;

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  kiss: { label: 'Kiss', emoji: '💋', color: 'from-pink-500/20 to-rose-500/20 border-pink-500/30' },
  marry: { label: 'Marry', emoji: '💍', color: 'from-violet-500/20 to-purple-500/20 border-violet-500/30' },
  coup_soir: { label: "Coup d'un soir", emoji: '🌙', color: 'from-blue-500/20 to-indigo-500/20 border-blue-500/30' },
  plan_q: { label: 'Plan Q', emoji: '🔥', color: 'from-orange-500/20 to-red-500/20 border-orange-500/30' },
};

const INDICES_TEMPLATES = [
  (cat: string, count: number) => count >= 20 ? `${CATEGORY_CONFIG[cat]?.emoji} Un Daim a récolté plus de ${Math.floor(count / 5) * 5} votes en ${CATEGORY_CONFIG[cat]?.label}...` : null,
  (cat: string, _: number, topCount: number, totalVotes: number) => topCount >= 3 && totalVotes > 10 ? `${CATEGORY_CONFIG[cat]?.emoji} ${topCount} Daims se partagent le haut du podium en ${CATEGORY_CONFIG[cat]?.label}` : null,
  (cat: string, maxVotes: number) => maxVotes <= 5 && maxVotes > 0 ? `${CATEGORY_CONFIG[cat]?.emoji} Personne n'a été voté en ${CATEGORY_CONFIG[cat]?.label} plus de 5 fois... pour l'instant` : null,
];

export default function KissMarryPage() {
  const { user, profile } = useAuth();
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [hasVoted, setHasVoted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [indices, setIndices] = useState<string[]>([]);
  const [revealStarted, setRevealStarted] = useState(false);
  const [revealStep, setRevealStep] = useState(-1);
  const [revealData, setRevealData] = useState<Record<string, { name: string; count: number }[]>>({});
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set(['coup_soir', 'plan_q']));
  const [optedOutNames, setOptedOutNames] = useState<Set<string>>(new Set());
  const [revealConfig, setRevealConfig] = useState<{ reveal_dates: string[] } | null>(null);
  const [revealLoading, setRevealLoading] = useState(false);

  // Fetch users who opted out of Kiss/Marry visibility
  useEffect(() => {
    fetchHiddenNames('visible_in_kiss_marry').then(setOptedOutNames);
  }, []);

  // Fetch reveal config (admin-managed dates)
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from('km_reveal_config')
        .select('reveal_dates')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setRevealConfig(data || { reveal_dates: [] });
    })();
  }, []);

  // Fetch visibility settings for optional categories
  useEffect(() => {
    const fetchVisibility = async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['km_show_coup_soir', 'km_show_plan_q']);
      const hidden = new Set<string>();
      const showCoupSoir = data?.find(r => r.key === 'km_show_coup_soir')?.value === 'true';
      const showPlanQ = data?.find(r => r.key === 'km_show_plan_q')?.value === 'true';
      if (!showCoupSoir) hidden.add('coup_soir');
      if (!showPlanQ) hidden.add('plan_q');
      setHiddenCategories(hidden);
    };
    fetchVisibility();
  }, []);

  const visibleCategories = ALL_CATEGORIES.filter(c => !hiddenCategories.has(c));

  const now = new Date();

  // Derive current voting period + reveal window from reveal config
  const sortedDates = (revealConfig?.reveal_dates || [])
    .map((d) => new Date(d))
    .sort((a, b) => a.getTime() - b.getTime());
  const nextRevealDate = sortedDates.find((d) => d.getTime() > now.getTime()) || null;
  // Period identifier = ISO date of next reveal (or 'post-cycle' if none)
  const monthYear = nextRevealDate
    ? nextRevealDate.toISOString().slice(0, 10)
    : 'post-cycle';

  // Reveal window: a date in the past, less than 24h ago
  const oneDayMs = 24 * 60 * 60 * 1000;
  const recentlyRevealed = [...sortedDates].reverse().find(
    (d) => d.getTime() <= now.getTime() && now.getTime() - d.getTime() < oneDayMs
  );
  const isRevealDay = !!recentlyRevealed;
  const revealMonthYear = recentlyRevealed ? recentlyRevealed.toISOString().slice(0, 10) : '';

  const countdown = useCountdown(nextRevealDate);

  // Filter out user's own name + opted-out users.
  // optedOutNames contains full display_names (e.g. "Léa Martin"); promo names are first names ("Léa").
  // Match by first token of display_name OR full equality.
  const optedOutFirstTokens = new Set(
    Array.from(optedOutNames).map(dn => dn.split(/\s+/)[0])
  );
  const myFirstToken = (profile?.display_name || '').split(/\s+/)[0].toLowerCase();
  const availableNames = PROMO_NAMES.filter(n => {
    const lower = n.toLowerCase();
    if (lower === (profile?.display_name || '').toLowerCase()) return false;
    if (lower === myFirstToken) return false;
    if (optedOutNames.has(lower)) return false;
    if (optedOutFirstTokens.has(lower)) return false;
    return true;
  });

  const checkIfVoted = useCallback(async () => {
    try {
      // Server-side check (localStorage alone is unreliable after nuclear reset)
      const { data, error } = await supabase.functions.invoke('km-vote', {
        body: { action: 'check' },
      });
      const periodKey = data?.period_id || monthYear;
      if (!error && data?.has_voted) {
        localStorage.setItem(`km_voted_${periodKey}`, 'true');
        setHasVoted(true);
      } else {
        // Clear stale localStorage if server says not voted
        localStorage.removeItem(`km_voted_${periodKey}`);
        setHasVoted(false);
      }
    } catch {
      // Fallback to localStorage if server unreachable
      if (localStorage.getItem(`km_voted_${monthYear}`)) setHasVoted(true);
    }
    setLoading(false);
  }, [monthYear]);

  const generateIndices = useCallback(async () => {
    const { data } = await (supabase.rpc as any)('get_km_top3', { p_month_year: monthYear });
    if (!data || data.length === 0) return;

    const catData: Record<string, { name: string; count: number }[]> = {};
    for (const row of data as any[]) {
      if (!catData[row.category]) catData[row.category] = [];
      catData[row.category].push({ name: row.voted_prenom, count: Number(row.vote_count) });
    }

    // Don't store in revealData - that's only for reveal mode

    // Generate safe indices (max 2)
    const generated: string[] = [];
    for (const cat of visibleCategories) {
      if (generated.length >= 2) break;
      const entries = catData[cat] || [];
      if (entries.length < 3) continue; // Too few votes to be safe
      const totalVotes = entries.reduce((s, e) => s + e.count, 0);
      if (totalVotes < 5) continue;

      const maxVotes = entries[0]?.count || 0;
      const topCount = entries.filter(e => e.count === maxVotes).length;

      for (const template of INDICES_TEMPLATES) {
        if (generated.length >= 2) break;
        const result = template(cat, maxVotes, topCount, totalVotes);
        if (result) {
          generated.push(result);
          break;
        }
      }
    }
    setIndices(generated);
  }, [monthYear, hiddenCategories]);

  useEffect(() => {
    if (!revealConfig) return; // wait until period ID is resolved
    if (user) checkIfVoted();
    generateIndices();
  }, [user, checkIfVoted, generateIndices, revealConfig]);

  const handleSubmit = async () => {
    if (!user || submitting) return;
    setSubmitting(true);

    // Validate required
    if (!selections.kiss || !selections.marry) {
      toast.error('Kiss 💋 et Marry 💍 sont obligatoires !');
      setSubmitting(false);
      return;
    }

    // Validate unique names across categories
    const selectedNames = Object.entries(selections).filter(([_, name]) => name).map(([_, name]) => name);
    if (new Set(selectedNames).size !== selectedNames.length) {
      toast.error('Choisis des prénoms différents pour chaque catégorie ! 🦌');
      setSubmitting(false);
      return;
    }

    const votes = Object.entries(selections)
      .filter(([_, name]) => name)
      .map(([category, voted_prenom]) => ({ category, voted_prenom }));

    if (monthYear === 'post-cycle') {
      toast.error("Aucune période de vote n'est ouverte actuellement 🦌");
      setSubmitting(false);
      setShowConfirm(false);
      return;
    }

    const { data, error } = await supabase.functions.invoke('km-vote', {
      body: { votes },
    });

    if (error || data?.error) {
      toast.error(data?.error || 'Erreur lors du vote');
      setSubmitting(false);
      setShowConfirm(false);
      return;
    }

    const periodKey = data?.period_id || monthYear;
    localStorage.setItem(`km_voted_${periodKey}`, 'true');
    toast.success('Votes enregistrés ! 🔒');
    setHasVoted(true);
    setSubmitting(false);
    setShowConfirm(false);
    generateIndices();
  };

  // Auto-fetch reveal data when revealMode activates
  useEffect(() => {
    if (!isRevealDay || revealStarted) return;
    setRevealStarted(true);
    setRevealLoading(true);
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    (async () => {
      const { data } = await (supabase.rpc as any)('get_km_top3', { p_month_year: revealMonthYear });
      const catData: Record<string, { name: string; count: number }[]> = {};
      for (const row of (data as any[]) || []) {
        if (!catData[row.category]) catData[row.category] = [];
        catData[row.category].push({ name: row.voted_prenom, count: Number(row.vote_count) });
      }
      setRevealData(catData);
      setRevealLoading(false);
      if (Object.keys(catData).length === 0) return;
      setRevealStep(-3);
      timeouts.push(setTimeout(() => setRevealStep(-2), 1000));
      timeouts.push(setTimeout(() => setRevealStep(-1), 2000));
      timeouts.push(setTimeout(() => setRevealStep(0), 3000));
      timeouts.push(setTimeout(() => setRevealStep(1), 5500));
      timeouts.push(setTimeout(() => setRevealStep(2), 8000));
      timeouts.push(setTimeout(() => setRevealStep(3), 10500));
    })();
    return () => { timeouts.forEach(clearTimeout); };
  }, [isRevealDay, revealMonthYear, revealStarted]);

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  // REVEAL LOADING (avoid flashing the vote form before reveal data arrives)
  if (isRevealDay && (revealLoading || (Object.keys(revealData).length === 0 && !revealStarted))) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-2xl text-center text-muted-foreground">
        🏆 Chargement de la révélation…
      </div>
    );
  }

  // REVEAL MODE
  if (isRevealDay && Object.keys(revealData).length > 0) {
    const countdownNum = revealStep < 0 ? Math.abs(revealStep) : null;
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl pb-20 md:pb-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-display gold-text">🏆 Révélation du mois</h1>
        </div>

        {countdownNum !== null ? (
          <motion.div key={countdownNum}
            initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
            className="text-center py-20">
            <span className="text-8xl font-display text-primary">{countdownNum}</span>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {visibleCategories.map((cat, catIdx) => {
              const catEntries = revealData[cat];
              if (!catEntries || catEntries.length === 0) return null;
              const isVisible = revealStep >= catIdx;
              const config = CATEGORY_CONFIG[cat];

              return (
                <AnimatePresence key={cat}>
                  {isVisible && (
                    <motion.div
                      initial={{ opacity: 0, y: 40, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={`rounded-2xl border bg-gradient-to-br ${config.color} p-6`}>
                      <h2 className="text-2xl font-display text-center mb-4">
                        {config.emoji} {config.label}
                      </h2>
                      <div className="space-y-3">
                        {catEntries.map((entry, i) => (
                          <motion.div key={entry.name}
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + i * 0.4, duration: 0.5 }}>
                            <div className={`flex items-center gap-4 p-3 rounded-xl ${
                              i === 0 ? 'bg-background/80 border border-primary/30' : 'bg-background/50'
                            }`}>
                              <span className="text-2xl">{['🥇', '🥈', '🥉'][i]}</span>
                              <span className={`flex-1 font-display tracking-wider ${i === 0 ? 'text-lg text-primary' : 'text-base'}`}>
                                {entry.name}
                              </span>
                              <span className="text-sm text-muted-foreground font-semibold">
                                {entry.count} vote{entry.count > 1 ? 's' : ''}
                              </span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ALREADY VOTED
  if (hasVoted) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl pb-20 md:pb-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-display gold-text">💋 Kiss / Marry</h1>
        </div>
        <IntroKissMarry />

        {countdown && nextRevealDate && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-4">
            <CalendarClock className="w-3.5 h-3.5 text-primary/70" />
            <span>Révélation dans <span className="text-primary font-semibold">{countdown.text}</span></span>
          </div>
        )}

        <div className="text-center p-6 rounded-2xl bg-primary/10 border border-primary/20 mb-6">
          <Lock className="w-8 h-8 mx-auto text-primary mb-2" />
          <p className="text-sm font-semibold">🔒 Tes votes sont enregistrés et définitifs.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Le Top 3 de chaque catégorie sera dévoilé à la prochaine date de révélation 🦌
          </p>
        </div>

        {/* Indices mystérieux */}
        {indices.length > 0 && (
          <div className="space-y-3 mb-6">
            <h2 className="text-lg font-display flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" /> Indices mystérieux
            </h2>
            {indices.map((indice, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.3 }}
                className="p-4 rounded-xl bg-secondary/50 border border-border text-sm italic">
                {indice}
              </motion.div>
            ))}
          </div>
        )}

        {/* Reveal is automatic on 1st of month at 10h */}
      </div>
    );
  }

  // VOTE FORM
  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl pb-20 md:pb-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-display gold-text">💋 Kiss / Marry</h1>
      </div>
      <IntroKissMarry />

      {countdown && nextRevealDate && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-4 mt-2">
          <CalendarClock className="w-3.5 h-3.5 text-primary/70" />
          <span>Révélation dans <span className="text-primary font-semibold">{countdown.text}</span></span>
        </div>
      )}

      <div className="flex justify-center mt-2 mb-2">
        <ProposeNewDialog kind="kiss_marry" buttonLabel="Proposer une catégorie" />
      </div>
      <PendingProposalsSection kind="kiss_marry" />

      <p className="text-xs text-primary/80 mb-4 text-center font-medium">
        ⚠️ Choisis un prénom différent pour chaque catégorie !
      </p>

      <div className="space-y-5">
        {visibleCategories.map(cat => {
          const config = CATEGORY_CONFIG[cat];
          const isRequired = CATEGORIES_REQUIRED.includes(cat as any);
          const search = searchTerms[cat] || '';
          const filtered = availableNames.filter(n => n.toLowerCase().includes(search.toLowerCase()));

          return (
            <div key={cat} className={`rounded-2xl border bg-gradient-to-br ${config.color} p-5`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-display">
                  {config.emoji} {config.label}
                </h2>
                {isRequired ? (
                  <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">Obligatoire</span>
                ) : (
                  <span className="text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">Optionnel</span>
                )}
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder="Rechercher un prénom..."
                value={search}
                onChange={e => setSearchTerms(prev => ({ ...prev, [cat]: e.target.value }))}
                className="w-full bg-background/80 border border-border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />

              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {filtered.map(name => (
                  <button key={name} onClick={() => {
                    setSelections(prev => ({
                      ...prev,
                      [cat]: prev[cat] === name ? '' : name,
                    }));
                  }}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                      selections[cat] === name
                        ? 'bg-primary text-primary-foreground border-primary font-bold scale-105'
                        : 'border-border/50 bg-background/60 hover:border-primary/40'
                    }`}>
                    {name}
                  </button>
                ))}
              </div>

              {selections[cat] && (
                <p className="text-xs text-primary mt-2 font-semibold">
                  ✓ {selections[cat]}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Button
        className="w-full gold-gradient font-semibold mt-6 h-12 text-base"
        onClick={() => setShowConfirm(true)}
        disabled={!selections.kiss || !selections.marry || submitting}>
        Confirmer mes votes 🔒
      </Button>

      {/* Confirmation modal */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">🔒 Confirmation des votes</AlertDialogTitle>
            <AlertDialogDescription>
              Tes votes sont définitifs et non modifiables. Voici ton récapitulatif :
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            {visibleCategories.map(cat => {
              if (!selections[cat]) return null;
              return (
                <div key={cat} className="flex items-center gap-2 text-sm">
                  <span>{CATEGORY_CONFIG[cat].emoji}</span>
                  <span className="text-muted-foreground">{CATEGORY_CONFIG[cat].label} :</span>
                  <span className="font-semibold">{selections[cat]}</span>
                </div>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Modifier</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={submitting} className="gold-gradient">
              {submitting ? 'Envoi...' : 'Confirmer 🔒'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ContactFooter />
    </div>
  );
}
