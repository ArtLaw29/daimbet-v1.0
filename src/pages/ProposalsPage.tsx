import { Navigate } from 'react-router-dom';

/**
 * The dedicated Pipeline page is deprecated.
 * Bet proposals are now placed directly on the Bets page (/) via the
 * "Propose un pari" button + the "Propositions en attente" section.
 */
export default function ProposalsPage() {
  return <Navigate to="/" replace />;
}
