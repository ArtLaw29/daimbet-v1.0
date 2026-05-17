import SectionTabs from '@/components/SectionTabs';
import BlackjackPage from '@/pages/BlackjackPage';
import GameUnderConstruction from '@/components/GameUnderConstruction';

export default function CasinoSection() {
  return (
    <SectionTabs
      title="Casino"
      titleEmoji="🎰"
      subtitle="Mise tes DAIMcoins contre la maison"
      tabs={[
        { key: 'blackjack',      label: 'Blackjack',      emoji: '🂡', render: () => <BlackjackPage /> },
        { key: 'machine_a_sous', label: 'Machine à sous', emoji: '🎰', render: () => <GameUnderConstruction gameName="Machine à sous" /> },
        { key: 'poker',          label: 'Poker',          emoji: '♠️', render: () => <GameUnderConstruction gameName="Poker" /> },
        { key: 'roulette',       label: 'Roulette',       emoji: '🎡', render: () => <GameUnderConstruction gameName="Roulette" /> },
      ]}
    />
  );
}