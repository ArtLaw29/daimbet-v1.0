
-- Function: place or update a sondage vote with bet and pronostic
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

  -- Check 20min before end
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

  -- Check existing and refund if changing vote
  SELECT * INTO v_existing FROM game_participations
  WHERE session_id = p_session_id AND user_id = p_user_id FOR UPDATE;

  v_effective_balance := v_profile.balance;

  IF v_existing IS NOT NULL THEN
    -- Refund old bet
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

  -- Deduct new bet
  UPDATE profiles SET balance = balance - p_bet_amount WHERE user_id = p_user_id;

  -- Upsert participation
  IF v_existing IS NOT NULL THEN
    UPDATE game_participations SET data = jsonb_build_object(
      'vote', p_vote, 'pronostic', p_pronostic, 'bet_amount', p_bet_amount
    ) WHERE id = v_existing.id;
  ELSE
    INSERT INTO game_participations (session_id, user_id, data)
    VALUES (p_session_id, p_user_id, jsonb_build_object(
      'vote', p_vote, 'pronostic', p_pronostic, 'bet_amount', p_bet_amount
    ));
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function: resolve a sondage, distribute pot and bonus
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
  v_total_pot integer;
  v_winner_count integer;
  v_share integer;
  v_pronostic_correct_count integer;
  v_bonus_per_user integer;
  v_bonus_total integer;
BEGIN
  SELECT * INTO v_session FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL OR v_session.game_type != 'sondage' THEN
    RETURN jsonb_build_object('error', 'Sondage introuvable');
  END IF;
  IF v_session.status NOT IN ('active', 'voting') THEN
    RETURN jsonb_build_object('error', 'Ce sondage est déjà clôturé');
  END IF;

  v_config := v_session.config;

  -- Total pot
  SELECT COALESCE(SUM((data->>'bet_amount')::integer), 0) INTO v_total_pot
  FROM game_participations WHERE session_id = p_session_id;

  -- Find #1 option (most votes)
  SELECT data->>'vote' INTO v_winner_option
  FROM game_participations WHERE session_id = p_session_id
  GROUP BY data->>'vote'
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_winner_option IS NULL THEN
    UPDATE game_sessions SET status = 'closed', closed_at = now() WHERE id = p_session_id;
    RETURN jsonb_build_object('success', true, 'message', 'Aucun vote');
  END IF;

  -- Count #1 voters
  SELECT COUNT(*) INTO v_winner_count
  FROM game_participations WHERE session_id = p_session_id AND data->>'vote' = v_winner_option;

  -- Share per winner
  v_share := CASE WHEN v_winner_count > 0 THEN FLOOR(v_total_pot::numeric / v_winner_count) ELSE 0 END;

  -- Distribute pot to #1 voters
  FOR v_participation IN
    SELECT * FROM game_participations WHERE session_id = p_session_id AND data->>'vote' = v_winner_option
  LOOP
    UPDATE profiles SET balance = balance + v_share WHERE user_id = v_participation.user_id;
    INSERT INTO solde_history (user_id, delta_dc, reason)
    VALUES (v_participation.user_id, v_share, format('Gain sondage: %s', v_session.title));
  END LOOP;

  -- Bonus for correct pronostic
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

  -- Build results
  SELECT jsonb_agg(jsonb_build_object('option', sub.vote, 'count', sub.cnt, 'total_bet', sub.total_bet) ORDER BY sub.cnt DESC)
  INTO v_results
  FROM (
    SELECT data->>'vote' as vote, COUNT(*) as cnt, COALESCE(SUM((data->>'bet_amount')::integer), 0) as total_bet
    FROM game_participations WHERE session_id = p_session_id
    GROUP BY data->>'vote'
  ) sub;

  -- Update session with results
  UPDATE game_sessions SET
    status = 'closed',
    closed_at = now(),
    config = v_config || jsonb_build_object(
      'results', v_results,
      'winner_option', v_winner_option,
      'total_pot', v_total_pot,
      'winner_share', v_share,
      'bonus_per_user', v_bonus_per_user,
      'pronostic_correct_count', v_pronostic_correct_count
    )
  WHERE id = p_session_id;

  -- Gazette
  INSERT INTO gazette_messages (content, is_system_message)
  VALUES (format('📊 Sondage terminé : "%s" — Le #1 est : %s ! 🎉', v_session.title, v_winner_option), true);

  RETURN jsonb_build_object('success', true, 'winner', v_winner_option, 'total_pot', v_total_pot);
END;
$$;
