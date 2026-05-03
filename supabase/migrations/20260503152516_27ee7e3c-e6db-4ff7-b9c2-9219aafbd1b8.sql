CREATE OR REPLACE FUNCTION public.place_wager(p_user_id uuid, p_bet_id uuid, p_option_id uuid, p_montant_dc integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bet record;
  v_profile record;
  v_max_bet integer;
  v_current_cote numeric;
  v_existing_other integer;
BEGIN
  SELECT * INTO v_bet FROM bets WHERE id = p_bet_id FOR UPDATE;
  IF v_bet IS NULL THEN
    RETURN jsonb_build_object('error', 'Pari introuvable');
  END IF;
  IF v_bet.status <> 'ouvert' THEN
    RETURN jsonb_build_object('error', 'Les mises sont clôturées pour ce pari');
  END IF;

  -- Defense-in-depth: reject if close_date passed even if status not yet flipped
  IF v_bet.close_date IS NOT NULL AND now() >= v_bet.close_date THEN
    -- auto-flip status so UI catches up
    UPDATE bets SET status = 'cloture_en_attente', updated_at = now() WHERE id = p_bet_id;
    RETURN jsonb_build_object('error', 'Les mises sont clôturées pour ce pari');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'Profil introuvable');
  END IF;

  IF p_montant_dc < 1 THEN
    RETURN jsonb_build_object('error', 'Mise minimum : 1 DC');
  END IF;

  v_max_bet := FLOOR(v_profile.balance * v_bet.mise_max_pct / 100.0);
  IF p_montant_dc > v_max_bet THEN
    RETURN jsonb_build_object('error', format('Mise max : %s DC (%s%% de ton capital)', v_max_bet, v_bet.mise_max_pct));
  END IF;

  IF p_montant_dc > v_profile.balance THEN
    RETURN jsonb_build_object('error', 'Pas assez de DAIMcoins ! 💸');
  END IF;

  SELECT COUNT(*) INTO v_existing_other
  FROM wagers WHERE bet_id = p_bet_id AND user_id = p_user_id AND is_retracted = false;
  IF v_existing_other > 0 THEN
    RETURN jsonb_build_object('error', 'Tu as déjà une mise active sur ce pari. Rétracte-la d''abord si tu veux changer d''option.');
  END IF;

  SELECT cote_actuelle INTO v_current_cote FROM bet_options WHERE id = p_option_id AND bet_id = p_bet_id;
  IF v_current_cote IS NULL THEN
    RETURN jsonb_build_object('error', 'Option introuvable');
  END IF;

  INSERT INTO wagers (user_id, bet_id, option_id, montant_dc, cote_au_moment_mise)
  VALUES (p_user_id, p_bet_id, p_option_id, p_montant_dc, v_current_cote);

  UPDATE profiles SET balance = balance - p_montant_dc WHERE user_id = p_user_id;

  INSERT INTO solde_history (user_id, delta_dc, reason)
  VALUES (p_user_id, -p_montant_dc, format('Mise sur: %s', v_bet.title));

  PERFORM recalculate_odds(p_bet_id);

  SELECT cote_actuelle INTO v_current_cote FROM bet_options WHERE id = p_option_id;

  RETURN jsonb_build_object('success', true, 'new_odds', v_current_cote);
END;
$function$;