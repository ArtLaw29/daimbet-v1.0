import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Heart, Sparkles } from 'lucide-react';
import { PROMO_NAMES } from '@/lib/pari-mutuel';
import { INTRO_KISS_MARRY } from '@/components/TabIntro';

const CATEGORIES = ['kiss', 'marry', 'coup_soir', 'plan_q'] as const;

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  kiss: { label: 'Kiss 💋', emoji: '💋' },
  marry: { label: 'Marry 💍', emoji: '💍' },
  coup_soir: { label: "Coup d'un soir 🌙", emoji: '🌙' },
  plan_q: { label: 'Plan Q 🔥', emoji: '🔥' },
};

// Simple hash for anonymization (client-side placeholder - should be edge function)
async function hashVoter(userId: string, monthYear: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${monthYear}:daimbet-secret`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function KissMarryPage() {
  const { user } = useAuth();
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [hasVoted, setHasVoted] = useState(false);
  const [results, setResults] = useState<Record<string, { name: string; count: number }[]>>({});
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    if (user) {
      checkIfVoted();
    }
    fetchResults();
  }, [user]);

  const checkIfVoted = async () => {
    if (!user) return;
    const voterHash = await hashVoter(user.id, monthYear);
    // We can't read kiss_marry_votes due to RLS (no SELECT policy)
    // Store vote status in localStorage as a simple check
    const key = `km_voted_${monthYear}`;
    if (localStorage.getItem(key)) setHasVoted(true);
    setLoading(false);
  };

  const fetchResults = async () => {
    // Use the RPC function for anonymous aggregates
    const { data } = await supabase.rpc('get_km_results', { p_month_year: monthYear });
    if (data) {
      const sorted: Record<string, { name: string; count: number }[]> = {};
      for (const row of data as any[]) {
        if (!sorted[row.category]) sorted[row.category] = [];
        sorted[row.category].push({ name: row.voted_prenom, count: Number(row.vote_count) });
      }
      // Keep top 3 per category
      for (const cat of Object.keys(sorted)) {
        sorted[cat] = sorted[cat].slice(0, 3);
      }
      setResults(sorted);
    }
    setLoading(false);
  };

  const handleSelect = (category: string, name: string) => {
    setSelections({ ...selections, [category]: name });
  };

  const handleSubmit = async () => {
    if (!user) return;
    const voterHash = await hashVoter(user.id, monthYear);

    const votes = Object.entries(selections).map(([category, voted_prenom]) => ({
      voter_hash: voterHash,
      category: category as any,
      voted_prenom,
      month_year: monthYear,
    }));

    if (votes.length !== CATEGORIES.length) {
      toast.error('Choisis un prénom pour chaque catégorie !');
      return;
    }

    const { error } = await supabase.from('kiss_marry_votes').insert(votes);
    if (error) {
      toast.error('Erreur: ' + error.message);
    } else {
      toast.success('Vote enregistré ! 💕');
      localStorage.setItem(`km_voted_${monthYear}`, 'true');
      setHasVoted(true);
      fetchResults();
    }
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="text-center mb-8">
        <Heart className="w-12 h-12 mx-auto text-destructive mb-2" />
        <h1 className="text-4xl font-display gold-text">Kiss / Marry</h1>
        <p className="text-muted-foreground mt-1">Vote anonyme — résultats en live 👀</p>
      </div>

      {!hasVoted ? (
        <>
          {CATEGORIES.map((cat) => (
            <div key={cat} className="mb-6">
              <h2 className="text-xl font-display mb-3">
                {CATEGORY_LABELS[cat].label}
              </h2>
              <div className="flex flex-wrap gap-2">
                {PROMO_NAMES.map((name) => (
                  <button
                    key={name}
                    onClick={() => handleSelect(cat, name)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      selections[cat] === name
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border bg-secondary/50 text-foreground hover:border-primary/50'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {selections[cat] && (
                <p className="text-sm text-primary mt-2">
                  Sélection : <strong>{selections[cat]}</strong>
                </p>
              )}
            </div>
          ))}

          <Button
            className="w-full gold-gradient font-semibold"
            onClick={handleSubmit}
            disabled={Object.keys(selections).length !== CATEGORIES.length}
          >
            Valider mon vote 💕
          </Button>
        </>
      ) : (
        <div>
          <div className="text-center mb-6 p-4 rounded-xl bg-primary/10 border border-primary/20">
            <Sparkles className="w-6 h-6 mx-auto text-primary mb-1" />
            <p className="text-sm">Tu as déjà voté ce mois-ci ! Voici les résultats en direct :</p>
          </div>

          {Object.entries(results).length === 0 ? (
            <p className="text-center text-muted-foreground">Les résultats apparaîtront quand plus de votes seront enregistrés.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {Object.entries(results).map(([cat, top]) => (
                <motion.div
                  key={cat}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl border border-border bg-card p-5 card-glow"
                >
                  <h3 className="text-xl font-display mb-3">{CATEGORY_LABELS[cat]?.label || cat}</h3>
                  <div className="space-y-2">
                    {top.map((entry, i) => (
                      <div key={entry.name} className="flex items-center gap-3">
                        <span className="text-lg">{['🥇', '🥈', '🥉'][i]}</span>
                        <span className="flex-1 font-medium">{entry.name}</span>
                        <span className="text-sm text-muted-foreground">{entry.count} vote{entry.count > 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
