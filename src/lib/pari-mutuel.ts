export const PROMO_NAMES = [
  'Alexandre', 'Alexis', 'Alice', 'Anaïs', 'Angélique', 'Augustin',
  'Beatrice', 'Carla', 'Celia', 'Charles P.', 'Charles V.', 'Chris-Aurélien',
  'Christophe', 'Ciryne', 'Clara', 'Dana', 'Eliot', 'Elma', 'Etienne',
  'Garance', 'Ghali', 'Grégoire', 'Hania', 'Hanna', 'Ibtissam', 'Imane',
  'Inès', 'Issam', 'James-Marie', 'Jihane', 'Laura L.', 'Laura V.',
  'Laure', 'Louise', 'Léa', 'Luca', 'Maïlys', 'Manon', 'Mathilde',
  'Nassih', 'Nicolas', 'Nicole', 'Noé', 'Olivia', 'Paul', 'Philippine',
  'Pierre', 'Rosalie', 'Samory', 'Sofia', 'Sonia', 'Thomas', 'Tiffany',
  'Tom', 'Willem', 'Yanis', 'Yara', 'Yash', 'Yoann',
];

export interface BetPool {
  optionId: string;
  totalBet: number;
}

/**
 * Calculate pari mutuel odds for an option.
 * Odds = Total pool / Amount on this option
 */
export function calculatePariMutuelOdds(totalPool: number, optionPool: number): number {
  if (optionPool === 0 || totalPool === 0) return 0;
  return totalPool / optionPool;
}

/**
 * Calculate winnings for a bet on the winning option.
 * Payout = (betAmount / totalOnWinningOption) * totalPool
 */
export function calculateWinnings(betAmount: number, totalOnWinningOption: number, totalPool: number): number {
  if (totalOnWinningOption === 0) return 0;
  return (betAmount / totalOnWinningOption) * totalPool;
}

/**
 * Max bet is 20% of user's current balance.
 */
export function maxBetAmount(balance: number): number {
  return Math.floor(balance * 0.2);
}

/**
 * Validate ESSEC email format: prénom.nom@essec.edu
 */
export function isValidEssecEmail(email: string): boolean {
  return /^[a-zà-ÿ\-]+\.[a-zà-ÿ\-]+@essec\.edu$/i.test(email.trim());
}

/**
 * Aggregate bets by option for pari mutuel calculation.
 */
export function aggregateBetsByOption(
  bets: { option_id: string; amount: number; status: string }[]
): Record<string, number> {
  const pools: Record<string, number> = {};
  for (const bet of bets) {
    if (bet.status === 'pending' || bet.status === 'won' || bet.status === 'lost') {
      pools[bet.option_id] = (pools[bet.option_id] || 0) + bet.amount;
    }
  }
  return pools;
}
