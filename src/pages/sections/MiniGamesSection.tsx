import SectionTabs from '@/components/SectionTabs';
import WordlePage from '@/pages/WordlePage';
import SudokuPage from '@/pages/SudokuPage';
import MotsFlechesPage from '@/pages/MotsFlechesPage';
import DuelsPage from '@/pages/DuelsPage';
import { useGameStatus } from '@/hooks/useGameStatus';
import { useAuth } from '@/contexts/AuthContext';
import SectionSuspendedMessage from '@/components/SectionSuspendedMessage';

export default function MiniGamesSection() {
  const { suspended } = useGameStatus('section_mini_jeux');
  const { isAdmin } = useAuth();
  if (suspended && !isAdmin) return <SectionSuspendedMessage />;
  return (
    <SectionTabs
      title="Mini-jeux"
      titleEmoji="🧩"
      subtitle="Défis quotidiens et duels rapides"
      tabs={[
        { key: 'wordle',       label: 'Wordle ×6',    emoji: '🔤', render: () => <WordlePage /> },
        { key: 'sudoku',       label: 'Sudoku',       emoji: '🔢', render: () => <SudokuPage /> },
        { key: 'mots_fleches', label: 'Mots fléchés', emoji: '📝', render: () => <MotsFlechesPage /> },
        { key: 'pendu',        label: 'Pendu',        emoji: '🪢', render: () => <DuelsPage /> },
        { key: 'echecs',       label: 'Échecs',       emoji: '♟️', render: () => <DuelsPage /> },
        { key: 'puissance4',   label: 'Puissance 4',  emoji: '🔴', render: () => <DuelsPage /> },
      ]}
    />
  );
}