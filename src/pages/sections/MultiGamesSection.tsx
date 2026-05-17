import SectionTabs from '@/components/SectionTabs';
import GameUnderConstruction from '@/components/GameUnderConstruction';
import GameLobby from '@/components/multiplayer/GameLobby';
import '@/lib/multiplayer/games/uno';

export default function MultiGamesSection() {
  return (
    <SectionTabs
      title="Jeux"
      titleEmoji="🎮"
      subtitle="Les grands jeux multijoueurs"
      tabs={[
        { key: 'loup_garou', label: 'Loup-Garou Daim (6-20 joueurs)', emoji: '🐺', render: () => <GameUnderConstruction gameName="Loup-Garou Daim" /> },
        { key: 'monopoly',   label: 'Monopoly Daim (3-6 joueurs)',    emoji: '🏘️', render: () => <GameUnderConstruction gameName="Monopoly Daim" /> },
        { key: 'uno',        label: 'Uno (2-8 joueurs)',              emoji: '🃏', render: () => <GameLobby gameType="uno" minPlayers={2} maxPlayers={8} /> },
      ]}
    />
  );
}