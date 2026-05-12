DROP INDEX IF EXISTS public.daily_scores_user_content_uniq;

CREATE OR REPLACE FUNCTION public.submit_wordle_variant(
  p_variant text,
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
  v_played_on date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_content record;
  v_existing record;
  v_rank integer;
  v_amount integer := 0;
  v_word text;
  v_rewards jsonb;
  v_label text;
  v_variant text := lower(coalesce(p_variant, ''));
  v_default jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  IF v_variant NOT IN ('5','6','7','8','9','culture') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Variante invalide');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(format('wordle:%s:%s', v_variant, v_played_on), 0));

  SELECT *
  INTO v_existing
  FROM public.daily_scores
  WHERE user_id = v_uid
    AND game_type = 'wordle'
    AND played_on = v_played_on
    AND variant = v_variant
  FOR UPDATE;

  IF v_existing IS NOT NULL AND coalesce(v_existing.rewarded, false) = true THEN
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
    AND public.normalize_daily_game_type(type) = 'wordle'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_content IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contenu du jour introuvable');
  END IF;

  v_word := v_content.data->>('word_' || v_variant);
  IF v_word IS NULL OR length(v_word) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mot non disponible pour cette variante');
  END IF;

  IF NOT p_completed THEN
    IF v_existing IS NULL THEN
      INSERT INTO public.daily_scores
        (user_id, content_id, game_type, played_on, variant, score, rank, rewarded, amount_earned)
      VALUES
        (v_uid, v_content.id, 'wordle', v_played_on, v_variant, p_score, NULL, false, 0);
    ELSE
      UPDATE public.daily_scores
      SET content_id = v_content.id,
          score = COALESCE(p_score, score),
          rank = NULL,
          rewarded = false,
          amount_earned = 0,
          finished_at = now()
      WHERE id = v_existing.id;
    END IF;

    RETURN jsonb_build_object('success', true, 'already', false, 'rank', NULL, 'amount_earned', 0);
  END IF;

  SELECT COUNT(*)::integer + 1
  INTO v_rank
  FROM public.daily_scores
  WHERE game_type = 'wordle'
    AND played_on = v_played_on
    AND variant = v_variant
    AND rewarded = true;

  v_default := CASE
    WHEN v_variant = 'culture' THEN '[800,500,300,200,100]'::jsonb
    ELSE '[500,300,200,50,50]'::jsonb
  END;
  v_rewards := COALESCE(v_content.data->('rewards_' || v_variant), v_default);

  IF jsonb_typeof(v_rewards) = 'array' THEN
    IF v_variant = 'culture' THEN
      IF v_rank <= LEAST(5, jsonb_array_length(v_rewards)) THEN
        v_amount := COALESCE((v_rewards->>(v_rank - 1))::integer, 0);
      ELSE
        v_amount := 0;
      END IF;
    ELSE
      IF v_rank <= jsonb_array_length(v_rewards) THEN
        v_amount := COALESCE((v_rewards->>(v_rank - 1))::integer, 0);
      ELSE
        v_amount := COALESCE((v_rewards->>(jsonb_array_length(v_rewards) - 1))::integer, 0);
      END IF;
    END IF;
  END IF;

  IF v_amount < 0 THEN
    v_amount := 0;
  END IF;

  IF v_existing IS NULL THEN
    INSERT INTO public.daily_scores
      (user_id, content_id, game_type, played_on, variant, score, rank, rewarded, amount_earned)
    VALUES
      (v_uid, v_content.id, 'wordle', v_played_on, v_variant, p_score, v_rank, (v_amount > 0), v_amount);
  ELSE
    UPDATE public.daily_scores
    SET content_id = v_content.id,
        score = COALESCE(p_score, score),
        rank = v_rank,
        rewarded = (v_amount > 0),
        amount_earned = v_amount,
        finished_at = now()
    WHERE id = v_existing.id;
  END IF;

  IF v_amount > 0 THEN
    UPDATE public.profiles
    SET balance = balance + v_amount,
        updated_at = now()
    WHERE user_id = v_uid;

    v_label := CASE WHEN v_variant = 'culture' THEN 'Culture' ELSE v_variant || ' lettres' END;

    INSERT INTO public.solde_history (user_id, delta_dc, reason)
    VALUES (v_uid, v_amount, format('Mot du jour (%s) — rang %s', v_label, v_rank));
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already', false,
    'rank', v_rank,
    'amount_earned', v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_wordle_variant(text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_wordle_variant(text, jsonb, boolean) TO authenticated;