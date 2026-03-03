import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Heart, Sparkles } from 'lucide-react';

const PRENOMS = [
  'Adam', 'Adrien', 'Alexandre', 'Alice', 'Alix', 'Amandine', 'Antoine', 'Arthur', 'Bastien', 'Benjamin',
  'Camille', 'Charles', 'Charlotte', 'Clara', 'Clément', 'Corentin', 'Damien', 'David', 'Émilie', 'Emma',
  'Étienne', 'Florian', 'Gabriel', 'Guillaume', 'Hugo', 'Inès', 'Jade', 'Julien', 'Justine', 'Léa',
  'Léo', 'Lola', 'Louis', 'Louise', 'Lucas', 'Manon', 'Marc', 'Marie', 'Mathieu', 'Maxime',
  'Nathan', 'Nicolas', 'Noah', 'Olivia', 'Paul', 'Pierre', 'Raphaël', 'Romain', 'Sarah', 'Simon',
  'Sophie', 'Théo', 'Thomas', 'Valentin', 'Victor', 'Victoire', 'Yanis', 'Zoé', 'Elise', 'Margot',
];

const CATEGORIES_SIMPLE = ['kiss', 'marry'] as const;
const CATEGORIES_EXTENDED = ['kiss', 'coup_un_soir', 'plan_q', 'marry'] as const;

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  kiss: { label: 'Kiss 💋', emoji: '💋' },
  marry: { label: 'Marry 💍', emoji: '💍' },
  coup_un_soir: { label: "Coup d'un soir 🌙", emoji: '🌙' },
  plan_q: { label: 'Plan Q 🔥', emoji: '🔥' },
};

export default function KissMarryPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<'simple' | 'extended'>('simple');
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [hasVoted, setHasVoted] = useState(false);
  const [results, setResults] = useState<Record<string, { name: string; count: number }[]>>({});
  const [loading, setLoading] = useState(true);

  const categories = mode === 'simple' ? CATEGORIES_SIMPLE : CATEGORIES_EXTENDED;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  useEffect(() => {
    checkIfVoted();
    fetchResults();
  }, [user]);

  const checkIfVoted = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('kiss_marry_votes')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', month)
      .eq('year', year);
    if (data && data.length > 0) setHasVoted(true);
    setLoading(false);
  };

  const fetchResults = async () => {
    // We can't use the view directly due to RLS, so we'll use an RPC or aggregate client-side
    // For now, fetch all votes for the current month (only own votes visible due to RLS)
    // Results are shown after voting
    const { data } = await supabase
      .from('kiss_marry_votes')
      .select('category, chosen_name')
      .eq('month', month)
      .eq('year', year);
    
    if (data) {
      const grouped: Record<string, Record<string, number>> = {};
      data.forEach((v) => {
        if (!grouped[v.category]) grouped[v.category] = {};
        grouped[v.category][v.chosen_name] = (grouped[v.category][v.chosen_name] || 0) + 1;
      });

      const sorted: Record<string, { name: string; count: number }[]> = {};
      Object.entries(grouped).forEach(([cat, names]) => {
        sorted[cat] = Object.entries(names)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
      });
      setResults(sorted);
    }
  };

  const handleSelect = (category: string, name: string) => {
    setSelections({ ...selections, [category]: name });
  };

  const handleSubmit = async () => {
    if (!user) return;
    const votes = Object.entries(selections).map(([category, chosen_name]) => ({
      user_id: user.id,
      category,
      chosen_name,
      month,
      year,
    }));

    if (votes.length !== categories.length) {
      toast.error(`Choisis un prénom pour chaque catégorie !`);
      return;
    }

    const { error } = await supabase.from('kiss_marry_votes').insert(votes);
    if (error) {
      toast.error('Erreur: ' + error.message);
    } else {
      toast.success('Vote enregistré ! 💕');
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
          <div className="flex justify-center gap-2 mb-6">
            <Button
              variant={mode === 'simple' ? 'default' : 'outline'}
              onClick={() => setMode('simple')}
              size="sm"
            >
              Simple (2 catégories)
            </Button>
            <Button
              variant={mode === 'extended' ? 'default' : 'outline'}
              onClick={() => setMode('extended')}
              size="sm"
            >
              Étendu (4 catégories)
            </Button>
          </div>

          {categories.map((cat) => (
            <div key={cat} className="mb-6">
              <h2 className="text-xl font-display mb-3">
                {CATEGORY_LABELS[cat].label}
              </h2>
              <div className="flex flex-wrap gap-2">
                {PRENOMS.map((name) => (
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
            disabled={Object.keys(selections).length !== categories.length}
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
