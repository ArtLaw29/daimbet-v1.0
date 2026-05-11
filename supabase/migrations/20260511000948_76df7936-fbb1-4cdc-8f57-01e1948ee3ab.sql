ALTER TABLE public.external_bets ADD COLUMN IF NOT EXISTS motif text;

CREATE OR REPLACE FUNCTION public.create_external_bet(p_opponent_id uuid, p_mise integer, p_motif text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creator uuid := auth.uid();
  v_profile record;
  v_bet_id uuid;
  v_motif text;
BEGIN
  IF v_creator IS NULL THEN RETURN jsonb_build_object('error', 'Non authentifié'); END IF;
  IF p_opponent_id = v_creator THEN RETURN jsonb_build_object('error', 'Tu ne peux pas te défier toi-même'); END IF;
  IF p_mise < 1 THEN RETURN jsonb_build_object('error', 'Mise minimum : 1 DC'); END IF;
  v_motif := NULLIF(btrim(coalesce(p_motif, '')), '');
  IF v_motif IS NULL THEN RETURN jsonb_build_object('error', 'Motif obligatoire'); END IF;

  SELECT * INTO v_profile FROM profiles WHERE user_id = v_creator FOR UPDATE;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('error', 'Profil introuvable'); END IF;
  IF p_mise > v_profile.balance THEN RETURN jsonb_build_object('error', 'Pas assez de DAIMcoins !'); END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = p_opponent_id) THEN
    RETURN jsonb_build_object('error', 'Adversaire introuvable');
  END IF;

  UPDATE profiles SET balance = balance - p_mise WHERE user_id = v_creator;
  INSERT INTO solde_history (user_id, delta_dc, reason)
  VALUES (v_creator, -p_mise, 'Pari externe : mise engagée');

  INSERT INTO external_bets (player1_id, player2_id, mise, status, motif)
  VALUES (v_creator, p_opponent_id, p_mise, 'en_attente', v_motif)
  RETURNING id INTO v_bet_id;

  RETURN jsonb_build_object('success', true, 'bet_id', v_bet_id);
END;
$$;