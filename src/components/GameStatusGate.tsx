import { useGameStatus } from '@/hooks/useGameStatus';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

interface Props {
  gameKey: string;
  label: string;
  children: React.ReactNode;
}

export default function GameStatusGate({ gameKey, label, children }: Props) {
  const { suspended, hidden, loading } = useGameStatus(gameKey);
  const { isAdmin } = useAuth();

  if (loading) return null;

  if (hidden && !isAdmin) {
    return <Navigate to="/paris" replace />;
  }

  if (suspended && !isAdmin) {
    return (
      <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center text-center gap-4 min-h-[60vh]">
        <div className="text-7xl">⏸️</div>
        <h1 className="font-display text-2xl gold-text">{label}</h1>
        <p className="text-muted-foreground text-lg max-w-md">
          Jeu temporairement suspendu par l'administration.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}