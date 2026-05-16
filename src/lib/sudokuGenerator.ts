// Sudoku generator using backtracking.
// Returns a fully solved 9x9 grid and a puzzle with holes based on difficulty.

export type SudokuDifficulty = 'facile' | 'moyen' | 'difficile';

export interface SudokuPuzzle {
  puzzle: number[]; // 81 cells, 0 = empty
  solution: number[]; // 81 cells, 1-9
  difficulty: SudokuDifficulty;
  cluesCount: number;
}

const SIZE = 9;

const idx = (r: number, c: number) => r * SIZE + c;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isValid(grid: number[], row: number, col: number, val: number): boolean {
  for (let i = 0; i < SIZE; i++) {
    if (grid[idx(row, i)] === val) return false;
    if (grid[idx(i, col)] === val) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (grid[idx(r, c)] === val) return false;
    }
  }
  return true;
}

function fillGrid(grid: number[]): boolean {
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0) {
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
        if (isValid(grid, r, c, n)) {
          grid[i] = n;
          if (fillGrid(grid)) return true;
          grid[i] = 0;
        }
      }
      return false;
    }
  }
  return true;
}

// Count solutions up to a cap (used to check uniqueness when removing cells).
function countSolutions(grid: number[], cap = 2): number {
  let count = 0;
  const solve = (g: number[]): void => {
    if (count >= cap) return;
    for (let i = 0; i < 81; i++) {
      if (g[i] === 0) {
        const r = Math.floor(i / SIZE);
        const c = i % SIZE;
        for (let n = 1; n <= 9; n++) {
          if (isValid(g, r, c, n)) {
            g[i] = n;
            solve(g);
            g[i] = 0;
            if (count >= cap) return;
          }
        }
        return;
      }
    }
    count++;
  };
  solve([...grid]);
  return count;
}

const CLUES_BY_DIFFICULTY: Record<SudokuDifficulty, number> = {
  facile: 42,
  moyen: 34,
  difficile: 26,
};

export function generateSudoku(difficulty: SudokuDifficulty = 'moyen'): SudokuPuzzle {
  const solution = new Array(81).fill(0);
  fillGrid(solution);

  const target = CLUES_BY_DIFFICULTY[difficulty];
  const toRemove = 81 - target;

  const puzzle = [...solution];
  const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));

  let removed = 0;
  for (const pos of positions) {
    if (removed >= toRemove) break;
    const backup = puzzle[pos];
    puzzle[pos] = 0;
    // For "difficile" we skip uniqueness check on some cells to speed up;
    // for facile/moyen we enforce a unique solution.
    if (difficulty === 'difficile' && removed > toRemove - 10) {
      removed++;
      continue;
    }
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[pos] = backup;
    } else {
      removed++;
    }
  }

  const cluesCount = puzzle.filter((v) => v !== 0).length;
  return { puzzle, solution, difficulty, cluesCount };
}
