import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { MessageSquarePlus, Loader2 } from 'lucide-react';

interface Props {
  /** Target user the admin wants to write to */
  targetUserId: string;
  /** Display label for the recipient (used in dialog title) */
  targetUserName?: string;
  /** Called after the ticket + first message have been created */
  onCreated?: (ticketId: string) => void;
  /** Optional trigger button props */
  buttonLabel?: string;
  buttonSize?: 'sm' | 'default' | 'icon';
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost';
  /** Render only an icon button (no label) */
  iconOnly?: boolean;
}

export default function AdminCreateTicketDialog({
  targetUserId,
  targetUserName,
  onCreated,
  buttonLabel,
  buttonSize = 'sm',
  buttonVariant = 'outline',
  iconOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setSubject(''); setMessage(''); };

  const submit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Sujet et message requis');
      return;
    }
    setSubmitting(true);

    // 1) Create the ticket on behalf of the target user
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .insert({
        user_id: targetUserId,
        subject: subject.trim(),
        status: 'en_cours' as any,
        admin_replied_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (ticketErr || !ticket) {
      setSubmitting(false);
      toast.error('Erreur lors de la création du ticket');
      return;
    }

    // 2) Add the admin's first message
    const { error: msgErr } = await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      sender: 'admin',
      content: message.trim(),
    });

    setSubmitting(false);

    if (msgErr) {
      toast.error('Ticket créé, mais erreur à l\'envoi du message');
      return;
    }

    toast.success('Message envoyé à l\'utilisateur 📩');
    setOpen(false);
    reset();
    onCreated?.(ticket.id);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <Button
        variant={buttonVariant}
        size={iconOnly ? 'icon' : buttonSize}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Envoyer un message"
        className={iconOnly ? 'h-8 w-8' : 'gap-1.5'}
      >
        <MessageSquarePlus className={iconOnly ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
        {!iconOnly && (buttonLabel || 'Envoyer un message')}
      </Button>

      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>📩 Nouveau message {targetUserName ? `à ${targetUserName}` : ''}</DialogTitle>
          <DialogDescription>
            Un nouveau ticket sera créé côté utilisateur. Il recevra une notification et pourra te répondre.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Sujet</label>
            <Input
              placeholder="Ex: Petit point sur ta participation"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Message</label>
            <Textarea
              placeholder="Écris ton message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={1000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Annuler</Button>
          <Button onClick={submit} disabled={submitting || !subject.trim() || !message.trim()} className="gold-gradient">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Envoyer 🚀'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
