import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { getMultiplayerGame } from '@/lib/multiplayer/gameRegistry';
import { Users } from 'lucide-react';

interface Props {
  gameType: string;
  minPlayers?: number;
  maxPlayers?: number;
}

interface RoomRow {
  id: string;
  game_type: string;
  creator_id: string;
  status: string;
  min_players: number;
  max_players: number;
  settings: Record<string, any>;
  created_at: string;
  creator?: { display_name: string | null; emoji: string | null; avatar_url: string | null };
  connected_count?: number;
  total_count?: number;
}

export default function GameLobby({ gameType, minPlayers, maxPlayers }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const def = getMultiplayerGame(gameType);
  const effectiveMin = minPlayers ?? def?.minPlayers ?? 2;
  const effectiveMax = maxPlayers ?? def?.maxPlayers ?? 8;

  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [creating, setCreating] = useState(false);

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from('game_rooms' as any)
      .select('*')
      .eq('game_type', gameType)
      .eq('status', 'waiting')
      .order('created_at', { ascending: false });
    if (error || !data) {
      setRooms([]);
      setLoading(false);
      return;
    }
    const list = data as any as RoomRow[];
    const creatorIds = [...new Set(list.map((r) => r.creator_id))];
    const roomIds = list.map((r) => r.id);
    const [profilesRes, playersRes] = await Promise.all([
      creatorIds.length
        ? supabase
            .from('profiles')
            .select('user_id, display_name, emoji, avatar_url')
            .in('user_id', creatorIds)
        : Promise.resolve({ data: [] as any[] }),
      roomIds.length
        ? supabase
            .from('room_players' as any)
            .select('room_id, is_connected')
            .in('room_id', roomIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const profMap = new Map<string, any>(
      (profilesRes.data ?? []).map((p: any) => [p.user_id, p]),
    );
    const countMap = new Map<string, { total: number; connected: number }>();
    for (const p of (playersRes.data ?? []) as any[]) {
      const cur = countMap.get(p.room_id) ?? { total: 0, connected: 0 };
      cur.total += 1;
      if (p.is_connected) cur.connected += 1;
      countMap.set(p.room_id, cur);
    }
    setRooms(
      list.map((r) => ({
        ...r,
        creator: profMap.get(r.creator_id) ?? undefined,
        total_count: countMap.get(r.id)?.total ?? 0,
        connected_count: countMap.get(r.id)?.connected ?? 0,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchRooms();
    const channel = supabase
      .channel(`lobby:${gameType}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_rooms', filter: `game_type=eq.${gameType}` },
        () => fetchRooms(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players' }, () =>
        fetchRooms(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameType]);

  const createRoom = async () => {
    if (!user) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('game_rooms' as any)
      .insert({
        game_type: gameType,
        creator_id: user.id,
        status: 'waiting',
        min_players: effectiveMin,
        max_players: effectiveMax,
        settings,
      })
      .select('id')
      .single();
    if (error || !data) {
      toast.error("Impossible de créer la partie");
      setCreating(false);
      return;
    }
    const roomId = (data as any).id as string;
    await supabase.from('room_players' as any).insert({ room_id: roomId, user_id: user.id });
    setCreating(false);
    setCreateOpen(false);
    navigate(`/room/${roomId}`);
  };

  const joinRoom = async (room: RoomRow) => {
    if (!user) return;
    if ((room.total_count ?? 0) >= room.max_players) {
      toast.error("Partie complète");
      return;
    }
    // upsert: if already joined, reconnect
    const { error } = await supabase
      .from('room_players' as any)
      .upsert({ room_id: room.id, user_id: user.id, is_connected: true } as any);
    if (error) {
      toast.error("Impossible de rejoindre");
      return;
    }
    navigate(`/room/${room.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl">
            {def?.emoji} {def?.label ?? gameType}
          </h2>
          <p className="text-sm text-muted-foreground">
            {effectiveMin}–{effectiveMax} joueurs
          </p>
        </div>
        <Button
          onClick={() => {
            setSettings({});
            setCreateOpen(true);
          }}
        >
          + Créer une partie
        </Button>
      </div>

      <div>
        <h3 className="font-display text-lg mb-3">Parties en cours dans la promo</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune partie ouverte. Lance la première !
          </p>
        ) : (
          <div className="space-y-3">
            {rooms.map((r) => {
              const full = (r.total_count ?? 0) >= r.max_players;
              const summary = def?.summarizeSettings?.(r.settings ?? {}) ?? '';
              return (
                <Card key={r.id} className="p-4 flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={r.creator?.avatar_url ?? undefined} />
                    <AvatarFallback>{r.creator?.emoji ?? '👤'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {r.creator?.display_name ?? 'Joueur'}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Users className="h-3 w-3" />
                      {r.connected_count}/{r.max_players}
                      {summary && <span>· {summary}</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={full ? 'secondary' : 'default'}
                    disabled={full}
                    onClick={() => joinRoom(r)}
                  >
                    {full ? 'Complet' : 'Rejoindre'}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une partie {def?.label ?? gameType}</DialogTitle>
          </DialogHeader>
          {def?.SettingsForm ? (
            <def.SettingsForm value={settings} onChange={setSettings} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun réglage particulier. Tu pourras lancer la partie une fois{' '}
              {effectiveMin} joueurs présents.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={createRoom} disabled={creating}>
              {creating ? 'Création…' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}