
CREATE TABLE public.poker_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  user_id uuid NOT NULL,
  round_number int NOT NULL,
  phase text NOT NULL,
  action text NOT NULL CHECK (action IN ('fold','check','call','raise','all_in','blind','win')),
  amount int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.poker_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read poker_actions"
  ON public.poker_actions FOR SELECT TO authenticated
  USING (is_room_member(room_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Self insert poker_actions"
  ON public.poker_actions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin delete poker_actions"
  ON public.poker_actions FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_poker_actions_room_round ON public.poker_actions(room_id, round_number, created_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.poker_actions;

-- Register poker in game_status if not present
INSERT INTO public.game_status (game_key, suspended, hidden)
VALUES ('poker', false, false)
ON CONFLICT (game_key) DO NOTHING;
