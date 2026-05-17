import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type LoanRequest = Tables<'loan_requests'>;
export type LoanOffer = Tables<'loan_offers'>;
export type Loan = Tables<'loans'>;

export function useLoans() {
  const [requests, setRequests] = useState<LoanRequest[]>([]);
  const [offers, setOffers] = useState<LoanOffer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [r, o, l] = await Promise.all([
      supabase.from('loan_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('loan_offers').select('*').order('created_at', { ascending: false }),
      supabase.from('loans').select('*').order('created_at', { ascending: false }),
    ]);
    setRequests(r.data || []);
    setOffers(o.data || []);
    setLoans(l.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('loans-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_requests' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_offers' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  return { requests, offers, loans, loading, refresh: fetchAll };
}

export function totalDue(principal: number, rate: number) {
  return principal + Math.floor((principal * rate) / 100);
}