ALTER TABLE public.daily_content ADD COLUMN IF NOT EXISTS reveal_at TIME DEFAULT '09:30:00';
UPDATE public.daily_content SET reveal_at = '09:30:00' WHERE reveal_at IS NULL;