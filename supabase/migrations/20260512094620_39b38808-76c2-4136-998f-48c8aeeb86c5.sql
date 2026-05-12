
-- Public leaderboard for Wordle (per variant, per day)
CREATE OR REPLACE FUNCTION public.get_wordle_leaderboard(p_variant text, p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  rank integer,
  user_id uuid,
  display_name text,
  emoji text,
  avatar_url text,
  amount_earned integer,
  attempts integer,
  finished_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ds.rank,
    ds.user_id,
    p.display_name,
    p.emoji,
    p.avatar_url,
    ds.amount_earned,
    COALESCE((ds.score->>'attempts')::int, NULL) AS attempts,
    ds.finished_at
  FROM public.daily_scores ds
  LEFT JOIN public.profiles p ON p.user_id = ds.user_id
  WHERE ds.game_type = 'wordle'
    AND ds.played_on = p_date
    AND ds.variant = p_variant
    AND ds.rewarded = true
    AND ds.rank IS NOT NULL
  ORDER BY ds.rank ASC NULLS LAST, ds.finished_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_wordle_leaderboard(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_wordle_leaderboard(text, date) TO authenticated, anon;

-- Paid retry for Wordle (50 DC) — resets the user's attempt for that variant today
CREATE OR REPLACE FUNCTION public.wordle_retry(p_variant text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost int := 50;
  v_balance int;
  v_existing record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Non authentifié');
  END IF;
  IF p_variant IS NULL OR p_variant NOT IN ('5','6','7','8','9','culture') THEN
    RETURN jsonb_build_object('error', 'Variante invalide');
  END IF;

  SELECT * INTO v_existing FROM public.daily_scores
   WHERE user_id = v_uid AND game_type = 'wordle'
     AND played_on = CURRENT_DATE AND variant = p_variant
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Aucune partie à recommencer');
  END IF;
  IF v_existing.rewarded = true THEN
    RETURN jsonb_build_object('error', 'Tu as déjà gagné ce défi');
  END IF;

  SELECT balance INTO v_balance FROM public.profiles WHERE user_id = v_uid FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN jsonb_build_object('error', 'Solde insuffisant (50 DC requis)');
  END IF;

  UPDATE public.profiles SET balance = balance - v_cost, updated_at = now() WHERE user_id = v_uid;

  INSERT INTO public.solde_history (user_id, delta_dc, reason)
  VALUES (v_uid, -v_cost, 'Nouvelle tentative Mot du jour (' || p_variant || ')');

  DELETE FROM public.daily_scores WHERE id = v_existing.id;

  RETURN jsonb_build_object('ok', true, 'cost', v_cost);
END;
$$;

REVOKE ALL ON FUNCTION public.wordle_retry(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wordle_retry(text) TO authenticated;
