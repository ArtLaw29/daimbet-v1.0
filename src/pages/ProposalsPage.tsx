import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ThumbsUp, ThumbsDown, MessageSquarePlus } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Proposal = Tables<'daimocratie_proposals'>;

export default function ProposalsPage() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [userVotes, setUserVotes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchProposals();
    fetchUserVotes();
  }, [user]);

  const fetchProposals = async () => {
    const { data } = await supabase
      .from('daimocratie_proposals')
      .select('*')
      .order('votes_positive', { ascending: false });
    setProposals(data || []);
    setLoading(false);
  };

  const fetchUserVotes = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('daimocratie_votes')
      .select('proposal_id, vote')
      .eq('user_id', user.id);
    const votes: Record<string, string> = {};
    data?.forEach((v) => (votes[v.proposal_id] = v.vote));
    setUserVotes(votes);
  };

  const submitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;

    const { error } = await supabase.from('daimocratie_proposals').insert({
      title: title.trim(),
      type: description.trim() || null,
      user_id: user.id,
    });

    if (error) toast.error('Erreur');
    else {
      toast.success('Proposition soumise ! 🎉');
      setTitle('');
      setDescription('');
      fetchProposals();
    }
  };

  const vote = async (proposalId: string, voteType: 'positif' | 'negatif') => {
    if (!user) return;
    const existing = userVotes[proposalId];

    if (existing) {
      toast.info('Tu as déjà voté sur cette proposition !');
      return;
    }

    const { error } = await supabase.from('daimocratie_votes').insert({
      proposal_id: proposalId,
      user_id: user.id,
      vote: voteType,
    });

    if (error) {
      toast.error('Erreur de vote');
      return;
    }

    // Update counts locally
    const field = voteType === 'positif' ? 'votes_positive' : 'votes_negative';
    const proposal = proposals.find((p) => p.id === proposalId);
    if (proposal) {
      await supabase
        .from('daimocratie_proposals')
        .update({ [field]: proposal[field] + 1 })
        .eq('id', proposalId);
    }

    setUserVotes({ ...userVotes, [proposalId]: voteType });
    fetchProposals();
    toast.success('Vote enregistré !');
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Chargement...</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="text-center mb-8">
        <MessageSquarePlus className="w-12 h-12 mx-auto text-primary mb-2" />
        <h1 className="text-4xl font-display gold-text">Pipeline</h1>
        <p className="text-muted-foreground mt-1">Suggère un pari et vote pour ceux des autres !</p>
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

      <h2 className="text-xl font-display mb-4">Propositions en cours</h2>

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
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => vote(p.id, 'positif')}
                className={`p-1 rounded transition-colors ${
                  userVotes[p.id] === 'positif' ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                }`}
              >
                <ThumbsUp className="w-5 h-5" />
              </button>
              <span className="text-sm font-bold text-primary">{p.votes_positive - p.votes_negative}</span>
              <button
                onClick={() => vote(p.id, 'negatif')}
                className={`p-1 rounded transition-colors ${
                  userVotes[p.id] === 'negatif' ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'
                }`}
              >
                <ThumbsDown className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">{p.title}</h3>
              {p.type && <p className="text-sm text-muted-foreground mt-0.5">{p.type}</p>}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
