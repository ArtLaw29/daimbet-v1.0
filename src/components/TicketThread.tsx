import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Send, ArrowLeft, CheckCircle } from 'lucide-react';

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender: string;
  content: string;
  created_at: string;
}

interface TicketThreadProps {
  ticketId: string;
  subject: string;
  status: string;
  isAdmin?: boolean;
  onBack: () => void;
  onStatusChange?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ouvert: { label: '🟢 Ouvert', color: 'bg-primary/10 text-primary' },
  en_cours: { label: '🟡 En cours', color: 'bg-yellow-500/10 text-yellow-600' },
  resolu: { label: '✅ Résolu', color: 'bg-muted text-muted-foreground' },
};

export default function TicketThread({ ticketId, subject, status, isAdmin, onBack, onStatusChange }: TicketThreadProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    // Mark as seen by user
    if (!isAdmin && user) {
      supabase.from('tickets').update({ user_last_seen_at: new Date().toISOString() }).eq('id', ticketId).then();
    }

    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${ticketId}` }, () => fetchMessages())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ticketId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const sendMessage = async () => {
    if (!user || !newMessage.trim()) return;
    setSending(true);

    const sender = isAdmin ? 'admin' : 'utilisateur';
    const { error } = await supabase.from('ticket_messages').insert({
      ticket_id: ticketId,
      sender,
      content: newMessage.trim(),
    });

    if (error) {
      toast.error('Erreur d\'envoi');
    } else {
      setNewMessage('');
      // Update ticket status and timestamps
      if (isAdmin) {
        await supabase.from('tickets').update({
          status: 'en_cours' as any,
          admin_replied_at: new Date().toISOString(),
        }).eq('id', ticketId);
      }
      fetchMessages();
      onStatusChange?.();
    }
    setSending(false);
  };

  const resolveTicket = async () => {
    await supabase.from('tickets').update({ status: 'resolu' as any }).eq('id', ticketId);
    toast.success('Ticket résolu ✅');
    onStatusChange?.();
    onBack();
  };

  const statusInfo = STATUS_LABELS[status] || STATUS_LABELS.ouvert;
  const canReply = status !== 'resolu';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border mb-3">
        <button onClick={onBack} className="p-1 hover:bg-secondary rounded">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{subject}</h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
        </div>
        {isAdmin && status !== 'resolu' && (
          <Button size="sm" variant="outline" onClick={resolveTicket} className="text-xs">
            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Résoudre
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 min-h-[200px] max-h-[400px] pr-1">
        {messages.map(msg => {
          const isMe = (isAdmin && msg.sender === 'admin') || (!isAdmin && msg.sender === 'user');
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                isMe
                  ? 'bg-primary/15 text-foreground'
                  : 'bg-secondary text-foreground'
              }`}>
                <p className="text-[10px] text-muted-foreground mb-0.5">
                  {msg.sender === 'admin' ? '🛡️ Admin' : '👤 Toi'} · {new Date(msg.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      {canReply ? (
        <div className="pt-3 border-t border-border mt-3 flex gap-2">
          <Textarea
            placeholder="Écris un message..."
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            rows={2}
            maxLength={1000}
            className="flex-1 text-sm"
          />
          <Button onClick={sendMessage} disabled={!newMessage.trim() || sending} size="icon" className="gold-gradient h-auto">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center pt-3 border-t border-border mt-3">
          Ce ticket est résolu. Crée un nouveau ticket si besoin.
        </p>
      )}
    </div>
  );
}
