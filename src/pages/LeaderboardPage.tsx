import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { Trophy, Medal } from 'lucide-react';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;

export default function LeaderboardPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('balance', { ascending: false })
      .then(({ data }) => {
        setProfiles(data || []);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="text-center mb-8">
        <Trophy className="w-12 h-12 mx-auto text-primary mb-2" />
        <h1 className="text-4xl font-display gold-text">Classement</h1>
        <p className="text-muted-foreground mt-1">Les meilleurs parieurs DAIM du mois 🏆</p>
      </div>

      <div className="space-y-2">
        {profiles.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`flex items-center gap-4 p-4 rounded-xl border ${
              i < 3 ? 'border-primary/30 bg-primary/5 card-glow' : 'border-border bg-card'
            }`}
          >
            <span className="text-2xl w-8 text-center">
              {i < 3 ? medals[i] : <span className="text-sm text-muted-foreground">#{i + 1}</span>}
            </span>
            <div className="flex-1">
              <span className="font-semibold">{p.display_name || 'Anonyme'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-primary">{p.balance}</span>
              <img src={daimcoinLogo} alt="" className="w-5 h-5 rounded-full" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
