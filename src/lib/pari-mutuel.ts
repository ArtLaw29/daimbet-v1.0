export const PROMO_NAMES = [
  'Alexandre', 'Alexis', 'Alice', 'Anaïs', 'Angélique', 'Augustin', 'Aya',
  'Beatrice', 'Carla', 'Celia', 'Charles P.', 'Charles V.', 'Chris-Aurélien',
  'Christophe', 'Cyrine', 'Clara', 'Dana', 'Eliot', 'Elma', 'Etienne',
  'Garance', 'Ghali', 'Grégoire', 'Hania', 'Hanna', 'Ibtissam', 'Imane',
  'Inès', 'Issam', 'James-Marie', 'Jihane', 'Laura L.', 'Laura V.',
  'Laure', 'Louise', 'Léa', 'Luca', 'Maïlys', 'Manon', 'Mathilde',
  'Nassih', 'Nicolas', 'Nicole', 'Noé', 'Olivia', 'Paul', 'Philippine',
  'Pierre', 'Rosalie', 'Samory', 'Sofia', 'Sonya', 'Thomas', 'Tiffany',
  'Tom', 'Willem', 'Yanis', 'Yara', 'Yash', 'Yoann',
];

export const STARTING_BALANCE = 1000;
export const MAX_BET_PERCENT_STANDARD = 0.30;
export const MAX_BET_PERCENT_LONG_TERM = 0.15;
export const RAKE_PERCENT = 0.05;
export const DEFAULT_ODDS = 1.10;
export const MIN_ODDS = 1.0;

/**
 * Calculate pari mutuel odds for an option.
 * Floor: MIN_ODDS (1.0). Default when no bets: DEFAULT_ODDS (1.10).
 */
export function calculatePariMutuelOdds(totalPool: number, optionPool: number): number {
  if (optionPool === 0 || totalPool === 0) return DEFAULT_ODDS;
  const raw = totalPool / optionPool;
  return Math.max(raw, MIN_ODDS);
}

/**
 * Calculate gross winnings (before rake).
 */
export function calculateGrossWinnings(betAmount: number, totalOnWinningOption: number, totalPool: number): number {
  if (totalOnWinningOption === 0) return 0;
  return (betAmount / totalOnWinningOption) * totalPool;
}

/**
 * Calculate rake on net gains only: Rake = (gross - stake) * 5%.
 */
export function calculateRake(grossWinnings: number, betAmount: number): number {
  const netGain = grossWinnings - betAmount;
  if (netGain <= 0) return 0;
  return Math.round(netGain * RAKE_PERCENT);
}

/**
 * Net winnings after rake.
 */
export function calculateWinnings(betAmount: number, totalOnWinningOption: number, totalPool: number): number {
  const gross = calculateGrossWinnings(betAmount, totalOnWinningOption, totalPool);
  const rake = calculateRake(gross, betAmount);
  return Math.round(gross - rake);
}

/**
 * Estimated net gain for display: betAmount * odds, minus rake on net.
 */
export function calculateEstimatedNetGain(betAmount: number, odds: number): number {
  const gross = betAmount * odds;
  const rake = calculateRake(gross, betAmount);
  return Math.round(gross - rake);
}

/**
 * Max bet: 30% standard, 15% long-term.
 */
export function maxBetAmount(balance: number, isLongTerm: boolean = false): number {
  const pct = isLongTerm ? MAX_BET_PERCENT_LONG_TERM : MAX_BET_PERCENT_STANDARD;
  return Math.floor(balance * pct);
}

/**
 * Validate school email format: prénom.nom@essec.edu
 */
export function isValidSchoolEmail(email: string): boolean {
  return /^[a-zà-ÿ\-]+\.[a-zà-ÿ\-]+@essec\.edu$/i.test(email.trim());
}

/** @deprecated Use isValidSchoolEmail instead */
export const isValidEssecEmail = isValidSchoolEmail;
