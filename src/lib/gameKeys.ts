/** Centralised list of all game / sub-tab keys used in nav + admin suspension panel. */
export interface GameKeyDef {
  key: string;
  label: string;
  emoji: string;
  /** Parent top-level tab id (for grouping in admin panel) */
  group: string;
}

export const GAME_KEYS: GameKeyDef[] = [
  { key: 'paris_dc',       label: 'Paris DC',           emoji: '💸', group: 'Paris' },
  { key: 'paris_externes', label: 'Paris externes',     emoji: '🤝', group: 'Paris' },

  { key: 'daimocratie',    label: 'Daimocratie',        emoji: '🗳️', group: 'Jeux de promo' },
  { key: 'tournois',       label: 'Tournois',           emoji: '🏆', group: 'Jeux de promo' },
  { key: 'gouvernement',   label: 'Gouvernement',       emoji: '🏛️', group: 'Jeux de promo' },
  { key: 'fantasy_firm',   label: 'Fantasy Firm',       emoji: '💼', group: 'Jeux de promo' },
  { key: 'kiss_marry',     label: 'Kiss / Marry',       emoji: '💋', group: 'Jeux de promo' },
  { key: 'destins',        label: 'Destins',            emoji: '🔮', group: 'Jeux de promo' },
  { key: 'quizz',          label: 'Quizz',              emoji: '❓', group: 'Jeux de promo' },
  { key: 'bingo',          label: 'Bingo',              emoji: '🎱', group: 'Jeux de promo' },

  { key: 'loup_garou',     label: 'Loup-Garou Daim',    emoji: '🐺', group: 'Jeux' },
  { key: 'monopoly',       label: 'Monopoly Daim',      emoji: '🏘️', group: 'Jeux' },
  { key: 'uno',            label: 'Uno',                emoji: '🃏', group: 'Jeux' },

  { key: 'wordle',         label: 'Wordle',             emoji: '🔤', group: 'Mini-jeux' },
  { key: 'sudoku',         label: 'Sudoku',             emoji: '🔢', group: 'Mini-jeux' },
  { key: 'mots_fleches',   label: 'Mots fléchés',       emoji: '📝', group: 'Mini-jeux' },
  { key: 'pendu',          label: 'Pendu',              emoji: '🪢', group: 'Mini-jeux' },
  { key: 'echecs',         label: 'Échecs',             emoji: '♟️', group: 'Mini-jeux' },
  { key: 'puissance4',     label: 'Puissance 4',        emoji: '🔴', group: 'Mini-jeux' },

  { key: 'blackjack',      label: 'Blackjack',          emoji: '🂡', group: 'Casino' },
  { key: 'machine_a_sous', label: 'Machine à sous',     emoji: '🎰', group: 'Casino' },
  { key: 'poker',          label: 'Poker',              emoji: '♠️', group: 'Casino' },
  { key: 'roulette',       label: 'Roulette',           emoji: '🎡', group: 'Casino' },

  { key: 'gazette',        label: 'Gazette',            emoji: '📰', group: 'La promo' },
  { key: 'classement',     label: 'Classement',         emoji: '🏅', group: 'La promo' },
];

export const GAME_KEY_GROUPS: string[] = [
  'Paris', 'Jeux de promo', 'Jeux', 'Mini-jeux', 'Casino', 'La promo',
];