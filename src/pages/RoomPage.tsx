import { useParams } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import GameRoom from '@/components/multiplayer/GameRoom';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  if (!roomId) return null;
  return (
    <>
      <Navbar />
      <ErrorBoundary label="GameRoom">
        <GameRoom roomId={roomId} />
      </ErrorBoundary>
    </>
  );
}