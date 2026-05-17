ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS state_version integer NOT NULL DEFAULT 0;