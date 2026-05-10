-- RPCs for external bets (peer-to-peer DC bets resolved off-platform)

CREATE OR REPLACE FUNCTION public.create_external_bet(p_opponent_id uuid, p_mise integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creator uuid := auth.uid();
  v_profile record;
  v_bet_id uuid;
BEGIN
  IF v_creator IS NULL THEN RETURN jsonb_build_object('error', 'Non authentifié'); END IF;
  IF p_opponent_id = v_creator THEN RETURN jsonb_build_object('error', 'Tu ne peux pas te défier toi-même'); END IF;
  IF p_mise < 1 THEN RETURN jsonb_build_object('error', 'Mise minimum : 1 DC'); END IF;

  SELECT * INTO v_profile FROM profiles WHERE user_id = v_creator FOR UPDATE;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('error', 'Profil introuvable'); END IF;
  IF p_mise > v_profile.balance THEN RETURN jsonb_build_object('error', 'Pas assez de DAIMcoins !'); END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = p_opponent_id) THEN
    RETURN jsonb_build_object('error', 'Adversaire introuvable');
  END IF;

  UPDATE profiles SET balance = balance - p_mise WHERE user_id = v_creator;
  INSERT INTO solde_history (user_id, delta_dc, reason)
  VALUES (v_creator, -p_mise, 'Pari externe : mise engagée');

  INSERT INTO external_bets (player1_id, player2_id, mise, status)
  VALUES (v_creator, p_opponent_id, p_mise, 'en_attente')
  RETURNING id INTO v_bet_id;

  RETURN jsonb_build_object('success', true, 'bet_id', v_bet_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_external_bet(p_bet_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bet record;
  v_p2 record;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'Non authentifié'); END IF;
  SELECT * INTO v_bet FROM external_bets WHERE id = p_bet_id FOR UPDATE;
  IF v_bet IS NULL THEN RETURN jsonb_build_object('error', 'Pari introuvable'); END IF;
  IF v_bet.player2_id <> v_uid THEN RETURN jsonb_build_object('error', 'Tu n''es pas l''adversaire de ce pari'); END IF;
  IF v_bet.status <> 'en_attente' THEN RETURN jsonb_build_object('error', 'Ce pari n''est plus en attente'); END IF;

  IF p_accept THEN
    SELECT * INTO v_p2 FROM profiles WHERE user_id = v_uid FOR UPDATE;
    IF v_p2.balance < v_bet.mise THEN RETURN jsonb_build_object('error', 'Pas assez de DAIMcoins !'); END IF;
    UPDATE profiles SET balance = balance - v_bet.mise WHERE user_id = v_uid;
    INSERT INTO solde_history (user_id, delta_dc, reason)
    VALUES (v_uid, -v_bet.mise, 'Pari externe : mise engagée');
    UPDATE external_bets SET status = 'accepte' WHERE id = p_bet_id;
  ELSE
    -- Refund creator
    UPDATE profiles SET balance = balance + v_bet.mise WHERE user_id = v_bet.player1_id;
    INSERT INTO solde_history (user_id, delta_dc, reason)
    VALUES (v_bet.player1_id, v_bet.mise, 'Pari externe : refusé par l''adversaire (remboursement)');
    UPDATE external_bets SET status = 'refuse' WHERE id = p_bet_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.declare_external_result(p_bet_id uuid, p_result text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bet record;
  v_r1 text; v_r2 text;
  v_winner uuid;
  v_pot integer;
  v_p1_name text; v_p2_name text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'Non authentifié'); END IF;
  IF p_result NOT IN ('gagne','perdu','egalite') THEN RETURN jsonb_build_object('error', 'Résultat invalide'); END IF;

  SELECT * INTO v_bet FROM external_bets WHERE id = p_bet_id FOR UPDATE;
  IF v_bet IS NULL THEN RETURN jsonb_build_object('error', 'Pari introuvable'); END IF;
  IF v_uid NOT IN (v_bet.player1_id, v_bet.player2_id) THEN RETURN jsonb_build_object('error', 'Tu ne participes pas à ce pari'); END IF;
  IF v_bet.status NOT IN ('accepte') THEN RETURN jsonb_build_object('error', 'Ce pari n''est pas en cours'); END IF;

  IF v_uid = v_bet.player1_id THEN
    IF v_bet.result_player1 IS NOT NULL THEN RETURN jsonb_build_object('error', 'Résultat déjà déclaré'); END IF;
    UPDATE external_bets SET result_player1 = p_result WHERE id = p_bet_id;
    v_r1 := p_result; v_r2 := v_bet.result_player2;
  ELSE
    IF v_bet.result_player2 IS NOT NULL THEN RETURN jsonb_build_object('error', 'Résultat déjà déclaré'); END IF;
    UPDATE external_bets SET result_player2 = p_result WHERE id = p_bet_id;
    v_r2 := p_result; v_r1 := v_bet.result_player1;
  END IF;

  -- If both declared, resolve
  IF v_r1 IS NOT NULL AND v_r2 IS NOT NULL THEN
    v_pot := v_bet.mise * 2;
    IF v_r1 = 'gagne' AND v_r2 = 'perdu' THEN v_winner := v_bet.player1_id;
    ELSIF v_r1 = 'perdu' AND v_r2 = 'gagne' THEN v_winner := v_bet.player2_id;
    ELSIF v_r1 = 'egalite' AND v_r2 = 'egalite' THEN
      UPDATE profiles SET balance = balance + v_bet.mise WHERE user_id = v_bet.player1_id;
      UPDATE profiles SET balance = balance + v_bet.mise WHERE user_id = v_bet.player2_id;
      INSERT INTO solde_history (user_id, delta_dc, reason) VALUES
        (v_bet.player1_id, v_bet.mise, 'Pari externe : égalité (remboursement)'),
        (v_bet.player2_id, v_bet.mise, 'Pari externe : égalité (remboursement)');
      UPDATE external_bets SET status = 'termine' WHERE id = p_bet_id;
      RETURN jsonb_build_object('success', true, 'outcome', 'egalite');
    ELSE
      -- Litige
      UPDATE external_bets SET status = 'litige' WHERE id = p_bet_id;
      SELECT display_name INTO v_p1_name FROM profiles WHERE user_id = v_bet.player1_id;
      SELECT display_name INTO v_p2_name FROM profiles WHERE user_id = v_bet.player2_id;
      INSERT INTO admin_notifications (type, title, detail, reference_id)
      VALUES ('external_bet_dispute',
        format('Litige pari externe : %s vs %s', COALESCE(v_p1_name,'?'), COALESCE(v_p2_name,'?')),
        format('%s déclare "%s", %s déclare "%s". Mise : %s DC chacun.', v_p1_name, v_r1, v_p2_name, v_r2, v_bet.mise),
        p_bet_id);
      RETURN jsonb_build_object('success', true, 'outcome', 'litige');
    END IF;

    -- Winner case
    UPDATE profiles SET balance = balance + v_pot WHERE user_id = v_winner;
    INSERT INTO solde_history (user_id, delta_dc, reason)
    VALUES (v_winner, v_pot, 'Pari externe : victoire');
    UPDATE external_bets SET status = 'termine' WHERE id = p_bet_id;
    RETURN jsonb_build_object('success', true, 'outcome', 'gagnant', 'winner', v_winner);
  END IF;

  RETURN jsonb_build_object('success', true, 'outcome', 'en_attente_adversaire');
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_external_bet_dispute(p_bet_id uuid, p_resolution text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bet record;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RETURN jsonb_build_object('error', 'forbidden'); END IF;
  IF p_resolution NOT IN ('player1_wins','player2_wins','refund') THEN RETURN jsonb_build_object('error', 'Résolution invalide'); END IF;
  SELECT * INTO v_bet FROM external_bets WHERE id = p_bet_id FOR UPDATE;
  IF v_bet IS NULL OR v_bet.status <> 'litige' THEN RETURN jsonb_build_object('error', 'Litige introuvable'); END IF;

  IF p_resolution = 'refund' THEN
    UPDATE profiles SET balance = balance + v_bet.mise WHERE user_id = v_bet.player1_id;
    UPDATE profiles SET balance = balance + v_bet.mise WHERE user_id = v_bet.player2_id;
    INSERT INTO solde_history (user_id, delta_dc, reason) VALUES
      (v_bet.player1_id, v_bet.mise, 'Pari externe : remboursement admin (litige)'),
      (v_bet.player2_id, v_bet.mise, 'Pari externe : remboursement admin (litige)');
  ELSE
    DECLARE v_winner uuid := CASE p_resolution WHEN 'player1_wins' THEN v_bet.player1_id ELSE v_bet.player2_id END;
    BEGIN
      UPDATE profiles SET balance = balance + (v_bet.mise * 2) WHERE user_id = v_winner;
      INSERT INTO solde_history (user_id, delta_dc, reason)
      VALUES (v_winner, v_bet.mise * 2, 'Pari externe : victoire (résolution admin)');
    END;
  END IF;
  UPDATE external_bets SET status = 'termine' WHERE id = p_bet_id;
  RETURN jsonb_build_object('success', true);
END;
$$;