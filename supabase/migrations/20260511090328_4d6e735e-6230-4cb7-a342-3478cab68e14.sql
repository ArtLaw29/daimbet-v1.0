
-- Ensure one score per (user, content)
CREATE UNIQUE INDEX IF NOT EXISTS daily_scores_user_content_uniq
  ON public.daily_scores (user_id, content_id);

CREATE OR REPLACE FUNCTION public.claim_daily_rank(p_content_id uuid, p_completed boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_content record;
  v_rank int;
  v_reward int := 0;
  v_existing record;
  v_label text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Non authentifié');
  END IF;

  SELECT * INTO v_content FROM daily_content WHERE id = p_content_id FOR UPDATE;
  IF v_content IS NULL THEN
    RETURN jsonb_build_object('error', 'Contenu introuvable');
  END IF;

  -- Idempotency: if user already claimed, return their stored rank
  SELECT * INTO v_existing FROM daily_scores
    WHERE content_id = p_content_id AND user_id = v_uid;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'already', true,
      'rank', v_existing.rank, 'reward', 0
    );
  END IF;

  IF NOT p_completed THEN
    INSERT INTO daily_scores (user_id, content_id, rank, rewarded)
    VALUES (v_uid, p_content_id, NULL, false);
    RETURN jsonb_build_object('success', true, 'rank', NULL, 'reward', 0);
  END IF;

  -- Atomic rank computation: count finishers (rank not null) + 1
  SELECT COUNT(*)::int + 1 INTO v_rank
  FROM daily_scores
  WHERE content_id = p_content_id AND rank IS NOT NULL;

  v_reward := CASE v_rank
    WHEN 1 THEN 500
    WHEN 2 THEN 300
    WHEN 3 THEN 200
    WHEN 4 THEN 100
    WHEN 5 THEN 50
    ELSE 10
  END;

  INSERT INTO daily_scores (user_id, content_id, rank, rewarded)
  VALUES (v_uid, p_content_id, v_rank, v_reward > 0);

  IF v_reward > 0 THEN
    UPDATE profiles SET balance = balance + v_reward WHERE user_id = v_uid;
    v_label := CASE v_content.type
      WHEN 'wordle' THEN 'Wordle'
      WHEN 'sudoku' THEN 'Sudoku'
      WHEN 'mots_fleches' THEN 'Mots fléchés'
      WHEN 'mots_croises' THEN 'Mots fléchés'
      ELSE v_content.type
    END;
    INSERT INTO solde_history (user_id, delta_dc, reason)
    VALUES (v_uid, v_reward, format('%s du jour — %s%s place', v_label, v_rank, CASE WHEN v_rank=1 THEN 'er' ELSE 'e' END));
  END IF;

  RETURN jsonb_build_object('success', true, 'rank', v_rank, 'reward', v_reward);
END;
$$;
