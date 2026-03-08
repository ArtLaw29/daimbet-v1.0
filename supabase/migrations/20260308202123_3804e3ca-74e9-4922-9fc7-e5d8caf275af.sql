
CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read platform settings"
  ON public.platform_settings FOR SELECT
  USING (true);

CREATE POLICY "Admin can update platform settings"
  ON public.platform_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can insert platform settings"
  ON public.platform_settings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default maintenance_mode = false
INSERT INTO public.platform_settings (key, value) VALUES ('maintenance_mode', 'false');
