import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle2, Trash2, Mail, Inbox } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface PublicContact {
  id: string;
  created_at: string;
  nom: string;
  email: string;
  subject: string;
  message: string;
  is_handled: boolean;
}

export default function AdminPublicContacts() {
  const [items, setItems] = useState<PublicContact[]>([]);
  const [filter, setFilter] = useState<'unhandled' | 'all'>('unhandled');
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const { data, error } = await supabase
      .from('public_contact_messages')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Erreur de chargement');
    } else {
      setItems(data as PublicContact[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('public_contact_messages_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'public_contact_messages' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const markHandled = async (id: string, val: boolean) => {
    const { error } = await supabase
      .from('public_contact_messages')
      .update({ is_handled: val })
      .eq('id', id);
    if (error) toast.error('Erreur');
    else {
      toast.success(val ? 'Marqué comme traité' : 'Remis en non-traité');
      fetchAll();
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('public_contact_messages').delete().eq('id', id);
    if (error) toast.error('Erreur');
    else { toast.success('Supprimé'); fetchAll(); }
  };

  const visible = items.filter(i => filter === 'all' || !i.is_handled);
  const unhandledCount = items.filter(i => !i.is_handled).length;

  if (loading) return <div className="text-muted-foreground text-sm">Chargement…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-primary" />
          <span className="text-sm text-muted-foreground">
            {unhandledCount} non-traité{unhandledCount > 1 ? 's' : ''} · {items.length} total
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filter === 'unhandled' ? 'default' : 'outline'}
            onClick={() => setFilter('unhandled')}
          >
            Non-traités
          </Button>
          <Button
            size="sm"
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
          >
            Tous
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          Aucun message.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(item => (
            <div
              key={item.id}
              className={`rounded-lg border p-4 ${
                item.is_handled
                  ? 'border-border bg-card/50 opacity-70'
                  : 'border-primary/30 bg-card card-glow'
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={item.is_handled ? 'secondary' : 'default'}>
                      {item.subject}
                    </Badge>
                    {!item.is_handled && (
                      <Badge variant="destructive" className="text-[10px]">Nouveau</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <div className="font-semibold text-foreground">{item.nom}</div>
                  <a
                    href={`mailto:${item.email}?subject=Re: ${encodeURIComponent(item.subject)}`}
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Mail className="w-3 h-3" /> {item.email}
                  </a>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={item.is_handled ? 'outline' : 'default'}
                    onClick={() => markHandled(item.id, !item.is_handled)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {item.is_handled ? 'Rouvrir' : 'Traité'}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost"><Trash2 className="w-4 h-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer ce message ?</AlertDialogTitle>
                        <AlertDialogDescription>Action irréversible.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(item.id)}>Supprimer</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="mt-3 p-3 bg-secondary/40 rounded text-sm whitespace-pre-wrap break-words">
                {item.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
