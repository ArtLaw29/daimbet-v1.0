import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Send } from 'lucide-react';
import { INTRO_GAZETTE } from '@/components/TabIntro';
import type { Tables } from '@/integrations/supabase/types';

type GazetteMessage = Tables<'gazette_messages'>;
type GazetteReaction = Tables<'gazette_reactions'>;
type Profile = Tables<'profiles'>;

const REACTION_EMOJIS = ['😂', '🔥', '🦌', '👀', '💀', '❤️'];

export default function GazettePage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<GazetteMessage[]>([]);
  const [reactions, setReactions] = useState<GazetteReaction[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchAll = async () => {
    const [msgRes, reactRes, profRes] = await Promise.all([
      supabase.from('gazette_messages').select('*').eq('is_deleted', false).order('created_at', { ascending: true }),
      supabase.from('gazette_reactions').select('*'),
      supabase.from('profiles').select('user_id, display_name, emoji'),
    ]);
    setMessages(msgRes.data || []);
    setReactions(reactRes.data || []);
    setProfiles(profRes.data || []);
  };

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('gazette-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gazette_messages' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gazette_reactions' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getAuthorName = (userId: string | null) => {
    if (!userId) return '🤖 Jordaim Belfort';
    const p = profiles.find(pr => pr.user_id === userId);
    return p ? `${p.emoji || '🦌'} ${p.display_name}` : 'Anonyme';
  };

  const sendMessage = async () => {
    if (!user || !newMessage.trim() || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    const { data: msg, error } = await supabase.from('gazette_messages').insert({
      content,
      user_id: user.id,
      is_system_message: false,
    }).select().single();

    if (error) {
      toast.error('Erreur d\'envoi');
      setNewMessage(content);
      setSending(false);
      return;
    }

    // Async IA pre-flagging (fire and forget)
    if (msg) {
      supabase.functions.invoke('flag-gazette-message', {
        body: { message_id: msg.id, content },
      }).catch(err => console.error('Flag error:', err));
    }

    setSending(false);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find(r => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from('gazette_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('gazette_reactions').insert({ message_id: messageId, user_id: user.id, emoji });
    }
  };

  const getReactionCounts = (messageId: string) => {
    const msgReactions = reactions.filter(r => r.message_id === messageId);
    const counts: Record<string, { count: number; userReacted: boolean }> = {};
    msgReactions.forEach(r => {
      if (!counts[r.emoji]) counts[r.emoji] = { count: 0, userReacted: false };
      counts[r.emoji].count++;
      if (r.user_id === user?.id) counts[r.emoji].userReacted = true;
    });
    return counts;
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl pb-20 md:pb-6 flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
      <div className="text-center mb-4">
        <h1 className="text-3xl font-display gold-text">📰 La Gazette du Daim</h1>
      </div>
      {INTRO_GAZETTE}

      {/* Messages feed */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
        <AnimatePresence initial={false}>
          {messages.map(msg => {
            const isOwn = msg.user_id === user?.id;
            const isSystem = msg.is_system_message;
            const reactionCounts = getReactionCounts(msg.id);

            return (
              <motion.div key={msg.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`${isSystem ? 'text-center' : ''}`}>

                {isSystem ? (
                  <div className="inline-block bg-primary/10 border border-primary/20 rounded-xl px-4 py-2 text-sm text-primary">
                    {msg.content}
                  </div>
                ) : (
                  <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      isOwn ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-secondary border border-border rounded-bl-sm'
                    }`}>
                      {!isOwn && (
                        <p className="text-xs font-semibold mb-0.5 opacity-70">{getAuthorName(msg.user_id)}</p>
                      )}
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${isOwn ? 'text-primary-foreground/50' : 'text-muted-foreground'}`}>
                        {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Reactions */}
                <div className={`flex flex-wrap gap-1 mt-1 ${isSystem ? 'justify-center' : isOwn ? 'justify-end' : 'justify-start'}`}>
                  {Object.entries(reactionCounts).map(([emoji, { count, userReacted }]) => (
                    <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                      className={`text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
                        userReacted ? 'border-primary bg-primary/10' : 'border-border bg-secondary/50 hover:border-primary/30'
                      }`}>
                      {emoji} {count}
                    </button>
                  ))}
                  {/* Add reaction */}
                  {!isSystem && user && (
                    <div className="relative group">
                      <button className="text-xs px-1.5 py-0.5 rounded-full border border-border bg-secondary/50 opacity-0 group-hover:opacity-100 transition-opacity hover:border-primary/30">+</button>
                      <div className="absolute bottom-full left-0 mb-1 hidden group-hover:flex gap-1 bg-card border border-border rounded-lg p-1 shadow-lg z-10">
                        {REACTION_EMOJIS.map(emoji => (
                          <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                            className="text-sm hover:scale-125 transition-transform p-0.5">{emoji}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {user ? (
        <form onSubmit={e => { e.preventDefault(); sendMessage(); }}
          className="flex gap-2 bg-card border border-border rounded-2xl p-2">
          <Input placeholder="Écris un message..." value={newMessage} onChange={e => setNewMessage(e.target.value)}
            maxLength={500} className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0" disabled={sending} />
          <Button type="submit" size="icon" disabled={!newMessage.trim() || sending} className="rounded-xl shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-3">Connecte-toi pour participer 🦌</p>
      )}
    </div>
  );
}
