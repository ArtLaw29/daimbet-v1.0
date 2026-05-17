import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { totalDue, type LoanRequest, type LoanOffer } from '@/hooks/useLoans';
import { cn } from '@/lib/utils';

/* ---------- Request loan (borrower) ---------- */
export function RequestLoanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [motive, setMotive] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const n = Number(amount);
    if (!user || !n || n <= 0) { toast.error('Montant invalide'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('loan_requests').insert({
      borrower_id: user.id, amount: Math.floor(n), motive: motive.trim() || null,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success('Demande publiée 🙏'); setAmount(''); setMotive(''); onClose(); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🙏 Demander un emprunt</DialogTitle>
          <DialogDescription>Ta demande apparaîtra dans la Gazette.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Montant (DC)</label>
            <Input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ex : 500" />
          </div>
          <div>
            <label className="text-sm font-medium">Motif (optionnel)</label>
            <Textarea value={motive} onChange={e => setMotive(e.target.value)} placeholder="Pour quoi faire ?" rows={3} maxLength={280} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={submitting}>Publier la demande</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Offer loan spontaneously (lender) ---------- */
export function OfferLoanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState(5);
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const n = Number(amount);
    if (!user || !n || n <= 0) { toast.error('Montant invalide'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('loan_offers').insert({
      lender_id: user.id, amount: Math.floor(n), rate_percent: rate,
      deadline: deadline ? deadline.toISOString() : null, request_id: null,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success('Offre publiée 💰'); setAmount(''); setRate(5); setDeadline(undefined); onClose(); }
  };

  const n = Number(amount) || 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>💰 Proposer un prêt</DialogTitle>
          <DialogDescription>Offre spontanée, ouverte à toute la promo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Montant (DC)</label>
            <Input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ex : 500" />
          </div>
          <div>
            <label className="text-sm font-medium flex justify-between">
              <span>Taux d'intérêt</span>
              <span className="text-primary font-bold">{rate}%</span>
            </label>
            <Slider value={[rate]} min={0} max={50} step={1} onValueChange={v => setRate(v[0])} className="mt-2" />
            {n > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                À rembourser : <strong>{totalDue(n, rate)} DC</strong>
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Échéance (optionnel)</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start', !deadline && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {deadline ? format(deadline, 'PPP', { locale: fr }) : 'Aucune'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={deadline} onSelect={setDeadline}
                  disabled={(d) => d < new Date(Date.now() - 86400000)}
                  initialFocus className={cn('p-3 pointer-events-auto')} />
              </PopoverContent>
            </Popover>
            {deadline && (
              <Button variant="ghost" size="sm" onClick={() => setDeadline(undefined)} className="mt-1 h-6 text-xs">
                Effacer la date
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={submitting}>Publier l'offre</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Propose offer on an existing request (lender) ---------- */
export function ProposeOfferDialog({
  open, onClose, request,
}: { open: boolean; onClose: () => void; request: LoanRequest | null }) {
  const { user } = useAuth();
  const [rate, setRate] = useState(5);
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user || !request) return;
    setSubmitting(true);
    const { error } = await supabase.from('loan_offers').insert({
      lender_id: user.id, amount: request.amount, rate_percent: rate,
      deadline: deadline ? deadline.toISOString() : null, request_id: request.id,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success('Offre envoyée 🤝'); setRate(5); setDeadline(undefined); onClose(); }
  };

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>💰 Prêter {request.amount} DC</DialogTitle>
          <DialogDescription>
            Définis ton taux et ta date butoir. Le demandeur pourra accepter ou refuser.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium flex justify-between">
              <span>Taux d'intérêt</span>
              <span className="text-primary font-bold">{rate}%</span>
            </label>
            <Slider value={[rate]} min={0} max={50} step={1} onValueChange={v => setRate(v[0])} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              À rembourser : <strong>{totalDue(request.amount, rate)} DC</strong>
            </p>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Échéance (optionnel)</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start', !deadline && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {deadline ? format(deadline, 'PPP', { locale: fr }) : 'Aucune'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={deadline} onSelect={setDeadline}
                  disabled={(d) => d < new Date(Date.now() - 86400000)}
                  initialFocus className={cn('p-3 pointer-events-auto')} />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={submitting}>Envoyer mon offre</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Borrow against a spontaneous offer (borrower) ---------- */
export function BorrowFromOfferDialog({
  open, onClose, offer,
}: { open: boolean; onClose: () => void; offer: LoanOffer | null }) {
  const { user } = useAuth();
  const [motive, setMotive] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user || !offer) return;
    setSubmitting(true);
    // 1) Create a request matching the offer's amount
    const { data: req, error: reqErr } = await supabase.from('loan_requests').insert({
      borrower_id: user.id, amount: offer.amount, motive: motive.trim() || null,
    }).select().single();
    if (reqErr || !req) { setSubmitting(false); toast.error(reqErr?.message || 'Erreur'); return; }
    // 2) Call match-loan
    const { data, error } = await supabase.functions.invoke('match-loan', {
      body: { request_id: req.id, offer_id: offer.id },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Erreur');
      // Roll back request as cancelled
      await supabase.from('loan_requests').update({ status: 'cancelled' }).eq('id', req.id);
    } else {
      toast.success('Prêt conclu 🤝'); setMotive(''); onClose();
    }
  };

  if (!offer) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🤝 Emprunter {offer.amount} DC</DialogTitle>
          <DialogDescription>
            Taux {offer.rate_percent}% — tu rembourseras <strong>{totalDue(offer.amount, Number(offer.rate_percent))} DC</strong>
            {offer.deadline ? ` avant le ${format(new Date(offer.deadline), 'PPP', { locale: fr })}` : ' (sans échéance)'}.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label className="text-sm font-medium">Motif (optionnel)</label>
          <Textarea value={motive} onChange={e => setMotive(e.target.value)} rows={2} maxLength={280} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={submitting}>Confirmer l'emprunt</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}