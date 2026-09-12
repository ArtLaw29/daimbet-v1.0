export interface Nominee {
  name: string;
  country: string;
  flag: string;
  club: string;
}

export const BALLON_DOR_SESSION_ID = '00000000-0000-0000-0000-000000000005';

export const BALLON_DOR_NOMINEES: Nominee[] = [
  { name: 'Jude Bellingham', country: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', club: 'Real Madrid' },
  { name: 'Pau Cubarsí', country: 'Espagne', flag: '🇪🇸', club: 'FC Barcelone' },
  { name: 'Marc Cucurella', country: 'Espagne', flag: '🇪🇸', club: 'Real Madrid' },
  { name: 'Ousmane Dembélé', country: 'France', flag: '🇫🇷', club: 'Paris-SG' },
  { name: 'Luis Díaz', country: 'Colombie', flag: '🇨🇴', club: 'Bayern Munich' },
  { name: 'Bruno Fernandes', country: 'Portugal', flag: '🇵🇹', club: 'Manchester United' },
  { name: 'Gabriel', country: 'Brésil', flag: '🇧🇷', club: 'Arsenal' },
  { name: 'Erling Haaland', country: 'Norvège', flag: '🇳🇴', club: 'Manchester City' },
  { name: 'Achraf Hakimi', country: 'Maroc', flag: '🇲🇦', club: 'Paris-SG' },
  { name: 'Harry Kane', country: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', club: 'Bayern Munich' },
  { name: 'Khvicha Kvaratskhelia', country: 'Géorgie', flag: '🇬🇪', club: 'Paris-SG' },
  { name: 'Lamine Yamal', country: 'Espagne', flag: '🇪🇸', club: 'FC Barcelone' },
  { name: 'Sadio Mané', country: 'Sénégal', flag: '🇸🇳', club: 'Al-Nassr' },
  { name: 'Marquinhos', country: 'Brésil', flag: '🇧🇷', club: 'Paris-SG' },
  { name: 'Lautaro Martínez', country: 'Argentine', flag: '🇦🇷', club: 'Inter Milan' },
  { name: 'Kylian Mbappé', country: 'France', flag: '🇫🇷', club: 'Real Madrid' },
  { name: 'Nuno Mendes', country: 'Portugal', flag: '🇵🇹', club: 'Paris-SG' },
  { name: 'Lionel Messi', country: 'Argentine', flag: '🇦🇷', club: 'Inter Miami' },
  { name: 'João Neves', country: 'Portugal', flag: '🇵🇹', club: 'Paris-SG' },
  { name: 'Michael Olise', country: 'France', flag: '🇫🇷', club: 'Bayern Munich' },
  { name: 'Willian Pacho', country: 'Équateur', flag: '🇪🇨', club: 'Paris-SG' },
  { name: 'Julián Quiñones', country: 'Mexique', flag: '🇲🇽', club: 'Al-Qadsiah' },
  { name: 'Declan Rice', country: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', club: 'Arsenal' },
  { name: 'Rodri', country: 'Espagne', flag: '🇪🇸', club: 'FC Barcelone' },
  { name: 'Fabián Ruiz', country: 'Espagne', flag: '🇪🇸', club: 'Paris-SG' },
  { name: 'William Saliba', country: 'France', flag: '🇫🇷', club: 'Arsenal' },
  { name: 'Ferran Torres', country: 'Espagne', flag: '🇪🇸', club: 'Paris-SG' },
  { name: 'Dayot Upamecano', country: 'France', flag: '🇫🇷', club: 'Bayern Munich' },
  { name: 'Vinicius Junior', country: 'Brésil', flag: '🇧🇷', club: 'Real Madrid' },
  { name: 'Vitinha', country: 'Portugal', flag: '🇵🇹', club: 'Paris-SG' },
];

export const KOPA_NOMINEES: Nominee[] = [
  { name: 'Kerim Alajbegović', country: 'Bosnie-Herzégovine', flag: '🇧🇦', club: 'Juventus Turin' },
  { name: 'Ayyoub Bouaddi', country: 'Maroc', flag: '🇲🇦', club: 'Manchester City' },
  { name: 'Pau Cubarsí', country: 'Espagne', flag: '🇪🇸', club: 'FC Barcelone' },
  { name: 'Yan Diomandé', country: "Côte d'Ivoire", flag: '🇨🇮', club: 'Real Madrid' },
  { name: 'Lennart Karl', country: 'Allemagne', flag: '🇩🇪', club: 'Bayern Munich' },
  { name: 'Éli Junior Kroupi', country: 'France', flag: '🇫🇷', club: 'Bournemouth' },
  { name: 'Lamine Yamal', country: 'Espagne', flag: '🇪🇸', club: 'FC Barcelone' },
  { name: 'Johan Manzambi', country: 'Suisse', flag: '🇨🇭', club: 'Aston Villa' },
  { name: 'Ibrahim Maza', country: 'Algérie', flag: '🇩🇿', club: 'Bayer Leverkusen' },
  { name: 'Warren Zaïre-Emery', country: 'France', flag: '🇫🇷', club: 'Paris-SG' },
];

export const YACHINE_NOMINEES: Nominee[] = [
  { name: 'Yassine Bounou', country: 'Maroc', flag: '🇲🇦', club: 'Al-Hilal' },
  { name: 'Thibaut Courtois', country: 'Belgique', flag: '🇧🇪', club: 'Real Madrid' },
  { name: 'Joan García', country: 'Espagne', flag: '🇪🇸', club: 'Espanyol Barcelone' },
  { name: 'Gregor Kobel', country: 'Suisse', flag: '🇨🇭', club: 'Borussia Dortmund' },
  { name: 'Emiliano Martínez', country: 'Argentine', flag: '🇦🇷', club: 'Aston Villa' },
  { name: 'Édouard Mendy', country: 'Sénégal', flag: '🇸🇳', club: 'Al-Ahli' },
  { name: 'David Raya', country: 'Espagne', flag: '🇪🇸', club: 'Arsenal' },
  { name: 'Matvey Safonov', country: 'Russie', flag: '🇷🇺', club: 'Paris-SG' },
  { name: 'Unai Simón', country: 'Espagne', flag: '🇪🇸', club: 'Athletic Bilbao' },
  { name: 'Vozinha', country: 'Cap-Vert', flag: '🇨🇻', club: 'Chaves' },
];

export const NOMINEE_BY_NAME: Record<string, Nominee> = Object.fromEntries(
  [...BALLON_DOR_NOMINEES, ...KOPA_NOMINEES, ...YACHINE_NOMINEES].map((n) => [n.name, n]),
);

export interface BallonDorConfig {
  buy_in: number;
  total_prize_pool: number;
  payout_percentages: { first: number; second: number; third: number };
  official_top10: string[];
  official_kopa: string;
  official_yashin: string;
  deadline_iso: string;
  admin_unlock_iso: string;
}

export interface Pronostic {
  top10: string[];
  kopa: string;
  yashin: string;
  paid?: number;
}

/** Points d'une position donnée (1-based) selon le classement officiel partiel. */
export function positionPoints(player: string, index1: number, official: string[]): number | null {
  const pos = official.findIndex((p) => p && p === player);
  if (pos === -1) return null;
  const off = pos + 1;
  if (off === index1) return 10;
  if (Math.abs(off - index1) === 1) return 5;
  return 2;
}

export function scorePronostic(p: Pronostic, cfg: BallonDorConfig): number {
  const official = cfg.official_top10 || [];
  let total = 0;
  (p.top10 || []).forEach((player, i) => {
    total += positionPoints(player, i + 1, official) ?? 0;
  });
  if (cfg.official_kopa && cfg.official_kopa === p.kopa) total += 5;
  if (cfg.official_yashin && cfg.official_yashin === p.yashin) total += 5;
  return total;
}
