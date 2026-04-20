import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2, Trash2 } from 'lucide-react';
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

/** Per-kind copy for the form */
const COPY: Record<ProposalKind, {
  dialogTitle: string;
  dialogHelp: string;
  questionLabel: string;
  questionPlaceholder: string;
  choicesHelp?: string;
  choicesOptional?: boolean;
}> = {
  bet: {
    dialogTitle: 'Propose un pari',
    dialogHelp: "Ta proposition sera visible par tous (avec ton prénom) et publiée si elle atteint 10 👍 (moins de 3 👎) ou si l'admin la valide.",
    questionLabel: 'Intitulé du pari',
    questionPlaceholder: 'Écris simplement ton idée de pari…',
  },
  sondage: {
    dialogTitle: 'Propose un sondage',
    dialogHelp: "Ta proposition sera visible par tous (avec ton prénom) et publiée si elle atteint 10 👍 (moins de 3 👎) ou si l'admin la valide.",
    questionLabel: 'Question du sondage',
    questionPlaceholder: 'Ex : Qui dans la classe devrait faire du stand-up ?',
    choicesHelp: 'Tu peux proposer la question et laisser les autres ajouter les choix, ou proposer des choix dès maintenant.',
    choicesOptional: true,
  },
  tournoi: {
    dialogTitle: 'Propose un tournoi',
    dialogHelp: "Ta proposition sera visible par tous (avec ton prénom) et publiée si elle atteint 10 👍 (moins de 3 👎) ou si l'admin la valide.",
    questionLabel: 'Thème / Question du tournoi',
    questionPlaceholder: 'Ex : La meilleure spécialité de droit des affaires',
    choicesHelp: 'Tu peux proposer le thème seul, ou déjà ajouter des choix. Les autres pourront en ajouter aussi.',
    choicesOptional: true,
  },
  gouvernement: {
    dialogTitle: 'Propose une variante de gouvernement',
    dialogHelp: "Ta proposition sera visible par tous et publiée après validation.",
    questionLabel: 'Intitulé',
    questionPlaceholder: 'Ex : Gouvernement spécial révisions',
  },
  fantasy: {
    dialogTitle: 'Propose une variante de Fantasy Firm',
    dialogHelp: "Ta proposition sera visible par tous et publiée après validation.",
    questionLabel: 'Intitulé',
    questionPlaceholder: 'Ex : Cabinet pénal uniquement',
  },
};

export default function ProposeNewDialog({ kind, onSubmitted, buttonLabel, buttonVariant = 'outline' }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [choices, setChoices] = useState<string[]>(['', '']);
  const [submitting, setSubmitting] = useState(false);

  const copy = COPY[kind];
  const label = KIND_LABELS[kind];
  const showOptions = kind === 'sondage' || kind === 'tournoi';

  const updateChoice = (i: number, v: string) => {
    const next = [...choices];
    next[i] = v;
    setChoices(next);
  };
  const addChoice = () => setChoices([...choices, '']);
  const removeChoice = (i: number) => {
    if (choices.length <= 1) return;
    setChoices(choices.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    if (!user || !title.trim()) {
      toast.error('Donne un titre');
      return;
    }
    setSubmitting(true);

    const cleanedChoices = showOptions
      ? choices.map((o) => o.trim()).filter(Boolean).map((label) => ({ label }))
      : [];

    const payload: Record<string, unknown> = {};
    if (kind === 'sondage') payload.config = { format: 'simple', options: cleanedChoices.map((o) => o.label) };
    else if (kind === 'tournoi') payload.config = { options: cleanedChoices.map((o) => o.label) };

    const { error } = await supabase.from('daimocratie_proposals').insert({
      title: title.trim(),
      user_id: user.id,
      proposal_kind: kind,
      payload,
      options_json: cleanedChoices.length > 0 ? (cleanedChoices as any) : null,
      status: 'en_attente',
    } as any);

    setSubmitting(false);

    if (error) {
      toast.error('Erreur lors de la soumission');
      return;
    }

    toast.success(`Proposition envoyée ! En attente de validation (10 👍 ou admin) 🗳️`);
    setTitle('');
    setChoices(['', '']);
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
          <DialogTitle>{label.emoji} {copy.dialogTitle}</DialogTitle>
          <DialogDescription>{copy.dialogHelp}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1 block">{copy.questionLabel}</label>
            <Input
              placeholder={copy.questionPlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </div>

          {showOptions && (
            <div>
              <label className="text-xs font-medium mb-1 block">
                Choix proposés {copy.choicesOptional && <span className="text-muted-foreground font-normal">(optionnel)</span>}
              </label>
              <div className="space-y-2">
                {choices.map((c, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      placeholder={`Choix ${i + 1}`}
                      value={c}
                      onChange={(e) => updateChoice(i, e.target.value)}
                      maxLength={120}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => removeChoice(i)}
                      disabled={choices.length <= 1}
                      className="shrink-0"
                      aria-label="Supprimer ce choix"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={addChoice}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-1" /> Ajouter un choix
                </Button>
              </div>
              {copy.choicesHelp && (
                <p className="text-xs text-muted-foreground mt-2 italic">{copy.choicesHelp}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Annuler</Button>
          <Button onClick={submit} disabled={submitting || !title.trim()} className="gold-gradient">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Soumettre la proposition 🚀'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
