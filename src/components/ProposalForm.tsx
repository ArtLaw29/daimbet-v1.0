import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle, Zap, BarChart3, Layers, Trophy, Calendar } from 'lucide-react';
import { PROMO_NAMES } from '@/lib/pari-mutuel';

type BetType = 'binaire' | 'over_under' | 'tranches_multiples' | 'tierce_du_daim';

const TYPE_OPTIONS: { value: BetType; label: string; emoji: string; desc: string; icon: React.ElementType }[] = [
  { value: 'binaire', label: 'OUI / NON', emoji: '✅', desc: 'Question simple', icon: Zap },
  { value: 'over_under', label: 'Over / Under', emoji: '📊', desc: 'Seuil à dépasser', icon: BarChart3 },
  { value: 'tranches_multiples', label: 'Tranches', emoji: '📏', desc: '2-5 options', icon: Layers },
  { value: 'tierce_du_daim', label: 'Tiercé du Daim', emoji: '🏇', desc: '6-20 candidats', icon: Trophy },
];

const TEMPLATES = [
  { label: "L'élève [X] arrivera-t-il à l'heure ?", type: 'binaire' as BetType, title: '' },
  { label: "L'élève [X] aura-t-il plus de [Y] min de retard ?", type: 'over_under' as BetType, title: '' },
  { label: "Qui parmi [X, Y, Z] ?", type: 'tranches_multiples' as BetType, title: '' },
];

interface ProposalFormProps {
  onClose: () => void;
  onSubmitted: () => void;
}

