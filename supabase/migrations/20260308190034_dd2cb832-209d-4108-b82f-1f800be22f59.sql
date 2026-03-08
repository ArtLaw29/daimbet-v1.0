
-- 1. recalculate_odds: recalculates all option odds for a bet
CREATE OR REPLACE FUNCTION public.recalculate_odds(p_bet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_pool numeric;
  v_option record;
BEGIN
  -- Total non-retracted wagers on this bet
  SELECT COALESCE(SUM(montant_dc), 0) INTO v_total_pool
  FROM wagers WHERE bet_id = p_bet_id AND is_retracted = false;

  FOR v_option IN SELECT id FROM bet_options WHERE bet_id = p_bet_id LOOP
    DECLARE
      v_option_pool numeric;
      v_new_cote numeric;
    BEGIN
      SELECT COALESCE(SUM(montant_dc), 0) INTO v_option_pool
      FROM wagers WHERE bet_id = p_bet_id AND option_id = v_option.id AND is_retracted = false;

      IF v_option_pool = 0 THEN
        v_new_cote := 1.10;
      ELSE
        v_new_cote := GREATEST(1.0, v_total_pool / v_option_pool);
      END IF;

      UPDATE bet_options
      SET cote_actuelle = v_new_cote,
          total_mises_dc = v_option_pool
      WHERE id = v_option.id;
    END;
  END LOOP;
END;
$$;

-- 2. place_wager: atomic wager placement with all validations
CREATE OR REPLACE FUNCTION public.place_wager(
  p_user_id uuid,
  p_bet_id uuid,
  p_option_id uuid,
  p_montant_dc integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bet record;
  v_profile record;
  v_max_bet integer;
  v_current_cote numeric;
  v_existing_tierce integer;
BEGIN
  -- Lock and fetch bet
  SELECT * INTO v_bet FROM bets WHERE id = p_bet_id FOR UPDATE;
  IF v_bet IS NULL THEN
    RETURN jsonb_build_object('error', 'Pari introuvable');
  END IF;
  IF v_bet.status <> 'ouvert' THEN
    RETURN jsonb_build_object('error', 'Les mises sont clôturées pour ce pari');
  END IF;

  -- Lock and fetch profile
  SELECT * INTO v_profile FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('error', 'Profil introuvable');
  END IF;

  -- Check amount
  IF p_montant_dc < 1 THEN
    RETURN jsonb_build_object('error', 'Mise minimum : 1 DC');
  END IF;

  -- Max bet check
  v_max_bet := FLOOR(v_profile.balance * v_bet.mise_max_pct / 100.0);
  IF p_montant_dc > v_max_bet THEN
    RETURN jsonb_build_object('error', format('Mise max : %s DC (%s%% de ton capital)', v_max_bet, v_bet.mise_max_pct));
  END IF;

  IF p_montant_dc > v_profile.balance THEN
    RETURN jsonb_build_object('error', 'Pas assez de DAIMcoins ! 💸');
  END IF;

  -- Tiercé du Daim: only one active wager per user per bet
  IF v_bet.type = 'tierce_du_daim' THEN
    SELECT COUNT(*) INTO v_existing_tierce
    FROM wagers WHERE bet_id = p_bet_id AND user_id = p_user_id AND is_retracted = false;
    IF v_existing_tierce > 0 THEN
      RETURN jsonb_build_object('error', 'Tu as déjà une mise active sur ce Tiercé du Daim');
    END IF;
  END IF;

  -- Get current odds for this option
  SELECT cote_actuelle INTO v_current_cote FROM bet_options WHERE id = p_option_id AND bet_id = p_bet_id;
  IF v_current_cote IS NULL THEN
    RETURN jsonb_build_object('error', 'Option introuvable');
  END IF;

  -- Insert wager
  INSERT INTO wagers (user_id, bet_id, option_id, montant_dc, cote_au_moment_mise)
  VALUES (p_user_id, p_bet_id, p_option_id, p_montant_dc, v_current_cote);

  -- Deduct balance
  UPDATE profiles SET balance = balance - p_montant_dc WHERE user_id = p_user_id;

  -- Solde history
  INSERT INTO solde_history (user_id, delta_dc, reason)
  VALUES (p_user_id, -p_montant_dc, format('Mise sur: %s', v_bet.title));

  -- Recalculate odds
  PERFORM recalculate_odds(p_bet_id);

  -- Return new odds for display
  SELECT cote_actuelle INTO v_current_cote FROM bet_options WHERE id = p_option_id;

  RETURN jsonb_build_object('success', true, 'new_odds', v_current_cote);
END;
$$;

-- 3. resolve_bet: resolve a bet with winning option(s)
CREATE OR REPLACE FUNCTION public.resolve_bet(
  p_bet_id uuid,
  p_winning_option_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bet record;
  v_wager record;
  v_option_cote numeric;
  v_gross numeric;
  v_rake numeric;
  v_net integer;
  v_gazette_text text;
BEGIN
  SELECT * INTO v_bet FROM bets WHERE id = p_bet_id FOR UPDATE;
  IF v_bet IS NULL THEN
    RETURN jsonb_build_object('error', 'Pari introuvable');
  END IF;

  -- Mark winning options
  UPDATE bet_options SET is_winner = true WHERE id = ANY(p_winning_option_ids) AND bet_id = p_bet_id;
  UPDATE bet_options SET is_winner = false WHERE bet_id = p_bet_id AND NOT (id = ANY(p_winning_option_ids));

  -- Distribute gains for each winning wager
  FOR v_wager IN
    SELECT w.* FROM wagers w
    WHERE w.bet_id = p_bet_id
      AND w.option_id = ANY(p_winning_option_ids)
      AND w.is_retracted = false
  LOOP
    SELECT cote_actuelle INTO v_option_cote FROM bet_options WHERE id = v_wager.option_id;

    v_gross := v_wager.montant_dc * v_option_cote;
    v_rake := GREATEST(0, ROUND((v_gross - v_wager.montant_dc) * 0.05));
    v_net := ROUND(v_gross - v_rake);

    UPDATE profiles SET balance = balance + v_net WHERE user_id = v_wager.user_id;

    INSERT INTO solde_history (user_id, delta_dc, reason)
    VALUES (v_wager.user_id, v_net, format('Gain pari: %s', v_bet.title));
  END LOOP;

  -- Update bet status
  UPDATE bets SET status = 'resolu', updated_at = now() WHERE id = p_bet_id;

  -- Gazette auto-message
  v_gazette_text := format('🏆 Le pari "%s" a été résolu ! Félicitations aux gagnants 🎉', v_bet.title);
  INSERT INTO gazette_messages (content, is_system_message) VALUES (v_gazette_text, true);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. retract_wager: retract a wager with full refund
CREATE OR REPLACE FUNCTION public.retract_wager(
  p_wager_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wager record;
  v_bet record;
BEGIN
  SELECT * INTO v_wager FROM wagers WHERE id = p_wager_id AND user_id = p_user_id FOR UPDATE;
  IF v_wager IS NULL THEN
    RETURN jsonb_build_object('error', 'Mise introuvable');
  END IF;
  IF v_wager.is_retracted THEN
    RETURN jsonb_build_object('error', 'Mise déjà rétractée');
  END IF;

  SELECT * INTO v_bet FROM bets WHERE id = v_wager.bet_id;
  IF v_bet.status <> 'ouvert' THEN
    RETURN jsonb_build_object('error', 'Impossible de rétracter après la clôture des mises');
  END IF;

  -- Retract
  UPDATE wagers SET is_retracted = true, retracted_at = now() WHERE id = p_wager_id;

  -- Refund
  UPDATE profiles SET balance = balance + v_wager.montant_dc WHERE user_id = p_user_id;

  INSERT INTO solde_history (user_id, delta_dc, reason)
  VALUES (p_user_id, v_wager.montant_dc, format('Rétractation mise: %s', v_bet.title));

  -- Recalculate odds
  PERFORM recalculate_odds(v_wager.bet_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. auto_close_bet: closes a bet based on end_date rules
CREATE OR REPLACE FUNCTION public.auto_close_bet(p_bet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bet record;
BEGIN
  SELECT * INTO v_bet FROM bets WHERE id = p_bet_id AND status = 'ouvert' FOR UPDATE;
  IF v_bet IS NULL THEN RETURN; END IF;

  UPDATE bets SET status = 'cloture_en_attente', updated_at = now() WHERE id = p_bet_id;
END;
$$;

-- 6. Trigger to recalculate odds after wager changes
CREATE OR REPLACE FUNCTION public.trigger_recalculate_odds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM recalculate_odds(COALESCE(NEW.bet_id, OLD.bet_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_odds ON wagers;
CREATE TRIGGER trg_recalculate_odds
AFTER INSERT OR UPDATE ON wagers
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_odds();
