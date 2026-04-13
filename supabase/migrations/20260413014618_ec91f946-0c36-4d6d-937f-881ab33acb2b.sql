
-- Function: place a bet on tournament winner prediction
CREATE OR REPLACE FUNCTION public.place_tournoi_bet(
  p_user_id uuid, p_session_id uuid, p_predicted_winner text, p_bet_amount integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session record;
  v_profile record;
  v_max_bet integer;
  v_existing record;
  v_effective_balance integer;
BEGIN
  SELECT * INTO v_session FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL OR v_session.game_type != 'tournoi' THEN
    RETURN jsonb_build_object('error', 'Tournoi introuvable');
  END IF;
  -- Betting only allowed before voting starts (status = active, bracket not started)
  IF v_session.status NOT IN ('active') THEN
    RETURN jsonb_build_object('error', 'La période de mise est terminée');
  END IF;
  IF (v_session.config->>'current_round') IS NOT NULL AND (v_session.config->>'current_round')::int > 0 THEN
    RETURN jsonb_build_object('error', 'Le tournoi a déjà commencé, les mises sont fermées');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('error', 'Profil introuvable'); END IF;

  IF p_bet_amount < 10 THEN RETURN jsonb_build_object('error', 'Mise minimum : 10 DC'); END IF;

  SELECT * INTO v_existing FROM game_participations
  WHERE session_id = p_session_id AND user_id = p_user_id FOR UPDATE;

  v_effective_balance := v_profile.balance;
  IF v_existing IS NOT NULL THEN
    v_effective_balance := v_effective_balance + COALESCE((v_existing.data->>'bet_amount')::integer, 0);
    UPDATE profiles SET balance = balance + COALESCE((v_existing.data->>'bet_amount')::integer, 0)
    WHERE user_id = p_user_id;
  END IF;

  v_max_bet := FLOOR(v_effective_balance * 0.10);
  IF p_bet_amount > v_max_bet THEN
    RETURN jsonb_build_object('error', format('Mise max : %s DC (10%% de ton capital)', v_max_bet));
  END IF;
  IF p_bet_amount > v_effective_balance THEN
    RETURN jsonb_build_object('error', 'Pas assez de DAIMcoins !');
  END IF;

  UPDATE profiles SET balance = balance - p_bet_amount WHERE user_id = p_user_id;

  IF v_existing IS NOT NULL THEN
    UPDATE game_participations SET data = jsonb_build_object(
      'predicted_winner', p_predicted_winner, 'bet_amount', p_bet_amount
    ) || COALESCE(v_existing.data - 'predicted_winner' - 'bet_amount', '{}'::jsonb)
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO game_participations (session_id, user_id, data)
    VALUES (p_session_id, p_user_id, jsonb_build_object('predicted_winner', p_predicted_winner, 'bet_amount', p_bet_amount));
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function: resolve the tournament (distribute pot to winners)
CREATE OR REPLACE FUNCTION public.resolve_tournoi(p_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session record;
  v_config jsonb;
  v_winner text;
  v_total_pot integer;
  v_winner_count integer;
  v_share integer;
  v_participation record;
BEGIN
  SELECT * INTO v_session FROM game_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL OR v_session.game_type != 'tournoi' THEN
    RETURN jsonb_build_object('error', 'Tournoi introuvable');
  END IF;

  v_config := v_session.config;
  v_winner := v_config->>'tournament_winner';
  IF v_winner IS NULL THEN
    RETURN jsonb_build_object('error', 'Aucun vainqueur désigné');
  END IF;

  -- Total pot
  SELECT COALESCE(SUM((data->>'bet_amount')::integer), 0) INTO v_total_pot
  FROM game_participations WHERE session_id = p_session_id AND data->>'bet_amount' IS NOT NULL;

  -- Count correct predictions
  SELECT COUNT(*) INTO v_winner_count
  FROM game_participations WHERE session_id = p_session_id AND data->>'predicted_winner' = v_winner;

  v_share := 0;
  IF v_winner_count > 0 AND v_total_pot > 0 THEN
    v_share := FLOOR(v_total_pot::numeric / v_winner_count);
    FOR v_participation IN
      SELECT * FROM game_participations
      WHERE session_id = p_session_id AND data->>'predicted_winner' = v_winner
    LOOP
      UPDATE profiles SET balance = balance + v_share WHERE user_id = v_participation.user_id;
      INSERT INTO solde_history (user_id, delta_dc, reason)
      VALUES (v_participation.user_id, v_share, format('Gain tournoi: %s', v_session.title));
    END LOOP;
  END IF;

  UPDATE game_sessions SET status = 'closed', closed_at = now(),
    config = v_config || jsonb_build_object('total_pot', v_total_pot, 'winner_share', v_share, 'winner_count', v_winner_count)
  WHERE id = p_session_id;

  INSERT INTO gazette_messages (content, is_system_message)
  VALUES (format('🏆 Tournoi terminé : "%s" — Le vainqueur est : %s ! 🎉', v_session.title, v_winner), true);

  RETURN jsonb_build_object('success', true, 'winner', v_winner, 'total_pot', v_total_pot, 'share', v_share);
END;
$$;
