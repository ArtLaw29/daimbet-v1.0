import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2, Trash2, CalendarIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
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
  kiss_marry: {
    dialogTitle: 'Propose une variante de Kiss/Marry',
    dialogHelp: "Ta proposition sera visible par tous et publiée après validation.",
    questionLabel: 'Intitulé',
    questionPlaceholder: 'Ex : Catégorie spéciale du mois',
  },
};

export default function ProposeNewDialog({ kind, onSubmitted, buttonLabel, buttonVariant = 'outline' }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [choices, setChoices] = useState<string[]>(['', '']);
  const [submitting, setSubmitting] = useState(false);
  // Enriched fields (mostly used for "bet" / "sondage")
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState<string>('20:00');
  const [suggestedOdds, setSuggestedOdds] = useState<string[]>(['', '']);
  // For "bet" kind: allow user to convert the proposition into a sondage
  const [convertToSondage, setConvertToSondage] = useState(false);

  // Effective kind (lets a "bet" proposer switch to sondage from the same dialog)
  const effectiveKind: ProposalKind = kind === 'bet' && convertToSondage ? 'sondage' : kind;
  const copy = COPY[effectiveKind];
  const label = KIND_LABELS[effectiveKind];
  const showOptions = effectiveKind === 'sondage' || effectiveKind === 'tournoi';
  const showSuggestedOdds = effectiveKind === 'bet';
  const showRichFields = effectiveKind === 'bet' || effectiveKind === 'sondage';

  const updateChoice = (i: number, v: string) => {
    const next = [...choices];
    next[i] = v;
    setChoices(next);
    // keep odds array in sync
    setSuggestedOdds((prev) => {
      const a = [...prev];
      while (a.length < next.length) a.push('');
      return a.slice(0, next.length);
    });
  };
  const updateOdd = (i: number, v: string) => {
    setSuggestedOdds((prev) => {
      const a = [...prev];
      a[i] = v;
      return a;
    });
  };
  const addChoice = () => {
    setChoices([...choices, '']);
    setSuggestedOdds([...suggestedOdds, '']);
  };
  const removeChoice = (i: number) => {
    if (choices.length <= 1) return;
    setChoices(choices.filter((_, idx) => idx !== i));
    setSuggestedOdds(suggestedOdds.filter((_, idx) => idx !== i));
  };

  const buildEndDateISO = (): string | null => {
    if (!endDate) return null;
    const [hh, mm] = (endTime || '20:00').split(':').map((x) => parseInt(x, 10));
    const d = new Date(endDate);
    d.setHours(isNaN(hh) ? 20 : hh, isNaN(mm) ? 0 : mm, 0, 0);
    return d.toISOString();
  };

  const submit = async () => {
    if (!user || !title.trim()) {
      toast.error('Donne un titre');
      return;
    }
    if (subtitle.length > 120) { toast.error('Sous-titre trop long (120 max)'); return; }
    if (description.length > 500) { toast.error('Description trop longue (500 max)'); return; }

    const endIso = buildEndDateISO();
    if (endDate && endIso && new Date(endIso) <= new Date()) {
      toast.error('La date de fin doit être dans le futur');
      return;
    }

    // Validate suggested odds (each must be ≥ 1.0 if provided)
    const oddsParsed: (number | null)[] = suggestedOdds.map((s) => {
      const t = s.trim();
      if (!t) return null;
      const n = Number(t.replace(',', '.'));
      return isFinite(n) ? n : NaN as any;
    });
    if (showSuggestedOdds && oddsParsed.some((n) => n !== null && (isNaN(n as number) || (n as number) < 1.0))) {
      toast.error('Cotes suggérées : minimum 1.0');
      return;
    }

    setSubmitting(true);

    const cleanedChoices = showOptions
      ? choices
          .map((o, i) => ({ raw: o.trim(), odd: oddsParsed[i] }))
          .filter((x) => x.raw)
          .map((x) => ({ label: x.raw, suggested_cote: x.odd ?? undefined }))
      : [];

    const payload: Record<string, unknown> = {};
    if (effectiveKind === 'sondage') payload.config = { format: 'simple', options: cleanedChoices.map((o) => o.label) };
    else if (effectiveKind === 'tournoi') payload.config = { options: cleanedChoices.map((o) => o.label) };

    if (showRichFields) {
      if (subtitle.trim()) payload.subtitle = subtitle.trim();
      if (description.trim()) payload.description = description.trim();
      if (endIso) payload.end_date = endIso;
      if (showSuggestedOdds) {
        const odds = cleanedChoices
          .filter((c) => typeof c.suggested_cote === 'number')
          .map((c) => ({ label: c.label, cote: c.suggested_cote }));
        if (odds.length) payload.suggested_odds = odds;
      }
      if (kind === 'bet' && convertToSondage) payload.converted_from = 'bet';
    }

    const { error } = await supabase.from('daimocratie_proposals').insert({
      title: title.trim(),
      user_id: user.id,
      proposal_kind: effectiveKind,
      payload,
      options_json: cleanedChoices.length > 0 ? (cleanedChoices as any) : null,
      end_date_proposed: endIso,
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
    setSuggestedOdds(['', '']);
    setSubtitle('');
    setDescription('');
    setEndDate(undefined);
    setEndTime('20:00');
    setConvertToSondage(false);
    setOpen(false);
    onSubmitted?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={buttonVariant} size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="w-4 h-4" />
        {buttonLabel || `Proposer un ${label.singular}`}
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label.emoji} {copy.dialogTitle}</DialogTitle>
          <DialogDescription>{copy.dialogHelp}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {kind === 'bet' && (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Switch
                id="convert-sondage"
                checked={convertToSondage}
                onCheckedChange={setConvertToSondage}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="convert-sondage" className="cursor-pointer">
                  📊 En faire plutôt un sondage
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Si l'évènement ne va pas vraiment se produire (juste un avis collectif à recueillir), transforme cette idée en sondage.
                </p>
              </div>
            </div>
          )}

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

          {showRichFields && (
            <>
              <div>
                <label className="text-xs font-medium mb-1 block">
                  Sous-titre <span className="text-muted-foreground font-normal">(optionnel)</span>
                </label>
                <Input
                  placeholder="Une accroche en une ligne…"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  maxLength={120}
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">
                  Description <span className="text-muted-foreground font-normal">(optionnel)</span>
                </label>
                <Textarea
                  placeholder="Précise le contexte, les règles, comment on tranche en cas de doute…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                />
                <p className="text-[10px] text-muted-foreground mt-1 text-right">{description.length}/500</p>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">
                  Date et heure de fin <span className="text-muted-foreground font-normal">(optionnel)</span>
                </label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'flex-1 justify-start text-left font-normal',
                          !endDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, 'PPP', { locale: fr }) : 'Choisir une date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                        locale={fr}
                        className={cn('p-3 pointer-events-auto')}
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-[110px]"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 italic">
                  L'admin peut ajuster cette date avant publication.
                </p>
              </div>
            </>
          )}

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

          {showSuggestedOdds && (
            <div>
              <label className="text-xs font-medium mb-1 block">
                Choix & cotes suggérées <span className="text-muted-foreground font-normal">(optionnel)</span>
              </label>
              <div className="space-y-2">
                {choices.map((c, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      placeholder={i === 0 ? 'Ex : OUI' : i === 1 ? 'Ex : NON' : `Choix ${i + 1}`}
                      value={c}
                      onChange={(e) => updateChoice(i, e.target.value)}
                      maxLength={120}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={1}
                      step={0.05}
                      placeholder="cote"
                      value={suggestedOdds[i] ?? ''}
                      onChange={(e) => updateOdd(i, e.target.value)}
                      className="w-[90px]"
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
              <p className="text-xs text-muted-foreground mt-2 italic">
                Les cotes suggérées sont purement indicatives — l'admin les ajuste si nécessaire et le pari mutuel les recalcule ensuite.
              </p>
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
