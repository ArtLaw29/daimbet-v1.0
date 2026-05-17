import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';

interface Msg {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface Profile {
  user_id: string;
  display_name: string | null;
  emoji: string | null;
}

export default function RoomChat({ roomId }: { roomId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadProfiles = async (ids: string[]) => {
    const missing = ids.filter((id) => !profiles[id]);
    if (missing.length === 0) return;
    const { data } = await supabase
      .from('profiles')
      .select('user_id, display_name, emoji')
      .in('user_id', missing);
    if (data) {
      setProfiles((prev) => {
        const next = { ...prev };
        for (const p of data as any[]) next[p.user_id] = p;
        return next;
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('room_chat_messages' as any)
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      const list = (data ?? []) as any as Msg[];
      setMessages(list);
      await loadProfiles([...new Set(list.map((m) => m.user_id))]);
    })();
    const channel = supabase
      .channel(`room-chat:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const msg = payload.new as any as Msg;
          setMessages((prev) => [...prev, msg]);
          await loadProfiles([msg.user_id]);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = async () => {
    const v = text.trim();
    if (!v || !user) return;
    setText('');
    await supabase
      .from('room_chat_messages' as any)
      .insert({ room_id: roomId, user_id: user.id, content: v });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">Aucun message pour le moment.</p>
        )}
        {messages.map((m) => {
          const p = profiles[m.user_id];
          const mine = m.user_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                  mine ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                {!mine && (
                  <div className="text-[10px] opacity-70 mb-0.5">
                    {p?.emoji} {p?.display_name ?? 'Joueur'}
                  </div>
                )}
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t p-2 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message…"
          maxLength={500}
        />
        <Button size="icon" onClick={send} disabled={!text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}