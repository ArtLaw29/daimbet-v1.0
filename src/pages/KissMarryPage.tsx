import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Eye } from 'lucide-react';
import { PROMO_NAMES } from '@/lib/pari-mutuel';
import { INTRO_KISS_MARRY } from '@/components/TabIntro';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

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

  const now = new Date();
  // Current voting month
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Reveal logic: on the 1st of each month at 10h, reveal LAST month's results
  const isRevealDay = now.getDate() === 1 && now.getHours() >= 10;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const revealMonthYear = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  // Filter out user's own name
  const availableNames = PROMO_NAMES.filter(n =>
    n.toLowerCase() !== (profile?.display_name || '').toLowerCase()
  );

  const checkIfVoted = useCallback(async () => {
    const key = `km_voted_${monthYear}`;
    if (localStorage.getItem(key)) setHasVoted(true);
    setLoading(false);
  }, [monthYear]);

  const generateIndices = useCallback(async () => {
    const { data } = await supabase.rpc('get_km_results', { p_month_year: monthYear });
    if (!data || data.length === 0) return;

    const catData: Record<string, { name: string; count: number }[]> = {};
    for (const row of data as any[]) {
      if (!catData[row.category]) catData[row.category] = [];
      catData[row.category].push({ name: row.voted_prenom, count: Number(row.vote_count) });
    }

    // Don't store in revealData - that's only for reveal mode

    // Generate safe indices (max 2)
    const generated: string[] = [];
    for (const cat of ALL_CATEGORIES) {
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
  }, [monthYear]);

  useEffect(() => {
    if (user) checkIfVoted();
    generateIndices();
  }, [user, checkIfVoted, generateIndices]);

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

    const { data, error } = await supabase.functions.invoke('km-vote', {
      body: { votes, month_year: monthYear },
    });

    if (error || data?.error) {
      toast.error(data?.error || 'Erreur lors du vote');
      setSubmitting(false);
      return;
    }

    localStorage.setItem(`km_voted_${monthYear}`, 'true');
    toast.success('Votes enregistrés ! 🔒');
    setHasVoted(true);
    setSubmitting(false);
    generateIndices();
  };

  // Auto-fetch reveal data when revealMode activates
  // Auto-reveal: on the 1st of the month at 10h, fetch LAST month's results
  useEffect(() => {
    if (!isRevealDay || revealStarted) return;
    setRevealStarted(true);
    (async () => {
      const { data } = await supabase.rpc('get_km_results', { p_month_year: revealMonthYear });
      if (!data || data.length === 0) return;
      const catData: Record<string, { name: string; count: number }[]> = {};
      for (const row of data as any[]) {
        if (!catData[row.category]) catData[row.category] = [];
        catData[row.category].push({ name: row.voted_prenom, count: Number(row.vote_count) });
      }
      for (const cat of Object.keys(catData)) {
        catData[cat] = catData[cat].slice(0, 3);
      }
      setRevealData(catData);
      setRevealStep(-3);
      setTimeout(() => setRevealStep(-2), 1000);
      setTimeout(() => setRevealStep(-1), 2000);
      setTimeout(() => setRevealStep(0), 3000);
      setTimeout(() => setRevealStep(1), 5500);
      setTimeout(() => setRevealStep(2), 8000);
      setTimeout(() => setRevealStep(3), 10500);
    })();
  }, [isRevealDay, revealMonthYear, revealStarted]);

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

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
            {ALL_CATEGORIES.map((cat, catIdx) => {
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
        {INTRO_KISS_MARRY}

        <div className="text-center p-6 rounded-2xl bg-primary/10 border border-primary/20 mb-6">
          <Lock className="w-8 h-8 mx-auto text-primary mb-2" />
          <p className="text-sm font-semibold">🔒 Tes votes sont enregistrés et définitifs.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Le Top 3 de chaque catégorie sera dévoilé à la fin du cycle mensuel 🦌
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

        {/* Reveal is now admin-controlled via platform_settings */}
      </div>
    );
  }

  // VOTE FORM
  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl pb-20 md:pb-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-display gold-text">💋 Kiss / Marry</h1>
      </div>
      {INTRO_KISS_MARRY}

      <p className="text-xs text-muted-foreground mb-2 text-center">
        Les catégories "Coup d'un soir" et "Plan Q" sont optionnelles — tu peux jouer sans elles.
      </p>
      <p className="text-xs text-primary/80 mb-4 text-center font-medium">
        ⚠️ Choisis un prénom différent pour chaque catégorie !
      </p>

      <div className="space-y-5">
        {ALL_CATEGORIES.map(cat => {
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
            {ALL_CATEGORIES.map(cat => {
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
    </div>
  );
}
