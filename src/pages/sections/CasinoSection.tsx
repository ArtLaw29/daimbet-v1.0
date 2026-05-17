import SectionTabs from '@/components/SectionTabs';
import BlackjackPage from '@/pages/BlackjackPage';
import RoulettePage from '@/pages/RoulettePage';
import SlotMachinePage from '@/pages/SlotMachinePage';
import GameLobby from '@/components/multiplayer/GameLobby';
import '@/lib/multiplayer/games/poker';

export default function CasinoSection() {
  return (
    <SectionTabs
      title="Casino"
      titleEmoji="🎰"
      subtitle="Mise tes DAIMcoins contre la maison"
      tabs={[
        { key: 'blackjack',      label: 'Blackjack',      emoji: '🂡', render: () => <BlackjackPage /> },
        { key: 'machine_a_sous', label: 'Machine à sous', emoji: '🎰', render: () => <SlotMachinePage /> },
        { key: 'poker',          label: 'Poker',          emoji: '♠️', render: () => <GameLobby gameType="poker" minPlayers={2} maxPlayers={8} /> },
        { key: 'roulette',       label: 'Roulette',       emoji: '🎡', render: () => <RoulettePage /> },
      ]}
    />
  );
}