export default function ProposalForm({ onClose, onSubmitted }: ProposalFormProps) {
  const { user, profile } = useAuth();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [betType, setBetType] = useState<BetType>('binaire');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Type-specific
  const [overUnderThreshold, setOverUnderThreshold] = useState('');
  const [trancheOptions, setTrancheOptions] = useState(['', '']);
  const [tierceCandidates, setTierceCandidates] = useState<string[]>([]);
  const [newCandidate, setNewCandidate] = useState('');

  const buildOptions = () => {
    switch (betType) {
      case 'binaire':
        return [{ label: 'OUI' }, { label: 'NON' }];
      case 'over_under':
        return [
          { label: `Over ${overUnderThreshold}`, bornes_info: `≥ ${overUnderThreshold}` },
          { label: `Under ${overUnderThreshold}`, bornes_info: `< ${overUnderThreshold}` },
        ];
      case 'tranches_multiples':
        return trancheOptions.filter(o => o.trim()).map(o => ({ label: o.trim() }));
      case 'tierce_du_daim':
        return tierceCandidates.map(c => ({ label: c }));
    }
  };

  const canProceedStep2 = () => {
    if (betType === 'over_under') return !!overUnderThreshold.trim();
    if (betType === 'tranches_multiples') return trancheOptions.filter(o => o.trim()).length >= 2;
    if (betType === 'tierce_du_daim') return tierceCandidates.length >= 6;
    return true;
  };

  const submit = async () => {
    if (!user || !title.trim()) return;
    setSubmitting(true);

    const options = buildOptions();
    const { error } = await supabase.from('daimocratie_proposals').insert({
      title: title.trim(),
      type: betType,
      user_id: user.id,
      options_json: options,
      end_date_proposed: endDate ? new Date(endDate).toISOString() : null,
    });

    if (error) {
      toast.error('Erreur lors de la soumission');
    } else {
      // Gazette auto-message for new proposal
      await supabase.from('gazette_messages').insert({
        content: `🗳️ ${profile?.display_name || 'Un Daim'} propose un nouveau pari : "${title.trim()}" — Votez pour ou contre ! 🦌`,
        user_id: user.id,
        is_system_message: false,
      });
      toast.success(`Ta proposition est soumise au vote de la promo 🎯 — ${profile?.display_name} propose ce pari !`);
      onSubmitted();
    }
    setSubmitting(false);
  };

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setTitle(tpl.label);
    setBetType(tpl.type);
  };

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {[1, 2, 3].map(s => (
          <div key={s} className={`h-2 rounded-full transition-all ${s === step ? 'w-10 bg-primary' : s < step ? 'w-6 bg-primary/50' : 'w-6 bg-secondary'}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <h3 className="text-lg font-display">Étape 1 — Titre du pari</h3>
            <p className="text-sm text-muted-foreground">Formule ta question clairement</p>

            {/* Templates */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Templates rapides :</p>
              {TEMPLATES.map((tpl, i) => (
                <button key={i} onClick={() => applyTemplate(tpl)}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors border border-border">
                  {tpl.label}
                </button>
              ))}
            </div>

            <Input
              placeholder="Ex: Est-ce que X arrivera à l'heure ?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              className="text-base"
            />
            <p className="text-xs text-muted-foreground text-right">{title.length}/200</p>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={onClose}>Annuler</Button>
              <Button onClick={() => setStep(2)} disabled={!title.trim()} className="gold-gradient">
                Suivant <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <h3 className="text-lg font-display">Étape 2 — Type de pari</h3>

            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.value} onClick={() => setBetType(t.value)}
                    className={`p-3 rounded-xl border text-center transition-colors ${
                      betType === t.value ? 'border-primary bg-primary/10' : 'border-border bg-secondary/50 hover:border-primary/30'
                    }`}>
                    <span className="text-2xl block mb-1">{t.emoji}</span>
                    <span className="text-sm font-semibold block">{t.label}</span>
                    <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Type-specific fields */}
            {betType === 'over_under' && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Seuil</label>
                <Input placeholder="Ex: 15 minutes" value={overUnderThreshold} onChange={e => setOverUnderThreshold(e.target.value)} />
              </div>
            )}

            {betType === 'tranches_multiples' && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Options (2-5)</label>
                {trancheOptions.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder={`Option ${i + 1}`} value={opt}
                      onChange={e => { const n = [...trancheOptions]; n[i] = e.target.value; setTrancheOptions(n); }} />
                    {trancheOptions.length > 2 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setTrancheOptions(trancheOptions.filter((_, j) => j !== i))}>✕</Button>
                    )}
                  </div>
                ))}
                {trancheOptions.length < 5 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setTrancheOptions([...trancheOptions, ''])}>+ Ajouter</Button>
                )}
              </div>
            )}

            {betType === 'tierce_du_daim' && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Candidats (6-20)</label>
                <div className="flex gap-2">
                  <select value={newCandidate} onChange={e => setNewCandidate(e.target.value)}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Choisir...</option>
                    {PROMO_NAMES.filter(n => !tierceCandidates.includes(n)).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" onClick={() => {
                    if (newCandidate && tierceCandidates.length < 20) {
                      setTierceCandidates([...tierceCandidates, newCandidate]);
                      setNewCandidate('');
                    }
                  }} disabled={!newCandidate}>+</Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tierceCandidates.map(c => (
                    <span key={c} className="inline-flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded-full">
                      {c}
                      <button onClick={() => setTierceCandidates(tierceCandidates.filter(x => x !== c))} className="text-muted-foreground hover:text-destructive">✕</button>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{tierceCandidates.length}/20 candidats</p>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Retour
              </Button>
              <Button onClick={() => setStep(3)} disabled={!canProceedStep2()} className="gold-gradient">
                Suivant <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <h3 className="text-lg font-display">Étape 3 — Date de fin (optionnel)</h3>
            <p className="text-sm text-muted-foreground">L'admin pourra la modifier après validation</p>

            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <Input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
              <h4 className="font-semibold text-sm">Résumé</h4>
              <p className="text-sm"><span className="text-muted-foreground">Titre :</span> {title}</p>
              <p className="text-sm"><span className="text-muted-foreground">Type :</span> {TYPE_OPTIONS.find(t => t.value === betType)?.label}</p>
              {endDate && <p className="text-sm"><span className="text-muted-foreground">Fin :</span> {new Date(endDate).toLocaleString('fr-FR')}</p>}
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Retour
              </Button>
              <Button onClick={submit} disabled={submitting} className="gold-gradient">
                <CheckCircle className="w-4 h-4 mr-1" /> Confirmer 🔒
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
