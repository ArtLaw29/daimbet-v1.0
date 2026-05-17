-- game_config : key/value paramétrage par jeu
CREATE TABLE IF NOT EXISTS public.game_config (
  game_key text PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read game_config"
  ON public.game_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert game_config"
  ON public.game_config FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update game_config"
  ON public.game_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin delete game_config"
  ON public.game_config FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed defaults
INSERT INTO public.game_config (game_key, config) VALUES
  ('roulette',      '{"betMin":5, "betMax":200, "maxPlaysPerDay":50}'::jsonb),
  ('slot_machine',  '{"betMin":5, "betMax":100, "cooldownSec":30, "maxSpinsPerDay":30}'::jsonb),
  ('blackjack',     '{"betMin":10, "betMax":300, "maxPlaysPerDay":100}'::jsonb)
ON CONFLICT (game_key) DO NOTHING;

-- daily_plays
CREATE TABLE IF NOT EXISTS public.daily_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_key text NOT NULL,
  played_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_plays_user_game_time
  ON public.daily_plays (user_id, game_key, played_at DESC);

ALTER TABLE public.daily_plays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own daily_plays"
  ON public.daily_plays FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users insert own daily_plays"
  ON public.daily_plays FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin delete daily_plays"
  ON public.daily_plays FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_config;
ALTER TABLE public.game_config REPLICA IDENTITY FULL;