-- KM reveal config table
CREATE TABLE IF NOT EXISTS public.km_reveal_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reveal_dates timestamptz[] NOT NULL DEFAULT ARRAY[]::timestamptz[],
  last_reset_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.km_reveal_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read km reveal config"
  ON public.km_reveal_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can insert km reveal config"
  ON public.km_reveal_config FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can update km reveal config"
  ON public.km_reveal_config FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed initial config row with the two reveal dates (Europe/Paris 10:00 = 08:00 UTC during DST)
INSERT INTO public.km_reveal_config (reveal_dates)
VALUES (ARRAY['2026-05-20 08:00:00+00'::timestamptz, '2026-06-19 08:00:00+00'::timestamptz]);

-- Allow admin to read all km votes (needed for admin reveal panel)
CREATE POLICY "Admin can view km votes"
  ON public.kiss_marry_votes FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admin to delete km votes (needed for reset after reveal)
CREATE POLICY "Admin can delete km votes"
  ON public.kiss_marry_votes FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));