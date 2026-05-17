import SectionTabs from '@/components/SectionTabs';
import SondagePage from '@/components/SondagePage';
import TournoiPage from '@/components/TournoiPage';
import GouvernementPage from '@/components/GouvernementPage';
import FantasyFirmPage from '@/components/FantasyFirmPage';
import KissMarryPage from '@/pages/KissMarryPage';
import GameUnderConstruction from '@/components/GameUnderConstruction';

export default function PromoGamesSection() {
  return (
    <SectionTabs
      title="Jeux de promo"
      titleEmoji="🏛️"
      subtitle="Tous les jeux collectifs de la promo"
      tabs={[
        { key: 'daimocratie',  label: 'Daimocratie',  emoji: '🗳️', render: () => <SondagePage /> },
        { key: 'tournois',     label: 'Tournois',     emoji: '🏆', render: () => <TournoiPage /> },
        { key: 'gouvernement', label: 'Gouvernement', emoji: '🏛️', render: () => <GouvernementPage /> },
        { key: 'fantasy_firm', label: 'Fantasy Firm', emoji: '💼', render: () => <FantasyFirmPage /> },
        { key: 'kiss_marry',   label: 'Kiss / Marry', emoji: '💋', render: () => <KissMarryPage /> },
        { key: 'destins',      label: 'Destins',      emoji: '🔮', render: () => <GameUnderConstruction gameName="Destins" /> },
        { key: 'quizz',        label: 'Quizz',        emoji: '❓', render: () => <GameUnderConstruction gameName="Quizz" /> },
        { key: 'bingo',        label: 'Bingo',        emoji: '🎱', render: () => <GameUnderConstruction gameName="Bingo" /> },
      ]}
    />
  );
}