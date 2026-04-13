
-- Updated resolve_sondage to handle combo format
CREATE OR REPLACE FUNCTION public.resolve_sondage(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session record;
  v_config jsonb;
  v_participation record;
  v_results jsonb;
  v_winner_option text;
  v_winner_option_2 text;
  v_total_pot integer;
  v_winner_count integer;
  v_share integer;
  v_pronostic_correct_count integer;
  v_bonus_per_user integer;
  v_bonus_total integer;
  v_format text;
BEGIN
  SELECT * INTO v_session FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL OR v_session.game_type != 'sondage' THEN
    RETURN jsonb_build_object('error', 'Sondage introuvable');
  END IF;
  IF v_session.status NOT IN ('active', 'voting') THEN
    RETURN jsonb_build_object('error', 'Ce sondage est déjà clôturé');
  END IF;

  v_config := v_session.config;
  v_format := COALESCE(v_config->>'format', 'simple');

  -- Total pot
  SELECT COALESCE(SUM((data->>'bet_amount')::integer), 0) INTO v_total_pot
  FROM game_participations WHERE session_id = p_session_id;

  IF v_format = 'combinaison' THEN
    -- For combo: count votes from the votes array
    -- Each participation has data.votes = ["combo1", "combo2"]
    WITH vote_counts AS (
      SELECT v.vote, COUNT(*) as cnt
      FROM game_participations gp,
           jsonb_array_elements_text(gp.data->'votes') AS v(vote)
      WHERE gp.session_id = p_session_id
      GROUP BY v.vote
      ORDER BY COUNT(*) DESC
    )
    SELECT vote INTO v_winner_option FROM vote_counts LIMIT 1;

    WITH vote_counts AS (
      SELECT v.vote, COUNT(*) as cnt
      FROM game_participations gp,
           jsonb_array_elements_text(gp.data->'votes') AS v(vote)
      WHERE gp.session_id = p_session_id
      GROUP BY v.vote
      ORDER BY COUNT(*) DESC
    )
    SELECT vote INTO v_winner_option_2 FROM vote_counts OFFSET 1 LIMIT 1;

    IF v_winner_option IS NULL THEN
      UPDATE game_sessions SET status = 'closed', closed_at = now() WHERE id = p_session_id;
      RETURN jsonb_build_object('success', true, 'message', 'Aucun vote');
    END IF;

    -- Count users who voted for #1 (in their votes array)
    SELECT COUNT(DISTINCT gp.user_id) INTO v_winner_count
    FROM game_participations gp,
         jsonb_array_elements_text(gp.data->'votes') AS v(vote)
    WHERE gp.session_id = p_session_id AND v.vote = v_winner_option;

    v_share := CASE WHEN v_winner_count > 0 THEN FLOOR(v_total_pot::numeric / v_winner_count) ELSE 0 END;

    -- Distribute to users who voted for #1
    FOR v_participation IN
      SELECT DISTINCT ON (gp.user_id) gp.*
      FROM game_participations gp,
           jsonb_array_elements_text(gp.data->'votes') AS v(vote)
      WHERE gp.session_id = p_session_id AND v.vote = v_winner_option
    LOOP
      UPDATE profiles SET balance = balance + v_share WHERE user_id = v_participation.user_id;
      INSERT INTO solde_history (user_id, delta_dc, reason)
      VALUES (v_participation.user_id, v_share, format('Gain sondage: %s', v_session.title));
    END LOOP;

    -- Bonus: must predict both #1 AND #2
    v_bonus_total := COALESCE((v_config->>'bonus_amount')::integer, v_total_pot);
    SELECT COUNT(*) INTO v_pronostic_correct_count
    FROM game_participations
    WHERE session_id = p_session_id
      AND data->>'pronostic_first' = v_winner_option
      AND data->>'pronostic_second' = v_winner_option_2;

    v_bonus_per_user := 0;
    IF v_pronostic_correct_count > 0 THEN
      v_bonus_per_user := FLOOR(v_bonus_total::numeric / v_pronostic_correct_count);
      FOR v_participation IN
        SELECT * FROM game_participations
        WHERE session_id = p_session_id
          AND data->>'pronostic_first' = v_winner_option
          AND data->>'pronostic_second' = v_winner_option_2
      LOOP
        UPDATE profiles SET balance = balance + v_bonus_per_user WHERE user_id = v_participation.user_id;
        INSERT INTO solde_history (user_id, delta_dc, reason)
        VALUES (v_participation.user_id, v_bonus_per_user, format('Bonus pronostic: %s', v_session.title));
      END LOOP;
    END IF;

    -- Build results from vote counts
    WITH vote_counts AS (
      SELECT v.vote as option, COUNT(*) as cnt,
             COALESCE(SUM((gp.data->>'bet_amount')::integer), 0) as total_bet
      FROM game_participations gp,
           jsonb_array_elements_text(gp.data->'votes') AS v(vote)
      WHERE gp.session_id = p_session_id
      GROUP BY v.vote
      ORDER BY COUNT(*) DESC
    )
    SELECT jsonb_agg(jsonb_build_object('option', vc.option, 'count', vc.cnt, 'total_bet', vc.total_bet))
    INTO v_results FROM vote_counts vc;

    UPDATE game_sessions SET
      status = 'closed', closed_at = now(),
      config = v_config || jsonb_build_object(
        'results', v_results, 'winner_option', v_winner_option, 'winner_option_2', v_winner_option_2,
        'total_pot', v_total_pot, 'winner_share', v_share,
        'bonus_per_user', v_bonus_per_user, 'pronostic_correct_count', v_pronostic_correct_count
      )
    WHERE id = p_session_id;

  ELSE
    -- Simple / predefined_libre format (original logic)
    SELECT data->>'vote' INTO v_winner_option
    FROM game_participations WHERE session_id = p_session_id
    GROUP BY data->>'vote' ORDER BY COUNT(*) DESC LIMIT 1;

    IF v_winner_option IS NULL THEN
      UPDATE game_sessions SET status = 'closed', closed_at = now() WHERE id = p_session_id;
      RETURN jsonb_build_object('success', true, 'message', 'Aucun vote');
    END IF;

    SELECT COUNT(*) INTO v_winner_count
    FROM game_participations WHERE session_id = p_session_id AND data->>'vote' = v_winner_option;

    v_share := CASE WHEN v_winner_count > 0 THEN FLOOR(v_total_pot::numeric / v_winner_count) ELSE 0 END;

    FOR v_participation IN
      SELECT * FROM game_participations WHERE session_id = p_session_id AND data->>'vote' = v_winner_option
    LOOP
      UPDATE profiles SET balance = balance + v_share WHERE user_id = v_participation.user_id;
      INSERT INTO solde_history (user_id, delta_dc, reason)
      VALUES (v_participation.user_id, v_share, format('Gain sondage: %s', v_session.title));
    END LOOP;

    v_bonus_total := COALESCE((v_config->>'bonus_amount')::integer, v_total_pot);
    SELECT COUNT(*) INTO v_pronostic_correct_count
    FROM game_participations WHERE session_id = p_session_id AND data->>'pronostic' = v_winner_option;

    v_bonus_per_user := 0;
    IF v_pronostic_correct_count > 0 THEN
      v_bonus_per_user := FLOOR(v_bonus_total::numeric / v_pronostic_correct_count);
      FOR v_participation IN
        SELECT * FROM game_participations WHERE session_id = p_session_id AND data->>'pronostic' = v_winner_option
      LOOP
        UPDATE profiles SET balance = balance + v_bonus_per_user WHERE user_id = v_participation.user_id;
        INSERT INTO solde_history (user_id, delta_dc, reason)
        VALUES (v_participation.user_id, v_bonus_per_user, format('Bonus pronostic: %s', v_session.title));
      END LOOP;
    END IF;

    SELECT jsonb_agg(jsonb_build_object('option', sub.vote, 'count', sub.cnt, 'total_bet', sub.total_bet) ORDER BY sub.cnt DESC)
    INTO v_results
    FROM (
      SELECT data->>'vote' as vote, COUNT(*) as cnt, COALESCE(SUM((data->>'bet_amount')::integer), 0) as total_bet
      FROM game_participations WHERE session_id = p_session_id
      GROUP BY data->>'vote'
    ) sub;

    UPDATE game_sessions SET
      status = 'closed', closed_at = now(),
      config = v_config || jsonb_build_object(
        'results', v_results, 'winner_option', v_winner_option,
        'total_pot', v_total_pot, 'winner_share', v_share,
        'bonus_per_user', v_bonus_per_user, 'pronostic_correct_count', v_pronostic_correct_count
      )
    WHERE id = p_session_id;
  END IF;

  INSERT INTO gazette_messages (content, is_system_message)
  VALUES (format('📊 Sondage terminé : "%s" — Le #1 est : %s ! 🎉', v_session.title, v_winner_option), true);

  RETURN jsonb_build_object('success', true, 'winner', v_winner_option, 'total_pot', v_total_pot);
END;
$$;

-- Updated place_sondage_vote to handle combo format (votes array instead of single vote)
CREATE OR REPLACE FUNCTION public.place_sondage_vote(
  p_user_id uuid,
  p_session_id uuid,
  p_vote text,
  p_pronostic text,
  p_bet_amount integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session record;
  v_profile record;
  v_max_bet integer;
  v_existing record;
  v_config jsonb;
  v_effective_balance integer;
BEGIN
  SELECT * INTO v_session FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL OR v_session.game_type != 'sondage' THEN
    RETURN jsonb_build_object('error', 'Sondage introuvable');
  END IF;
  IF v_session.status NOT IN ('active', 'voting') THEN
    RETURN jsonb_build_object('error', 'Ce sondage n''est plus ouvert aux votes');
  END IF;

  v_config := v_session.config;

  IF v_config->>'end_date' IS NOT NULL AND
     now() > (v_config->>'end_date')::timestamptz - interval '20 minutes' THEN
    RETURN jsonb_build_object('error', 'Les votes sont clos (20 min avant la fin)');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'Profil introuvable');
  END IF;

  IF p_bet_amount < 1 THEN
    RETURN jsonb_build_object('error', 'Mise minimum : 1 DC');
  END IF;

  SELECT * INTO v_existing FROM game_participations
  WHERE session_id = p_session_id AND user_id = p_user_id FOR UPDATE;

  v_effective_balance := v_profile.balance;

  IF v_existing IS NOT NULL THEN
    v_effective_balance := v_effective_balance + COALESCE((v_existing.data->>'bet_amount')::integer, 0);
    UPDATE profiles SET balance = balance + COALESCE((v_existing.data->>'bet_amount')::integer, 0)
    WHERE user_id = p_user_id;
  END IF;

  v_max_bet := FLOOR(v_effective_balance * 0.20);
  IF p_bet_amount > v_max_bet THEN
    RETURN jsonb_build_object('error', format('Mise max : %s DC (20%% de ton capital)', v_max_bet));
  END IF;
  IF p_bet_amount > v_effective_balance THEN
    RETURN jsonb_build_object('error', 'Pas assez de DAIMcoins !');
  END IF;

  UPDATE profiles SET balance = balance - p_bet_amount WHERE user_id = p_user_id;

  -- p_vote is a JSON string for combo format, plain text for simple
  -- p_pronostic is a JSON string for combo format, plain text for simple
  -- The client serializes the data appropriately into these text fields
  -- We store the raw data as-is in the JSONB

  IF v_existing IS NOT NULL THEN
    UPDATE game_participations SET data = 
      CASE 
        WHEN COALESCE(v_config->>'format', 'simple') = 'combinaison' THEN
          jsonb_build_object(
            'combo', (p_vote::jsonb)->>'combo',
            'votes', (p_vote::jsonb)->'votes',
            'pronostic_first', (p_pronostic::jsonb)->>'first',
            'pronostic_second', (p_pronostic::jsonb)->>'second',
            'bet_amount', p_bet_amount
          )
        ELSE
          jsonb_build_object('vote', p_vote, 'pronostic', p_pronostic, 'bet_amount', p_bet_amount)
      END
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO game_participations (session_id, user_id, data)
    VALUES (p_session_id, p_user_id, 
      CASE 
        WHEN COALESCE(v_config->>'format', 'simple') = 'combinaison' THEN
          jsonb_build_object(
            'combo', (p_vote::jsonb)->>'combo',
            'votes', (p_vote::jsonb)->'votes',
            'pronostic_first', (p_pronostic::jsonb)->>'first',
            'pronostic_second', (p_pronostic::jsonb)->>'second',
            'bet_amount', p_bet_amount
          )
        ELSE
          jsonb_build_object('vote', p_vote, 'pronostic', p_pronostic, 'bet_amount', p_bet_amount)
      END
    );
  END IF;

  -- For combo: add the user's combo to session options if not already present
  IF COALESCE(v_config->>'format', 'simple') = 'combinaison' THEN
    DECLARE
      v_combo text := (p_vote::jsonb)->>'combo';
      v_current_options jsonb;
    BEGIN
      v_current_options := COALESCE(v_config->'options', '[]'::jsonb);
      IF NOT v_current_options ? v_combo THEN
        UPDATE game_sessions SET config = jsonb_set(v_config, '{options}', v_current_options || to_jsonb(v_combo))
        WHERE id = p_session_id;
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
