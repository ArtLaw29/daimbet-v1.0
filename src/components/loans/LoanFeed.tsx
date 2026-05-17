import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Handshake, Coins, X, Check, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useLoans, totalDue, type LoanRequest, type LoanOffer } from '@/hooks/useLoans';
import { ProposeOfferDialog, BorrowFromOfferDialog } from './LoanDialogs';

type ProfileMap = Record<string, { display_name: string | null; emoji: string | null }>;

export default function LoanFeed({ profiles }: { profiles: ProfileMap }) {
  const { user } = useAuth();
  const { requests, offers } = useLoans();
  const [proposeTo, setProposeTo] = useState<LoanRequest | null>(null);
  const [borrowFrom, setBorrowFrom] = useState<LoanOffer | null>(null);

  const openRequests = useMemo(() => requests.filter(r => r.status === 'open'), [requests]);
  const spontaneousOffers = useMemo(
    () => offers.filter(o => o.status === 'open' && o.request_id == null),
    [offers],
  );

  if (openRequests.length === 0 && spontaneousOffers.length === 0) return null;

  const nameOf = (id?: string | null) =>
    (id && profiles[id]?.display_name) || 'Quelqu\'un';
  const emojiOf = (id?: string | null) => (id && profiles[id]?.emoji) || '🦌';

  const cancelRequest = async (id: string) => {
    const { error } = await supabase.from('loan_requests').update({ status: 'cancelled' }).eq('id', id);
    if (error) toast.error(error.message); else toast.success('Demande annulée');
  };
  const cancelOffer = async (id: string) => {
    const { error } = await supabase.from('loan_offers').update({ status: 'cancelled' }).eq('id', id);
    if (error) toast.error(error.message); else toast.success('Offre annulée');
  };

  const acceptOffer = async (request_id: string, offer_id: string) => {
    const { data, error } = await supabase.functions.invoke('match-loan', {
      body: { request_id, offer_id },
    });
    if (error || (data as any)?.error) toast.error((data as any)?.error || error?.message || 'Erreur');
    else toast.success('Prêt conclu 🤝');
  };
  const refuseOffer = async (offer_id: string) => {
    const { error } = await supabase.from('loan_offers').update({ status: 'cancelled' }).eq('id', offer_id);
    if (error) toast.error(error.message); else toast.success('Offre refusée');
  };

  return (
    <div className="space-y-3 mb-4">
      <AnimatePresence initial={false}>
        {/* Spontaneous offers */}
        {spontaneousOffers.map(off => {
          const mine = off.lender_id === user?.id;
          return (
            <motion.div key={`off-${off.id}`} layout
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-yellow-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-semibold mb-1">
                      <Coins className="w-3.5 h-3.5" /> OFFRE DE PRÊT
                    </div>
                    <p className="text-sm">
                      <strong>{emojiOf(off.lender_id)} {nameOf(off.lender_id)}</strong>
                      {' '}propose <strong>{off.amount} DC</strong> à <strong>{off.rate_percent}%</strong>
                      {off.deadline && <> avant le {format(new Date(off.deadline), 'dd/MM/yyyy')}</>}.
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Total à rembourser : {totalDue(off.amount, Number(off.rate_percent))} DC
                    </p>
                  </div>
                  {mine ? (
                    <Button size="sm" variant="ghost" onClick={() => cancelOffer(off.id)}>
                      <X className="w-4 h-4" />
                    </Button>
                  ) : user ? (
                    <Button size="sm" onClick={() => setBorrowFrom(off)}>Emprunter</Button>
                  ) : null}
                </div>
              </div>
            </motion.div>
          );
        })}

        {/* Open requests + threaded offers */}
        {openRequests.map(req => {
          const reqOffers = offers.filter(o => o.request_id === req.id && o.status === 'open');
          const bestRate = reqOffers.length > 0
            ? Math.min(...reqOffers.map(o => Number(o.rate_percent)))
            : null;
          const mine = req.borrower_id === user?.id;
          const alreadyOffered = user && reqOffers.some(o => o.lender_id === user.id);

          return (
            <motion.div key={`req-${req.id}`} layout
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-primary/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-xs text-primary font-semibold mb-1">
                      <Handshake className="w-3.5 h-3.5" /> DEMANDE D'EMPRUNT
                    </div>
                    <p className="text-sm">
                      <strong>{emojiOf(req.borrower_id)} {nameOf(req.borrower_id)}</strong>
                      {' '}cherche <strong>{req.amount} DC</strong>.
                    </p>
                    {req.motive && <p className="text-xs text-muted-foreground mt-0.5 italic">« {req.motive} »</p>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {reqOffers.length} offre{reqOffers.length > 1 ? 's' : ''}
                      </Badge>
                      {bestRate !== null && (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                          <Sparkles className="w-2.5 h-2.5 mr-0.5" /> Meilleur : {bestRate}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  {mine ? (
                    <Button size="sm" variant="ghost" onClick={() => cancelRequest(req.id)}>
                      <X className="w-4 h-4" />
                    </Button>
                  ) : user && !alreadyOffered ? (
                    <Button size="sm" onClick={() => setProposeTo(req)}>
                      Prêter à {nameOf(req.borrower_id).split(' ')[0]}
                    </Button>
                  ) : alreadyOffered ? (
                    <Badge variant="outline" className="text-[10px]">Offre envoyée</Badge>
                  ) : null}
                </div>

                {/* Threaded offers (visible to all, actionable only by the borrower) */}
                {reqOffers.length > 0 && (
                  <div className="mt-3 pl-4 border-l-2 border-primary/30 space-y-2">
                    {reqOffers.map(o => {
                      const isMineOffer = o.lender_id === user?.id;
                      return (
                        <div key={o.id} className="flex items-center justify-between gap-2 text-sm">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{emojiOf(o.lender_id)} {nameOf(o.lender_id)}</span>
                            <span className="text-muted-foreground"> — taux <strong className="text-foreground">{o.rate_percent}%</strong></span>
                            {o.deadline && <span className="text-xs text-muted-foreground"> · {format(new Date(o.deadline), 'dd/MM')}</span>}
                            <Badge variant="outline" className="ml-2 text-[10px]">En attente</Badge>
                          </div>
                          {mine ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="default" onClick={() => acceptOffer(req.id, o.id)} className="h-7 px-2">
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => refuseOffer(o.id)} className="h-7 px-2">
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : isMineOffer ? (
                            <Button size="sm" variant="ghost" onClick={() => cancelOffer(o.id)} className="h-7 px-2">
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <ProposeOfferDialog open={!!proposeTo} onClose={() => setProposeTo(null)} request={proposeTo} />
      <BorrowFromOfferDialog open={!!borrowFrom} onClose={() => setBorrowFrom(null)} offer={borrowFrom} />
    </div>
  );
}