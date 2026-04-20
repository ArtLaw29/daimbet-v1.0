ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS visible_in_sondages boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visible_in_kiss_marry boolean NOT NULL DEFAULT true;