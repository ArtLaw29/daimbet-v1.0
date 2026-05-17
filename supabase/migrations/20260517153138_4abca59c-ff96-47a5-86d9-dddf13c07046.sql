CREATE TABLE IF NOT EXISTS public.game_status (
  game_key text PRIMARY KEY,
  suspended boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  last_reset_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read game_status"
  ON public.game_status FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin insert game_status"
  ON public.game_status FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin update game_status"
  ON public.game_status FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete game_status"
  ON public.game_status FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER game_status_set_updated_at
  BEFORE UPDATE ON public.game_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_status;

INSERT INTO public.game_status (game_key) VALUES
  ('paris_dc'), ('paris_externes'),
  ('daimocratie'), ('tournois'), ('gouvernement'), ('fantasy_firm'),
  ('kiss_marry'), ('destins'), ('quizz'), ('bingo'),
  ('loup_garou'), ('monopoly'), ('uno'),
  ('wordle'), ('sudoku'), ('mots_fleches'), ('pendu'), ('echecs'), ('puissance4'),
  ('blackjack'), ('machine_a_sous'), ('poker'), ('roulette'),
  ('gazette'), ('classement')
ON CONFLICT (game_key) DO NOTHING;