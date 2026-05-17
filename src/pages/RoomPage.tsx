import { useParams } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import GameRoom from '@/components/multiplayer/GameRoom';

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  if (!roomId) return null;
  return (
    <>
      <Navbar />
      <GameRoom roomId={roomId} />
    </>
  );
}