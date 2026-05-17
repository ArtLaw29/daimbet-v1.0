import GameUnderConstruction from '@/components/GameUnderConstruction';
import GameStatusGate from '@/components/GameStatusGate';

interface Props { gameKey: string; gameName: string; }

export default function PlaceholderGamePage({ gameKey, gameName }: Props) {
  return (
    <GameStatusGate gameKey={gameKey} label={gameName}>
      <GameUnderConstruction gameName={gameName} />
    </GameStatusGate>
  );
}