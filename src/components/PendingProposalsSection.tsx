import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { POSITIVE_THRESHOLD, NEGATIVE_BLOCK, voteOnProposal, KIND_LABELS, type ProposalKind } from '@/lib/proposals';

interface PendingProposal {
  id: string;
  title: string;
  user_id: string;
  votes_positive: number;
  votes_negative: number;
  created_at: string;
  payload: Record<string, unknown> | null;
}

interface Props {
  kind: ProposalKind;
  /** Optional title override */
  title?: string;
}

export default function PendingProposalsSection({ kind, title }: Props) {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [proposerNames, setProposerNames] = useState<Record<string, string>>({});
  const [userVotes, setUserVotes] = useState<Record<string, 'positif' | 'negatif'>>({});
  const [loading, setLoading] = useState(true);

  const fetchProposals = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('daimocratie_proposals')
      .select('id, title, user_id, votes_positive, votes_negative, created_at, payload')
      .eq('proposal_kind', kind)
      .eq('status', 'en_attente')
      .eq('is_hidden', false)
      .order('created_at', { ascending: false });

    const items = (data || []) as PendingProposal[];
    setProposals(items);

    if (items.length > 0) {
      const uids = [...new Set(items.map((p) => p.user_id))];
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', uids);
      if (profs) {
        const map: Record<string, string> = {};
        profs.forEach((p) => { map[p.user_id] = p.display_name; });
        setProposerNames(map);
      }
      if (user) {
        const { data: votes } = await supabase
          .from('daimocratie_votes')
          .select('proposal_id, vote')
          .eq('user_id', user.id)
          .in('proposal_id', items.map((p) => p.id));
        if (votes) {
          const vm: Record<string, 'positif' | 'negatif'> = {};
          votes.forEach((v: any) => { vm[v.proposal_id] = v.vote; });
          setUserVotes(vm);
        }
      }
    } else {
      setProposerNames({});
      setUserVotes({});
    }
    setLoading(false);
  }, [kind, user]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const handleVote = async (proposalId: string, voteType: 'positif' | 'negatif') => {
    if (!user) {
      toast.error('Connecte-toi pour voter');
      return;
    }
    const wasSame = userVotes[proposalId] === voteType;
    // Optimistic
    setUserVotes((prev) => {
      const next = { ...prev };
      if (wasSame) delete next[proposalId];
      else next[proposalId] = voteType;
      return next;
    });
    await voteOnProposal(proposalId, user.id, voteType);
    fetchProposals();
  };



  if (loading) return null;
  if (proposals.length === 0) return null;

  const label = KIND_LABELS[kind];

  return (
    <div className="space-y-3 mt-4">
      <h3 className="font-display text-base flex items-center gap-2">
        🗳️ {title || `Propositions de ${label.singular} en attente`}
        <span className="text-xs font-normal text-muted-foreground">({proposals.length})</span>
      </h3>
      <p className="text-[11px] text-muted-foreground">
        Une proposition est validée à <strong>{POSITIVE_THRESHOLD} 👍</strong> avec moins de <strong>{NEGATIVE_BLOCK} 👎</strong>, ou par l'admin.
      </p>

      <AnimatePresence>
        {proposals.map((p) => {
          const progressPct = Math.min(100, (p.votes_positive / POSITIVE_THRESHOLD) * 100);
          const userVote = userVotes[p.id];
          const blocked = p.votes_negative >= NEGATIVE_BLOCK;

          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="rounded-xl border border-border bg-muted/30 p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm">{p.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Proposé par {proposerNames[p.user_id] || 'Inconnu'} 🦌
                  </p>
                </div>
              </div>

              <div className="mt-3 mb-2">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>👍 {p.votes_positive} / {POSITIVE_THRESHOLD}</span>
                  {p.votes_negative > 0 && (
                    <span className={blocked ? 'text-destructive font-semibold' : ''}>
                      👎 {p.votes_negative} / {NEGATIVE_BLOCK} {blocked && '— bloquée'}
                    </span>
                  )}
                </div>
                <Progress value={progressPct} className="h-1.5" />
              </div>

              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => handleVote(p.id, 'positif')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    userVote === 'positif'
                      ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                      : 'bg-secondary text-muted-foreground hover:text-primary hover:bg-primary/10'
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" />
                  {p.votes_positive}
                </button>
                <button
                  onClick={() => handleVote(p.id, 'negatif')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    userVote === 'negatif'
                      ? 'bg-destructive/20 text-destructive ring-1 ring-destructive/30'
                      : 'bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                  }`}
                >
                  <ThumbsDown className="w-4 h-4" />
                  {p.votes_negative}
                </button>
                {userVote && (
                  <span className="text-[10px] text-muted-foreground ml-auto">Reclique pour annuler ton vote</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
