import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2 } from 'lucide-react';
import { KIND_LABELS, type ProposalKind } from '@/lib/proposals';

interface Props {
  kind: ProposalKind;
  /** Triggered after successful submit */
  onSubmitted?: () => void;
  /** Optional CTA label */
  buttonLabel?: string;
  /** Variant for the trigger button */
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost';
}

export default function ProposeNewDialog({ kind, onSubmitted, buttonLabel, buttonVariant = 'outline' }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const label = KIND_LABELS[kind];
  const showOptions = kind === 'sondage' || kind === 'tournoi';
  const isBet = kind === 'bet';

  const submit = async () => {
    if (!user || !title.trim()) {
      toast.error('Donne un titre');
      return;
    }
    setSubmitting(true);

    const options = showOptions
      ? optionsText.split('\n').map((o) => o.trim()).filter(Boolean).map((label) => ({ label }))
      : [];

    const payload: Record<string, unknown> = {};
    if (kind === 'sondage') payload.config = { format: 'simple', options: options.map((o) => o.label) };
    else if (kind === 'tournoi') payload.config = { options: options.map((o) => o.label) };

    const { error } = await supabase.from('daimocratie_proposals').insert({
      title: title.trim(),
      user_id: user.id,
      proposal_kind: kind,
      payload,
      options_json: options.length > 0 ? (options as any) : null,
      status: 'en_attente',
    } as any);

    setSubmitting(false);

    if (error) {
      toast.error('Erreur lors de la soumission');
      return;
    }

    toast.success(`Proposition envoyée ! En attente de validation (10 👍 ou admin) 🗳️`);
    setTitle('');
    setOptionsText('');
    setOpen(false);
    onSubmitted?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={buttonVariant} size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="w-4 h-4" />
        {buttonLabel || `Proposer un ${label.singular}`}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label.emoji} Proposer un nouveau {label.singular}</DialogTitle>
          <DialogDescription>
            Ta proposition sera visible par tous (avec ton prénom). Elle sera publiée si elle atteint 10 👍 (et moins de 3 👎), ou si l'admin la valide.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Titre / question</label>
            <Input
              placeholder="Ex: Qui finira premier au Bachelor de fin d'année ?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          {showOptions && (
            <div>
              <label className="text-xs font-medium mb-1 block">
                Options (une par ligne) {kind === 'bet' ? '— laisse vide pour OUI/NON' : ''}
              </label>
              <Textarea
                placeholder={'Option 1\nOption 2\nOption 3'}
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={4}
                maxLength={1000}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Annuler</Button>
          <Button onClick={submit} disabled={submitting || !title.trim()} className="gold-gradient">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Soumettre 🚀'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
