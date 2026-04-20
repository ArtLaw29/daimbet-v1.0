import { supabase } from '@/integrations/supabase/client';

export const POSITIVE_THRESHOLD = 10;
export const NEGATIVE_BLOCK = 3;

export type ProposalKind = 'bet' | 'sondage' | 'tournoi' | 'gouvernement' | 'fantasy' | 'kiss_marry';

export const KIND_LABELS: Record<ProposalKind, { singular: string; emoji: string }> = {
  bet: { singular: 'pari', emoji: '🎯' },
  sondage: { singular: 'sondage', emoji: '📊' },
  tournoi: { singular: 'tournoi', emoji: '⚔️' },
  gouvernement: { singular: 'gouvernement', emoji: '🏛️' },
  fantasy: { singular: 'cabinet', emoji: '⚖️' },
  kiss_marry: { singular: 'Kiss/Marry', emoji: '💋' },
};

export function meetsThreshold(votesPositive: number, votesNegative: number) {
  return votesPositive >= POSITIVE_THRESHOLD && votesNegative < NEGATIVE_BLOCK;
}

/**
 * Vote on a proposal. Toggles off if same vote, replaces if different.
 * Then updates votes_positive/votes_negative counts on the proposal row.
 */
export async function voteOnProposal(proposalId: string, userId: string, voteType: 'positif' | 'negatif') {
  const { data: existing } = await supabase
    .from('daimocratie_votes')
    .select('*')
    .eq('proposal_id', proposalId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    if (existing.vote === voteType) {
      await supabase.from('daimocratie_votes').delete().eq('id', existing.id);
    } else {
      await supabase.from('daimocratie_votes').update({ vote: voteType }).eq('id', existing.id);
    }
  } else {
    await supabase.from('daimocratie_votes').insert({ proposal_id: proposalId, user_id: userId, vote: voteType });
  }

  // Recount
  const { data: votes } = await supabase
    .from('daimocratie_votes')
    .select('vote')
    .eq('proposal_id', proposalId);

  const positives = votes?.filter((v) => v.vote === 'positif').length ?? 0;
  const negatives = votes?.filter((v) => v.vote === 'negatif').length ?? 0;

  await supabase
    .from('daimocratie_proposals')
    .update({ votes_positive: positives, votes_negative: negatives })
    .eq('id', proposalId);

  // Auto-activate if threshold met
  if (meetsThreshold(positives, negatives)) {
    await supabase.functions.invoke('activate-proposal', { body: { proposal_id: proposalId } });
  }

  return { positives, negatives };
}
