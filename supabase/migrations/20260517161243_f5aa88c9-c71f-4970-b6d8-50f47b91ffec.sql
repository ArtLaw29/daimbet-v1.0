
-- LOAN REQUESTS
CREATE TABLE public.loan_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id uuid NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  motive text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loan_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read loan_requests" ON public.loan_requests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Borrower inserts loan_request" ON public.loan_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = borrower_id);
CREATE POLICY "Borrower cancels own request" ON public.loan_requests
  FOR UPDATE TO authenticated USING (auth.uid() = borrower_id) WITH CHECK (auth.uid() = borrower_id);
CREATE POLICY "Admin delete loan_requests" ON public.loan_requests
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- LOAN OFFERS
CREATE TABLE public.loan_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  lender_id uuid NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  rate_percent numeric NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 50),
  deadline timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','cancelled','accepted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loan_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read loan_offers" ON public.loan_offers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lender inserts loan_offer" ON public.loan_offers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = lender_id);
CREATE POLICY "Lender cancels own offer" ON public.loan_offers
  FOR UPDATE TO authenticated USING (auth.uid() = lender_id) WITH CHECK (auth.uid() = lender_id);
CREATE POLICY "Admin delete loan_offers" ON public.loan_offers
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- LOANS
CREATE TABLE public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.loan_requests(id) ON DELETE SET NULL,
  offer_id uuid REFERENCES public.loan_offers(id) ON DELETE SET NULL,
  borrower_id uuid NOT NULL,
  lender_id uuid NOT NULL,
  principal integer NOT NULL CHECK (principal > 0),
  rate_percent numeric NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 50),
  total_due integer GENERATED ALWAYS AS (principal + (principal * rate_percent / 100)::int) STORED,
  deadline timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','repaid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  repaid_at timestamptz
);
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read loans" ON public.loans
  FOR SELECT TO authenticated USING (true);
-- Only edge functions (service role) can insert/update. Admin can delete.
CREATE POLICY "Admin delete loans" ON public.loans
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Indexes
CREATE INDEX idx_loan_requests_status ON public.loan_requests(status, created_at DESC);
CREATE INDEX idx_loan_offers_request ON public.loan_offers(request_id);
CREATE INDEX idx_loan_offers_status ON public.loan_offers(status, created_at DESC);
CREATE INDEX idx_loans_status ON public.loans(status, created_at DESC);
CREATE INDEX idx_loans_borrower ON public.loans(borrower_id);
CREATE INDEX idx_loans_lender ON public.loans(lender_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_offers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.loans;
