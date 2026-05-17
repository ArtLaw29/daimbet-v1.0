import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import { MessageSquare, LogOut, Play, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getMultiplayerGame } from '@/lib/multiplayer/gameRegistry';
import RoomChat from './RoomChat';
import { useIsMobile } from '@/hooks/use-mobile';

interface RoomRow {
  id: string;
  game_type: string;
  creator_id: string;
  status: 'waiting' | 'in_progress' | 'finished';
  min_players: number;
  max_players: number;
  settings: Record<string, any>;
  finished_at: string | null;
}

interface PlayerRow {
  room_id: string;
  user_id: string;
  is_connected: boolean;
  joined_at: string;
}

interface ProfileLite {
  user_id: string;
  display_name: string | null;
  emoji: string | null;
  avatar_url: string | null;
}

export default function GameRoom({ roomId }: { roomId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  const def = room ? getMultiplayerGame(room.game_type) : undefined;

  // Fetch room + players
  const refreshAll = async () => {
    const [roomRes, playersRes] = await Promise.all([
      supabase.from('game_rooms' as any).select('*').eq('id', roomId).maybeSingle(),
      supabase.from('room_players' as any).select('*').eq('room_id', roomId),
    ]);
    if (roomRes.data) setRoom(roomRes.data as any);
    const pls = ((playersRes.data ?? []) as any[]) as PlayerRow[];
    setPlayers(pls);
    const ids = pls.map((p) => p.user_id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, emoji, avatar_url')
        .in('user_id', ids);
      const map: Record<string, ProfileLite> = {};
      for (const p of (profs ?? []) as any[]) map[p.user_id] = p;
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` },
        () => refreshAll(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        () => refreshAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Presence
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`presence:room:${roomId}`, {
      config: { presence: { key: user.id } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, any[]>;
        const map: Record<string, boolean> = {};
        for (const uid of Object.keys(state)) map[uid] = true;
        setPresenceMap(map);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ at: Date.now() });
          // Mark connected in DB as well (best-effort)
          await supabase
            .from('room_players' as any)
            .update({ is_connected: true } as any)
            .eq('room_id', roomId)
            .eq('user_id', user.id);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, user?.id]);

  const connectedCount = useMemo(
    () => players.filter((p) => presenceMap[p.user_id] || p.is_connected).length,
    [players, presenceMap],
  );

  const isCreator = !!user && !!room && room.creator_id === user.id;
  const amInRoom = !!user && players.some((p) => p.user_id === user.id);

  const leaveRoom = async () => {
    if (!user) return;
    await supabase
      .from('room_players' as any)
      .update({ is_connected: false } as any)
      .eq('room_id', roomId)
      .eq('user_id', user.id);
    navigate(-1);
  };

  const startGame = async () => {
    if (!room || !isCreator) return;
    if (connectedCount < room.min_players) {
      toast.error(`Il faut au moins ${room.min_players} joueurs connectés`);
      return;
    }
    const { error } = await supabase
      .from('game_rooms' as any)
      .update({ status: 'in_progress', started_at: new Date().toISOString() } as any)
      .eq('id', roomId);
    if (error) toast.error("Impossible de lancer la partie");
  };

  if (loading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Chargement…</div>;
  }
  if (!room) {
    return <div className="p-6 text-center">Partie introuvable.</div>;
  }
  if (!amInRoom) {
    return (
      <div className="p-6 text-center space-y-3">
        <p>Tu ne fais pas partie de cette partie.</p>
        <Button onClick={() => navigate(-1)}>Retour</Button>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl">
            {def?.emoji} {def?.label ?? room.game_type}
          </h1>
          <p className="text-xs text-muted-foreground">
            {room.status === 'waiting' && 'En attente de joueurs'}
            {room.status === 'in_progress' && 'Partie en cours'}
            {room.status === 'finished' && 'Partie terminée'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sheet open={chatOpen} onOpenChange={setChatOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <MessageSquare className="h-4 w-4 mr-1" /> Chat
              </Button>
            </SheetTrigger>
            <SheetContent side={isMobile ? 'bottom' : 'right'} className="p-0 flex flex-col">
              <SheetHeader className="p-4 border-b">
                <SheetTitle>Chat de la partie</SheetTitle>
              </SheetHeader>
              <div className="flex-1 min-h-0">
                <RoomChat roomId={roomId} />
              </div>
            </SheetContent>
          </Sheet>
          <Button variant="ghost" size="sm" onClick={leaveRoom}>
            <LogOut className="h-4 w-4 mr-1" /> Quitter
          </Button>
        </div>
      </div>

      {/* Players panel */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {connectedCount}/{room.max_players} connectés
        </div>
        <div className="flex flex-wrap gap-3">
          {players.map((p) => {
            const prof = profiles[p.user_id];
            const online = presenceMap[p.user_id] || p.is_connected;
            return (
              <div key={p.user_id} className="flex items-center gap-2">
                <div className="relative">
                  <Avatar className={`h-8 w-8 ${online ? '' : 'opacity-50 grayscale'}`}>
                    <AvatarImage src={prof?.avatar_url ?? undefined} />
                    <AvatarFallback>{prof?.emoji ?? '👤'}</AvatarFallback>
                  </Avatar>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                      online ? 'bg-green-500' : 'bg-muted-foreground'
                    }`}
                  />
                </div>
                <span className="text-xs">{prof?.display_name ?? 'Joueur'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {room.status === 'waiting' && (
          <div className="p-6 text-center space-y-4">
            <p className="text-muted-foreground">
              En attente de joueurs… ({connectedCount}/{room.min_players} min)
            </p>
            {isCreator && (
              <Button onClick={startGame} disabled={connectedCount < room.min_players}>
                <Play className="h-4 w-4 mr-1" /> Lancer la partie
              </Button>
            )}
          </div>
        )}
        {room.status === 'in_progress' && def && def.renderGame({ roomId })}
        {room.status === 'in_progress' && !def && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Jeu « {room.game_type} » non implémenté.
          </div>
        )}
        {room.status === 'finished' && (
          <div className="p-6 text-center space-y-4">
            <h2 className="font-display text-2xl">Partie terminée</h2>
            <Button onClick={() => navigate(-1)}>Retour au lobby</Button>
          </div>
        )}
      </div>
    </div>
  );
}