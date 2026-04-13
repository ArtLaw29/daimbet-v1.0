-- Game session status enum
CREATE TYPE public.game_session_status AS ENUM ('draft', 'active', 'voting', 'closed', 'archived');

-- Game type enum
CREATE TYPE public.game_type AS ENUM ('sondage', 'tournoi', 'gouvernement', 'fantasy');

-- Sessions table
CREATE TABLE public.game_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_type public.game_type NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  status public.game_session_status NOT NULL DEFAULT 'draft',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sessions viewable by authenticated" ON public.game_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can insert sessions" ON public.game_sessions
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can update sessions" ON public.game_sessions
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete sessions" ON public.game_sessions
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Participations table
CREATE TABLE public.game_participations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.game_participations ENABLE ROW LEVEL SECURITY;

-- Unique: one participation per user per session
CREATE UNIQUE INDEX idx_game_participations_unique ON public.game_participations (session_id, user_id);

CREATE POLICY "Participations viewable by authenticated" ON public.game_participations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own participation" ON public.game_participations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own participation" ON public.game_participations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admin can delete participations" ON public.game_participations
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at on game_sessions
CREATE TRIGGER update_game_sessions_updated_at
  BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_participations;