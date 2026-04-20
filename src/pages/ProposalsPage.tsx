import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { MessageSquarePlus, CheckCircle } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Proposal = Tables<'daimocratie_proposals'>;

export default function ProposalsPage() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposerNames, setProposerNames] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProposals();
  }, [user]);

  const fetchProposals = async () => {
    const { data } = await supabase
      .from('daimocratie_proposals')
      .select('*')
      .eq('is_hidden', false)
      .order('created_at', { ascending: false });
    const items = data || [];
    setProposals(items);

    if (items.length > 0) {
      const uids = [...new Set(items.map(p => p.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', uids);
      if (profiles) {
        const names: Record<string, string> = {};
        profiles.forEach(p => { names[p.user_id] = p.display_name; });
        setProposerNames(names);
      }
    }

    setLoading(false);
  };

  const submitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;

    const { error } = await supabase.from('daimocratie_proposals').insert({
      title: title.trim(),
      type: description.trim() || null,
      user_id: user.id,
    });

    if (error) {
      toast.error('Erreur lors de la soumission');
      return;
    }

    toast.success('Proposition soumise ! En attente de 10 👍 (et < 3 👎) ou de validation admin 🗳️');

    setTitle('');
    setDescription('');
    fetchProposals();
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="text-center mb-8">
        <MessageSquarePlus className="w-12 h-12 mx-auto text-primary mb-2" />
        <h1 className="text-4xl font-display gold-text">Pipeline</h1>
        <p className="text-muted-foreground mt-1">Propose un pari — il sera immédiatement actif !</p>
      </div>

      <form onSubmit={submitProposal} className="rounded-xl border border-border bg-card p-5 mb-8 card-glow">
        <h2 className="text-lg font-display mb-3">Nouvelle proposition</h2>
        <div className="space-y-3">
          <Input
            placeholder="Titre du pari (ex: Est-ce que X arrivera à l'heure ?)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
          />
          <Textarea
            placeholder="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
          />
          <Button type="submit" className="gold-gradient font-semibold">
            Soumettre 🦌
          </Button>
        </div>
      </form>

      <h2 className="text-xl font-display mb-4">Propositions récentes</h2>

      {proposals.length === 0 && (
        <p className="text-center text-muted-foreground py-8">Aucune proposition pour le moment. Sois le premier !</p>
      )}

      <div className="space-y-3">
        {proposals.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card"
          >
            <div className="flex-1">
              <h3 className="font-semibold">{p.title}</h3>
              <p className="text-xs text-muted-foreground">
                Par {proposerNames[p.user_id] || 'Inconnu'} · {new Date(p.created_at).toLocaleDateString('fr-FR')}
              </p>
              {p.type && <p className="text-sm text-muted-foreground mt-0.5">{p.type}</p>}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${
              p.status === 'valide' ? 'bg-primary/20 text-primary' : 
              p.status === 'rejete' ? 'bg-destructive/20 text-destructive' :
              'bg-muted text-muted-foreground'
            }`}>
              {p.status === 'valide' ? '✅ Actif' : p.status === 'rejete' ? '❌ Supprimé' : '⏳ En cours'}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
