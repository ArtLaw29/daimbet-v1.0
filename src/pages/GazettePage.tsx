import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Plus, Smile } from 'lucide-react';
import { INTRO_GAZETTE } from '@/components/TabIntro';
import type { Tables } from '@/integrations/supabase/types';

type GazetteMessage = Tables<'gazette_messages'>;
type GazetteReaction = Tables<'gazette_reactions'>;
type Profile = Tables<'profiles'>;

const QUICK_EMOJIS = ['😂', '🔥', '🦌', '👀', '💀', '❤️', '👏', '😭', '🤡', '💯', '🫡', '🤭'];
const MAX_CHARS = 280;

export default function GazettePage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<GazetteMessage[]>([]);
  const [reactions, setReactions] = useState<GazetteReaction[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [openEmojiPicker, setOpenEmojiPicker] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [msgRes, reactRes] = await Promise.all([
      supabase.from('gazette_messages').select('*').eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('gazette_reactions').select('*'),
    ]);
    setMessages(msgRes.data || []);
    setReactions(reactRes.data || []);
  }, []);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('gazette-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gazette_messages' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gazette_reactions' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const sendMessage = async () => {
    if (!user || !newMessage.trim() || sending) return;
    setSending(true);
    const content = newMessage.trim().slice(0, MAX_CHARS);
    setNewMessage('');

    const { data: msg, error } = await supabase.from('gazette_messages').insert({
      content,
      user_id: user.id,
      is_system_message: false,
    }).select().single();

    if (error) {
      toast.error('Erreur d\'envoi');
      setNewMessage(content);
    } else if (msg) {
      // Fire-and-forget IA pre-flagging
      supabase.functions.invoke('flag-gazette-message', {
        body: { message_id: msg.id, content },
      }).catch(err => console.error('Flag error:', err));
    }
    setSending(false);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find(r => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);

    // Optimistic update
    if (existing) {
      setReactions(prev => prev.filter(r => r.id !== existing.id));
      await supabase.from('gazette_reactions').delete().eq('id', existing.id);
    } else {
      const optimistic: GazetteReaction = {
        id: crypto.randomUUID(),
        message_id: messageId,
        user_id: user.id,
        emoji,
        created_at: new Date().toISOString(),
      };
      setReactions(prev => [...prev, optimistic]);
      await supabase.from('gazette_reactions').insert({ message_id: messageId, user_id: user.id, emoji });
    }
    setOpenEmojiPicker(null);
  };

  const getReactionCounts = (messageId: string) => {
    const msgReactions = reactions.filter(r => r.message_id === messageId);
    const counts: Record<string, { count: number; userReacted: boolean }> = {};
    msgReactions.forEach(r => {
      if (!counts[r.emoji]) counts[r.emoji] = { count: 0, userReacted: false };
      counts[r.emoji].count++;
      if (r.user_id === user?.id) counts[r.emoji].userReacted = true;
    });
    // Sort by count desc
    return Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
  };

  const charsLeft = MAX_CHARS - newMessage.length;

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl pb-24 md:pb-6">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-display gold-text">📰 La Gazette du Daim</h1>
      </div>
      {INTRO_GAZETTE}

      {/* Input — top on desktop */}
      <div className="hidden md:block mb-6">
        {user ? (
          <MessageInput
            value={newMessage}
            onChange={setNewMessage}
            onSubmit={sendMessage}
            sending={sending}
            charsLeft={charsLeft}
            maxChars={MAX_CHARS}
          />
        ) : (
          <p className="text-center text-sm text-muted-foreground py-3">Connecte-toi pour participer 🦌</p>
        )}
      </div>

      {/* Messages feed — newest first */}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {messages.map(msg => {
            const isSystem = msg.is_system_message;
            const reactionEntries = getReactionCounts(msg.id);

            return (
              <motion.div key={msg.id}
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                layout>

                {isSystem ? (
                  <div className="text-center">
                    <div className="inline-block bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5 text-sm text-primary max-w-[90%]">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-card border border-border p-4">
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                )}

                {/* Reactions bar */}
                <div className={`flex flex-wrap items-center gap-1.5 mt-1.5 ${isSystem ? 'justify-center' : ''}`}>
                  {reactionEntries.map(([emoji, { count, userReacted }]) => (
                    <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                      className={`text-xs px-2 py-1 rounded-full border transition-all ${
                        userReacted
                          ? 'border-primary bg-primary/10 font-semibold'
                          : 'border-border bg-secondary/50 hover:border-primary/30'
                      }`}>
                      {emoji} <span className="ml-0.5">{count}</span>
                    </button>
                  ))}

                  {/* Add reaction button */}
                  {user && (
                    <div className="relative">
                      <button
                        onClick={() => setOpenEmojiPicker(openEmojiPicker === msg.id ? null : msg.id)}
                        className="text-xs px-2 py-1 rounded-full border border-border bg-secondary/50 hover:border-primary/30 transition-colors flex items-center gap-0.5">
                        <Smile className="w-3 h-3" />
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                      {openEmojiPicker === msg.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenEmojiPicker(null)} />
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                            className="absolute bottom-full left-0 mb-2 flex flex-wrap gap-1 bg-card border border-border rounded-xl p-2 shadow-xl z-20 w-48">
                            {QUICK_EMOJIS.map(emoji => (
                              <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                                className="text-lg hover:scale-125 transition-transform p-1 rounded hover:bg-secondary">
                                {emoji}
                              </button>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {messages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg">Le fil d'actualité est vide...</p>
            <p className="text-sm mt-1">Sois le premier à écrire dans La Gazette 🦌</p>
          </div>
        )}
      </div>

      {/* Input — bottom on mobile (fixed) */}
      {user && (
        <div className="fixed bottom-16 left-0 right-0 md:hidden bg-background/95 backdrop-blur-sm border-t border-border p-3 z-20">
          <MessageInput
            value={newMessage}
            onChange={setNewMessage}
            onSubmit={sendMessage}
            sending={sending}
            charsLeft={charsLeft}
            maxChars={MAX_CHARS}
          />
        </div>
      )}
    </div>
  );
}

function MessageInput({
  value, onChange, onSubmit, sending, charsLeft, maxChars,
}: {
  value: string; onChange: (v: string) => void; onSubmit: () => void;
  sending: boolean; charsLeft: number; maxChars: number;
}) {
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(); }}
      className="flex gap-2 items-end bg-card border border-border rounded-2xl p-2">
      <div className="flex-1 relative">
        <textarea
          placeholder="Écris un message..."
          value={value}
          onChange={e => { if (e.target.value.length <= maxChars) onChange(e.target.value); }}
          rows={1}
          disabled={sending}
          className="w-full bg-transparent text-sm px-3 py-2 resize-none focus:outline-none placeholder:text-muted-foreground disabled:opacity-50"
          style={{ minHeight: '36px', maxHeight: '100px' }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
          onInput={e => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = Math.min(t.scrollHeight, 100) + 'px';
          }}
        />
        <span className={`absolute bottom-1 right-2 text-[10px] ${charsLeft < 30 ? (charsLeft < 0 ? 'text-destructive' : 'text-amber-500') : 'text-muted-foreground/50'}`}>
          {charsLeft}
        </span>
      </div>
      <Button type="submit" size="icon" disabled={!value.trim() || sending} className="rounded-xl shrink-0 h-9 w-9">
        <Send className="w-4 h-4" />
      </Button>
    </form>
  );
}
