-- Scoring helper
CREATE OR REPLACE FUNCTION public.ballon_dor_score(p_data jsonb, p_config jsonb)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_off text[];
  v_top text[];
  i int;
  j int;
  v_pos int;
  v_score int := 0;
BEGIN
  SELECT array(SELECT jsonb_array_elements_text(COALESCE(p_config->'official_top10', '[]'::jsonb))) INTO v_off;
  SELECT array(SELECT jsonb_array_elements_text(COALESCE(p_data->'top10', '[]'::jsonb))) INTO v_top;

  FOR i IN 1..COALESCE(array_length(v_top, 1), 0) LOOP
    v_pos := NULL;
    FOR j IN 1..COALESCE(array_length(v_off, 1), 0) LOOP
      IF v_off[j] IS NOT NULL AND v_off[j] <> '' AND v_off[j] = v_top[i] THEN
        v_pos := j;
        EXIT;
      END IF;
    END LOOP;
    IF v_pos IS NOT NULL THEN
      IF v_pos = i THEN
        v_score := v_score + 10;
      ELSIF abs(v_pos - i) = 1 THEN
        v_score := v_score + 5;
      ELSE
        v_score := v_score + 2;
      END IF;
    END IF;
  END LOOP;

  IF COALESCE(p_config->>'official_kopa', '') <> '' AND p_config->>'official_kopa' = COALESCE(p_data->>'kopa', '') THEN
    v_score := v_score + 5;
  END IF;
  IF COALESCE(p_config->>'official_yashin', '') <> '' AND p_config->>'official_yashin' = COALESCE(p_data->>'yashin', '') THEN
    v_score := v_score + 5;
  END IF;

  RETURN v_score;
END;
$$;

-- Submit / update a pronostic (handles the buy-in atomically)
CREATE OR REPLACE FUNCTION public.submit_ballon_dor(p_top10 text[], p_kopa text, p_yashin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sess record;
  v_buyin int;
  v_existing record;
  v_balance int;
  v_data jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  SELECT * INTO v_sess FROM game_sessions WHERE id = '00000000-0000-0000-0000-000000000005';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Concours introuvable');
  END IF;
  IF v_sess.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le concours est clôturé');
  END IF;
  IF now() >= (v_sess.config->>'deadline_iso')::timestamptz THEN
    RETURN jsonb_build_object('success', false, 'error', 'Date limite dépassée, les pronostics sont verrouillés');
  END IF;
  IF COALESCE(array_length(p_top10, 1), 0) <> 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Il faut exactement 10 joueurs');
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_top10) x) <> 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Doublons détectés dans le Top 10');
  END IF;

  v_buyin := COALESCE((v_sess.config->>'buy_in')::int, 100);

  SELECT * INTO v_existing FROM game_participations
   WHERE session_id = v_sess.id AND user_id = v_uid
   ORDER BY created_at DESC LIMIT 1;

  IF v_existing.id IS NULL THEN
    SELECT balance INTO v_balance FROM profiles WHERE user_id = v_uid;
    IF COALESCE(v_balance, 0) < v_buyin THEN
      RETURN jsonb_build_object('success', false, 'error', 'Solde insuffisant');
    END IF;
    UPDATE profiles SET balance = balance - v_buyin, updated_at = now() WHERE user_id = v_uid;
    INSERT INTO solde_history (user_id, delta_dc, reason)
    VALUES (v_uid, -v_buyin, 'Inscription concours Ballon d''Or 2026');

    v_data := jsonb_build_object('top10', to_jsonb(p_top10), 'kopa', COALESCE(p_kopa, ''), 'yashin', COALESCE(p_yashin, ''), 'paid', v_buyin);
    INSERT INTO game_participations (session_id, user_id, data) VALUES (v_sess.id, v_uid, v_data);
    RETURN jsonb_build_object('success', true, 'charged', v_buyin);
  ELSE
    v_data := jsonb_build_object('top10', to_jsonb(p_top10), 'kopa', COALESCE(p_kopa, ''), 'yashin', COALESCE(p_yashin, ''),
                                 'paid', COALESCE((v_existing.data->>'paid')::int, v_buyin));
    UPDATE game_participations SET data = v_data WHERE id = v_existing.id;
    DELETE FROM game_participations WHERE session_id = v_sess.id AND user_id = v_uid AND id <> v_existing.id;
    RETURN jsonb_build_object('success', true, 'charged', 0);
  END IF;
END;
$$;

