import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const GAME_LABELS: Record<string, string> = {
  pendu: 'Pendu',
  puissance4: 'Puissance 4',
  echecs: 'Échecs',
};

const GAME_ROUTES: Record<string, string> = {
  pendu: '/jeux/pendu',
  puissance4: '/jeux/puissance4',
  echecs: '/jeux/echecs',
};

export default function ResumeGameBanner() {
  const { user } = useAuth();
  const location = useLocation();
  const [session, setSession] = useState<{ id: string; game_type: string } | null>(null);

  const fetchSession = async (uid: string) => {
    const { data } = await supabase
      .from('games_sessions')
      .select('id, game_type, status, player1_id, player2_id')
      .eq('status', 'en_cours')
      .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setSession(data ? { id: data.id, game_type: data.game_type } : null);
  };

  useEffect(() => {
    if (!user) { setSession(null); return; }
    fetchSession(user.id);
    const ch = supabase
      .channel(`resume-banner-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games_sessions' }, () => fetchSession(user.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!session || !user) return null;
  const route = `${GAME_ROUTES[session.game_type] || '/jeux/duels'}/${session.id}`;
  // Hide if already on the game's page
  if (location.pathname === route) return null;

  const label = GAME_LABELS[session.game_type] || session.game_type;

  return (
    <Link
      to={route}
      className="block bg-primary/10 border-b border-primary/30 hover:bg-primary/20 transition-colors"
    >
      <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-foreground">
          <Play className="w-4 h-4 text-primary" />
          Tu as une partie de <b>{label}</b> en cours
        </span>
        <span className="text-primary font-semibold whitespace-nowrap">Reprendre →</span>
      </div>
    </Link>
  );
}