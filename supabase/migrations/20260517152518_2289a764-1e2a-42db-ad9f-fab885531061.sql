CREATE TABLE public.game_state_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_type text NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  room_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE INDEX idx_gss_user_game_completed
  ON public.game_state_sessions (user_id, game_type, completed_at);

CREATE INDEX idx_gss_room
  ON public.game_state_sessions (room_id)
  WHERE room_id IS NOT NULL;

ALTER TABLE public.game_state_sessions ENABLE ROW LEVEL SECURITY;

-- Owner full access
CREATE POLICY "gss_owner_select"
ON public.game_state_sessions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "gss_owner_insert"
ON public.game_state_sessions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gss_owner_update"
ON public.game_state_sessions FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gss_owner_delete"
ON public.game_state_sessions FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Room teammate read access (future multi)
CREATE POLICY "gss_room_member_select"
ON public.game_state_sessions FOR SELECT TO authenticated
USING (
  room_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.games_sessions gs
    WHERE gs.id = game_state_sessions.room_id
      AND (gs.player1_id = auth.uid() OR gs.player2_id = auth.uid())
  )
);

-- Admin read
CREATE POLICY "gss_admin_select"
ON public.game_state_sessions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER trg_gss_updated_at
BEFORE UPDATE ON public.game_state_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();