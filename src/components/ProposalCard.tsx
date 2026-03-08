import { ThumbsUp, ThumbsDown } from 'lucide-react';

interface ProposalCardProps {
  proposal: {
    id: string;
    title: string;
    type: string | null;
    votes_positive: number;
    votes_negative: number;
    proposer_name?: string;
  };
  userVote?: string;
  onVote: (proposalId: string, voteType: 'positif' | 'negatif') => void;
}

export default function ProposalCard({ proposal, userVote, onVote }: ProposalCardProps) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-display tracking-[0.05em] font-semibold">{proposal.title}</h3>
          {proposal.type && (
            <p className="text-sm text-muted-foreground mt-0.5">{proposal.type}</p>
          )}
          {proposal.proposer_name && (
            <p className="text-xs text-muted-foreground mt-1">Proposé par {proposal.proposer_name}</p>
          )}
        </div>
        <span className="inline-flex items-center text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full whitespace-nowrap ml-2">
          En attente 🗳️
        </span>
      </div>

      <div className="flex items-center gap-4 mt-3">
        <button
          onClick={() => onVote(proposal.id, 'positif')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            userVote === 'positif'
              ? 'bg-primary/20 text-primary'
              : 'bg-secondary text-muted-foreground hover:text-primary hover:bg-primary/10'
          }`}
        >
          <ThumbsUp className="w-4 h-4" />
          {proposal.votes_positive}
        </button>
        <button
          onClick={() => onVote(proposal.id, 'negatif')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            userVote === 'negatif'
              ? 'bg-destructive/20 text-destructive'
              : 'bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10'
          }`}
        >
          <ThumbsDown className="w-4 h-4" />
          {proposal.votes_negative}
        </button>
      </div>
    </div>
  );
}
