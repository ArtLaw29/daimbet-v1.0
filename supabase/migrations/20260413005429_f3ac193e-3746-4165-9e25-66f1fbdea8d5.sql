
-- Table for unique signup codes
CREATE TABLE public.inscription_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prenom TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inscription_codes ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for signup validation)
CREATE POLICY "Anyone can read inscription codes"
  ON public.inscription_codes FOR SELECT
  TO public
  USING (true);

-- Admin can manage codes
CREATE POLICY "Admin can insert inscription codes"
  ON public.inscription_codes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update inscription codes"
  ON public.inscription_codes FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete inscription codes"
  ON public.inscription_codes FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
