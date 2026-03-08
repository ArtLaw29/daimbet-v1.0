-- Retraction time window config (admin-controlled)
CREATE TABLE public.retraction_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_hour integer NOT NULL DEFAULT 0,
  end_hour integer NOT NULL DEFAULT 9,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.retraction_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read retraction config"
ON public.retraction_config FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin can update retraction config"
ON public.retraction_config FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can insert retraction config"
ON public.retraction_config FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default config
INSERT INTO public.retraction_config (start_hour, end_hour) VALUES (0, 9);