-- Public read of all pronostics + live scores
CREATE OR REPLACE FUNCTION public.get_ballon_dor_pronostics()
RETURNS TABLE(user_id uuid, display_name text, emoji text, avatar_url text, data jsonb, score integer, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id,
         pr.display_name,
         pr.emoji,
         pr.avatar_url,
         p.data,
         public.ballon_dor_score(p.data, s.config) AS score,
         p.created_at
    FROM game_participations p
    JOIN game_sessions s ON s.id = p.session_id
    LEFT JOIN profiles pr ON pr.user_id = p.user_id
   WHERE p.session_id = '00000000-0000-0000-0000-000000000005'
     AND auth.uid() IS NOT NULL
   ORDER BY score DESC, p.created_at ASC;
$$;

-- Close the contest and pay out
CREATE OR REPLACE FUNCTION public.resolve_ballon_dor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess record;
  v_pool numeric;
  v_buyin int;
  v_pcts jsonb;
  v_prizes numeric[];
  r record;
  i int;
  u uuid;
  v_tier int := 1;
  v_sum numeric;
  v_each numeric;
  v_gross int;
  v_net int;
  v_rake int;
  v_credit int;
  v_winners jsonb := '[]'::jsonb;
  v_msg text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Réservé aux administrateurs');
  END IF;

  SELECT * INTO v_sess FROM game_sessions WHERE id = '00000000-0000-0000-0000-000000000005';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Concours introuvable');
  END IF;
  IF v_sess.status = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Concours déjà clôturé');
  END IF;

  v_pool := COALESCE((v_sess.config->>'total_prize_pool')::numeric, 10000);
  v_buyin := COALESCE((v_sess.config->>'buy_in')::int, 100);
  v_pcts := COALESCE(v_sess.config->'payout_percentages', '{"first":50,"second":30,"third":20}'::jsonb);
  v_prizes := ARRAY[
    v_pool * COALESCE((v_pcts->>'first')::numeric, 50) / 100,
    v_pool * COALESCE((v_pcts->>'second')::numeric, 30) / 100,
    v_pool * COALESCE((v_pcts->>'third')::numeric, 20) / 100
  ];

  FOR r IN
    SELECT s.score, array_agg(s.user_id) AS users, count(*)::int AS n
      FROM (SELECT p.user_id, public.ballon_dor_score(p.data, v_sess.config) AS score
              FROM game_participations p
             WHERE p.session_id = v_sess.id) s
     GROUP BY s.score
     ORDER BY s.score DESC
  LOOP
    EXIT WHEN v_tier > 3;
    v_sum := 0;
    FOR i IN v_tier..LEAST(3, v_tier + r.n - 1) LOOP
      v_sum := v_sum + v_prizes[i];
    END LOOP;
    v_each := floor(v_sum / r.n);
    IF v_each > 0 THEN
      FOREACH u IN ARRAY r.users LOOP
        v_gross := v_each::int;
        v_net := v_gross - v_buyin;
        v_rake := CASE WHEN v_net > 0 THEN floor(v_net * 0.05)::int ELSE 0 END;
        v_credit := v_gross - v_rake;
        UPDATE profiles SET balance = balance + v_credit, updated_at = now() WHERE user_id = u;
        INSERT INTO solde_history (user_id, delta_dc, reason)
        VALUES (u, v_credit, 'Gains concours Ballon d''Or 2026 (rake 5%)');
        v_winners := v_winners || jsonb_build_object('user_id', u, 'score', r.score, 'gross', v_gross, 'credit', v_credit);
      END LOOP;
    END IF;
    v_tier := v_tier + r.n;
  END LOOP;

  UPDATE game_sessions SET status = 'closed', closed_at = now(), updated_at = now() WHERE id = v_sess.id;

  SELECT '⚽ Concours Ballon d''Or 2026 terminé ! ' ||
         COALESCE(string_agg(pr.display_name || ' (' || (w->>'score') || ' pts) → +' || (w->>'credit') || ' DC', ' · '), 'Aucun gagnant.')
    INTO v_msg
    FROM jsonb_array_elements(v_winners) w
    LEFT JOIN profiles pr ON pr.user_id = (w->>'user_id')::uuid;

  INSERT INTO gazette_messages (user_id, content, is_system_message)
  VALUES (NULL, COALESCE(v_msg, '⚽ Concours Ballon d''Or 2026 terminé !'), true);

  RETURN jsonb_build_object('success', true, 'winners', v_winners);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ballon_dor_score(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ballon_dor(text[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ballon_dor_pronostics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_ballon_dor() TO authenticated;