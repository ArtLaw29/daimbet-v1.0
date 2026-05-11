CREATE OR REPLACE FUNCTION public.normalize_daily_game_type(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_type IN ('mots_croises', 'mots_croisés', 'mots_fleches', 'mots_fléchés') THEN 'mots_fleches'
    WHEN p_type = 'wordle' THEN 'wordle'
    WHEN p_type = 'sudoku' THEN 'sudoku'
    ELSE lower(coalesce(p_type, ''))
  END
$$;

ALTER TABLE public.daily_scores
  ADD COLUMN IF NOT EXISTS game_type text,
  ADD COLUMN IF NOT EXISTS played_on date,
  ADD COLUMN IF NOT EXISTS score jsonb,
  ADD COLUMN IF NOT EXISTS amount_earned integer NOT NULL DEFAULT 0;

UPDATE public.daily_scores ds
SET
  game_type = COALESCE(ds.game_type, public.normalize_daily_game_type(dc.type), 'legacy'),
  played_on = COALESCE(ds.played_on, dc.scheduled_date, ((ds.finished_at AT TIME ZONE 'Europe/Paris')::date)),
  amount_earned = CASE
    WHEN ds.amount_earned IS DISTINCT FROM 0 THEN ds.amount_earned
    WHEN ds.rank = 1 THEN 500
    WHEN ds.rank = 2 THEN 300
    WHEN ds.rank = 3 THEN 200
    WHEN ds.rank = 4 THEN 100
    WHEN ds.rank = 5 THEN 50
    WHEN ds.rank IS NOT NULL THEN 10
    ELSE 0
  END
FROM public.daily_content dc
WHERE dc.id = ds.content_id
  AND (
    ds.game_type IS NULL
    OR ds.played_on IS NULL
    OR ds.amount_earned = 0
  );

UPDATE public.daily_scores ds
SET
  game_type = COALESCE(ds.game_type, 'legacy'),
  played_on = COALESCE(ds.played_on, ((ds.finished_at AT TIME ZONE 'Europe/Paris')::date))
WHERE ds.game_type IS NULL OR ds.played_on IS NULL;

ALTER TABLE public.daily_scores
  ALTER COLUMN game_type SET NOT NULL,
  ALTER COLUMN played_on SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS daily_scores_user_game_day_uniq
  ON public.daily_scores (user_id, game_type, played_on);

CREATE INDEX IF NOT EXISTS daily_scores_game_day_rank_idx
  ON public.daily_scores (game_type, played_on, rank, finished_at);

DROP POLICY IF EXISTS "Users insert own scores" ON public.daily_scores;

CREATE OR REPLACE FUNCTION public.submit_game_result(
  p_user_id uuid,
  p_game_type text,
  p_score jsonb DEFAULT NULL,
  p_completed boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_game_type text := public.normalize_daily_game_type(p_game_type);
  v_played_on date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_content record;
  v_existing record;
  v_rank integer;
  v_amount integer := 0;
  v_label text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF v_game_type NOT IN ('wordle', 'sudoku', 'mots_fleches') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Jeu invalide');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(format('%s:%s', v_game_type, v_played_on), 0));

  SELECT *
  INTO v_existing
  FROM public.daily_scores
  WHERE user_id = v_uid
    AND game_type = v_game_type
    AND played_on = v_played_on;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already', true,
      'rank', v_existing.rank,
      'amount_earned', COALESCE(v_existing.amount_earned, 0)
    );
  END IF;

  SELECT *
  INTO v_content
  FROM public.daily_content
  WHERE scheduled_date = v_played_on
    AND status = 'actif'
    AND public.normalize_daily_game_type(type) = v_game_type
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_content IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contenu du jour introuvable');
  END IF;

  IF NOT p_completed THEN
    INSERT INTO public.daily_scores (user_id, content_id, game_type, played_on, score, rank, rewarded, amount_earned)
    VALUES (v_uid, v_content.id, v_game_type, v_played_on, p_score, NULL, false, 0);

    RETURN jsonb_build_object(
      'success', true,
      'already', false,
      'rank', NULL,
      'amount_earned', 0
    );
  END IF;

  SELECT COUNT(*)::integer + 1
  INTO v_rank
  FROM public.daily_scores
  WHERE game_type = v_game_type
    AND played_on = v_played_on
    AND rank IS NOT NULL;

  v_amount := CASE v_rank
    WHEN 1 THEN 500
    WHEN 2 THEN 250
    WHEN 3 THEN 100
    ELSE 0
  END;

  INSERT INTO public.daily_scores (user_id, content_id, game_type, played_on, score, rank, rewarded, amount_earned)
  VALUES (v_uid, v_content.id, v_game_type, v_played_on, p_score, v_rank, v_amount > 0, v_amount);

  IF v_amount > 0 THEN
    UPDATE public.profiles
    SET balance = balance + v_amount
    WHERE user_id = v_uid;

    v_label := CASE v_game_type
      WHEN 'wordle' THEN 'Wordle'
      WHEN 'sudoku' THEN 'Sudoku'
      WHEN 'mots_fleches' THEN 'Mots fléchés'
      ELSE v_game_type
    END;

    INSERT INTO public.solde_history (user_id, delta_dc, reason)
    VALUES (
      v_uid,
      v_amount,
      format('%s du jour — %s%s place', v_label, v_rank, CASE WHEN v_rank = 1 THEN 're' ELSE 'e' END)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already', false,
    'rank', v_rank,
    'amount_earned', v_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_rank(p_content_id uuid, p_completed boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_content record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  SELECT * INTO v_content
  FROM public.daily_content
  WHERE id = p_content_id;

  IF v_content IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contenu introuvable');
  END IF;

  RETURN public.submit_game_result(
    v_uid,
    public.normalize_daily_game_type(v_content.type),
    NULL,
    p_completed
  );
END;
$$;