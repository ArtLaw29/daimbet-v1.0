// Mots fléchés (crossword-style) grid generator.
// Prioritises admin-provided suggestions, then fills compatible slots.

export type MotsFlechesDifficulty = 'facile' | 'moyen' | 'difficile';

export interface MotSuggestion {
  mot: string;
  definition: string;
}

export type CellType = 'lettre' | 'definition' | 'vide';

export interface MotsFlechesCell {
  type: CellType;
  letter?: string; // uppercase, when type = 'lettre'
  definitions?: {
    horizontal?: string;
    vertical?: string;
  }; // when type = 'definition'
}

export interface PlacedWord {
  mot: string;
  definition: string;
  row: number;
  col: number;
  direction: 'H' | 'V';
  definitionCell: { row: number; col: number };
}

export interface MotsFlechesGrid {
  size: number;
  difficulty: MotsFlechesDifficulty;
  cells: MotsFlechesCell[][]; // [row][col]
  words: PlacedWord[];
}

const SIZE_BY_DIFFICULTY: Record<MotsFlechesDifficulty, number> = {
  facile: 8,
  moyen: 10,
  difficile: 12,
};

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

function makeEmptyGrid(size: number): MotsFlechesCell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ type: 'vide' as CellType }))
  );
}

// A word placed at (row,col) in direction dir occupies cells starting one step
// after the definition cell (which holds the clue arrow).
// Returns true if placement is compatible with already-placed letters.
function canPlace(
  cells: MotsFlechesCell[][],
  size: number,
  word: string,
  defRow: number,
  defCol: number,
  dir: 'H' | 'V'
): boolean {
  // Definition cell itself must be free or already a definition cell with a free slot in this direction.
  const defCell = cells[defRow][defCol];
  if (defCell.type === 'lettre') return false;
  if (defCell.type === 'definition' && defCell.definitions?.[dir === 'H' ? 'horizontal' : 'vertical']) {
    return false;
  }

  for (let i = 0; i < word.length; i++) {
    const r = defRow + (dir === 'V' ? i + 1 : 0);
    const c = defCol + (dir === 'H' ? i + 1 : 0);
    if (r < 0 || c < 0 || r >= size || c >= size) return false;
    const cell = cells[r][c];
    if (cell.type === 'definition') return false;
    if (cell.type === 'lettre' && cell.letter !== word[i]) return false;
  }
  // The cell right after the word must not be a letter (avoid running into another word).
  const endR = defRow + (dir === 'V' ? word.length + 1 : 0);
  const endC = defCol + (dir === 'H' ? word.length + 1 : 0);
  if (endR < size && endC < size) {
    const after = cells[endR]?.[endC];
    if (after && after.type === 'lettre') return false;
  }
  return true;
}

function placeWord(
  cells: MotsFlechesCell[][],
  word: string,
  definition: string,
  defRow: number,
  defCol: number,
  dir: 'H' | 'V'
): PlacedWord {
  const defCell = cells[defRow][defCol];
  cells[defRow][defCol] = {
    type: 'definition',
    definitions: {
      ...(defCell.type === 'definition' ? defCell.definitions : {}),
      [dir === 'H' ? 'horizontal' : 'vertical']: definition,
    },
  };
  for (let i = 0; i < word.length; i++) {
    const r = defRow + (dir === 'V' ? i + 1 : 0);
    const c = defCol + (dir === 'H' ? i + 1 : 0);
    cells[r][c] = { type: 'lettre', letter: word[i] };
  }
  return {
    mot: word,
    definition,
    row: defRow + (dir === 'V' ? 1 : 0),
    col: defCol + (dir === 'H' ? 1 : 0),
    direction: dir,
    definitionCell: { row: defRow, col: defCol },
  };
}

// Score a candidate placement by counting letter overlaps with existing letters.
function scorePlacement(
  cells: MotsFlechesCell[][],
  word: string,
  defRow: number,
  defCol: number,
  dir: 'H' | 'V'
): number {
  let overlaps = 0;
  for (let i = 0; i < word.length; i++) {
    const r = defRow + (dir === 'V' ? i + 1 : 0);
    const c = defCol + (dir === 'H' ? i + 1 : 0);
    if (cells[r][c].type === 'lettre' && cells[r][c].letter === word[i]) overlaps++;
  }
  return overlaps;
}

function tryPlaceSuggestion(
  cells: MotsFlechesCell[][],
  size: number,
  suggestion: MotSuggestion,
  isFirst: boolean
): PlacedWord | null {
  const word = normalize(suggestion.mot);
  if (!word || word.length < 2 || word.length >= size) return null;

  type Candidate = { defRow: number; defCol: number; dir: 'H' | 'V'; score: number };
  const candidates: Candidate[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const dir of ['H', 'V'] as const) {
        if (canPlace(cells, size, word, r, c, dir)) {
          const score = scorePlacement(cells, word, r, c, dir);
          if (isFirst || score > 0 || cells.every((row) => row.every((cell) => cell.type === 'vide'))) {
            candidates.push({ defRow: r, defCol: c, dir, score });
          }
        }
      }
    }
  }

  if (!candidates.length) return null;
  // Prefer placements with most overlaps; fall back to anything for the first word.
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return placeWord(cells, word, suggestion.definition, best.defRow, best.defCol, best.dir);
}

export function generateMotsFleches(
  difficulty: MotsFlechesDifficulty,
  suggestions: MotSuggestion[]
): MotsFlechesGrid {
  const size = SIZE_BY_DIFFICULTY[difficulty];
  const cells = makeEmptyGrid(size);
  const placed: PlacedWord[] = [];

  // Priority: admin suggestions first, longest first for better backbone.
  const sorted = [...suggestions]
    .filter((s) => s && s.mot && s.definition)
    .sort((a, b) => normalize(b.mot).length - normalize(a.mot).length);

  let first = true;
  for (const sug of sorted) {
    const placedWord = tryPlaceSuggestion(cells, size, sug, first);
    if (placedWord) {
      placed.push(placedWord);
      first = false;
    }
  }

  return {
    size,
    difficulty,
    cells,
    words: placed,
  };
}
