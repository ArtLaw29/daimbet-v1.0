-- 1v1 game sessions
CREATE TABLE IF NOT EXISTS public.games_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type TEXT NOT NULL,
  player1_id UUID,
  player2_id UUID,
  status TEXT NOT NULL DEFAULT 'en_attente',
  game_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  mise_player1 INTEGER NOT NULL DEFAULT 0,
  mise_player2 INTEGER NOT NULL DEFAULT 0,
  winner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.games_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read games_sessions"
  ON public.games_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Player1 creates games_sessions"
  ON public.games_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player1_id);

CREATE POLICY "Players update own games_sessions"
  ON public.games_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = player1_id OR auth.uid() = player2_id);

CREATE POLICY "Admin delete games_sessions"
  ON public.games_sessions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_games_sessions_updated
  BEFORE UPDATE ON public.games_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Challenges
CREATE TABLE IF NOT EXISTS public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  game_type TEXT NOT NULL,
  creator_id UUID NOT NULL,
  mise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ouvert',
  session_id UUID REFERENCES public.games_sessions(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read challenges"
  ON public.challenges FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users create own challenges"
  ON public.challenges FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creator updates own challenges"
  ON public.challenges FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id);

CREATE POLICY "Admin delete challenges"
  ON public.challenges FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- External bets
CREATE TABLE IF NOT EXISTS public.external_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID NOT NULL,
  player2_id UUID,
  mise INTEGER NOT NULL DEFAULT 0,
  result_player1 TEXT,
  result_player2 TEXT,
  status TEXT NOT NULL DEFAULT 'en_attente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.external_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players read own external_bets"
  ON public.external_bets FOR SELECT TO authenticated
  USING (auth.uid() = player1_id OR auth.uid() = player2_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Player1 creates external_bets"
  ON public.external_bets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player1_id);

CREATE POLICY "Players update own external_bets"
  ON public.external_bets FOR UPDATE TO authenticated
  USING (auth.uid() = player1_id OR auth.uid() = player2_id);

CREATE POLICY "Admin delete external_bets"
  ON public.external_bets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Daily content
CREATE TABLE IF NOT EXISTS public.daily_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'programmé',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(type, scheduled_date)
);

ALTER TABLE public.daily_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read daily_content"
  ON public.daily_content FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin insert daily_content"
  ON public.daily_content FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin update daily_content"
  ON public.daily_content FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete daily_content"
  ON public.daily_content FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Daily scores
CREATE TABLE IF NOT EXISTS public.daily_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES public.daily_content(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rank INTEGER,
  rewarded BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.daily_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own scores or admin"
  ON public.daily_scores FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own scores"
  ON public.daily_scores FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin update daily_scores"
  ON public.daily_scores FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete daily_scores"
  ON public.daily_scores FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));