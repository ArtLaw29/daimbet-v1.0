-- Add config column to challenges
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Enable realtime on games_sessions
ALTER TABLE public.games_sessions REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='games_sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.games_sessions';
  END IF;
END $$;

-- Create challenge
CREATE OR REPLACE FUNCTION public.create_challenge(p_game_type text, p_mise integer, p_config jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile record;
  v_code text;
  v_attempts int := 0;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','Non authentifié'); END IF;
  IF p_game_type NOT IN ('pendu','puissance4','echecs') THEN RETURN jsonb_build_object('error','Jeu invalide'); END IF;
  IF p_mise < 1 THEN RETURN jsonb_build_object('error','Mise minimum 1 DC'); END IF;

  SELECT * INTO v_profile FROM profiles WHERE user_id=v_uid FOR UPDATE;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('error','Profil introuvable'); END IF;
  IF v_profile.balance < p_mise THEN RETURN jsonb_build_object('error','Pas assez de DAIMcoins'); END IF;

  LOOP
    v_code := lpad(floor(random()*1000000)::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM challenges WHERE code=v_code AND status='ouvert');
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN RETURN jsonb_build_object('error','Erreur génération code'); END IF;
  END LOOP;

  UPDATE profiles SET balance = balance - p_mise WHERE user_id=v_uid;
  INSERT INTO solde_history (user_id, delta_dc, reason)
  VALUES (v_uid, -p_mise, format('Défi %s : mise engagée', p_game_type));

  INSERT INTO challenges (code, mise, status, creator_id, game_type, expires_at, config)
  VALUES (v_code, p_mise, 'ouvert', v_uid, p_game_type, now() + interval '30 minutes', p_config)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'code', v_code, 'id', v_id);
END $$;

-- Join challenge
CREATE OR REPLACE FUNCTION public.join_challenge(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ch record;
  v_profile record;
  v_session_id uuid;
  v_initial_state jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','Non authentifié'); END IF;
  SELECT * INTO v_ch FROM challenges WHERE code=p_code FOR UPDATE;
  IF v_ch IS NULL THEN RETURN jsonb_build_object('error','Code introuvable'); END IF;
  IF v_ch.status <> 'ouvert' THEN RETURN jsonb_build_object('error','Défi déjà accepté ou expiré'); END IF;
  IF v_ch.expires_at IS NOT NULL AND v_ch.expires_at < now() THEN
    UPDATE challenges SET status='expiré' WHERE id=v_ch.id;
    UPDATE profiles SET balance=balance + v_ch.mise WHERE user_id=v_ch.creator_id;
    INSERT INTO solde_history (user_id, delta_dc, reason) VALUES (v_ch.creator_id, v_ch.mise, 'Défi expiré : remboursement');
    RETURN jsonb_build_object('error','Défi expiré');
  END IF;
  IF v_ch.creator_id = v_uid THEN RETURN jsonb_build_object('error','Tu ne peux pas rejoindre ton propre défi'); END IF;

  SELECT * INTO v_profile FROM profiles WHERE user_id=v_uid FOR UPDATE;
  IF v_profile.balance < v_ch.mise THEN RETURN jsonb_build_object('error','Pas assez de DAIMcoins'); END IF;

  UPDATE profiles SET balance=balance - v_ch.mise WHERE user_id=v_uid;
  INSERT INTO solde_history (user_id, delta_dc, reason)
  VALUES (v_uid, -v_ch.mise, format('Défi %s : mise engagée', v_ch.game_type));

  IF v_ch.game_type = 'pendu' THEN
    v_initial_state := jsonb_build_object('phase','word_setup','wrong_letters','[]'::jsonb,'guessed_letters','[]'::jsonb,'last_action_at', extract(epoch from now()));
  ELSIF v_ch.game_type = 'puissance4' THEN
    v_initial_state := jsonb_build_object(
      'board', jsonb_build_array(
        jsonb_build_array(0,0,0,0,0,0,0),
        jsonb_build_array(0,0,0,0,0,0,0),
        jsonb_build_array(0,0,0,0,0,0,0),
        jsonb_build_array(0,0,0,0,0,0,0),
        jsonb_build_array(0,0,0,0,0,0,0),
        jsonb_build_array(0,0,0,0,0,0,0)
      ),
      'turn', v_ch.creator_id::text,
      'last_action_at', extract(epoch from now())
    );
  ELSIF v_ch.game_type = 'echecs' THEN
    DECLARE v_mode text := COALESCE(v_ch.config->>'mode','normal');
    DECLARE v_clock int := CASE v_mode WHEN 'blitz' THEN 300 WHEN 'normal' THEN 900 ELSE 86400 END;
    BEGIN
      v_initial_state := jsonb_build_object(
        'fen','rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'mode', v_mode,
        'clock_white', v_clock,
        'clock_black', v_clock,
        'last_move_at', extract(epoch from now())
      );
    END;
  END IF;

  INSERT INTO games_sessions (game_type, player1_id, player2_id, status, mise_player1, mise_player2, game_state)
  VALUES (v_ch.game_type, v_ch.creator_id, v_uid, 'en_cours', v_ch.mise, v_ch.mise, v_initial_state)
  RETURNING id INTO v_session_id;

  UPDATE challenges SET status='accepté', session_id=v_session_id WHERE id=v_ch.id;

  RETURN jsonb_build_object('success', true, 'session_id', v_session_id, 'game_type', v_ch.game_type);
END $$;

-- Finish duel (winner gets pot, null = refund both)
CREATE OR REPLACE FUNCTION public.finish_duel(p_session_id uuid, p_winner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_session record;
  v_pot integer;
BEGIN
  SELECT * INTO v_session FROM games_sessions WHERE id=p_session_id FOR UPDATE;
  IF v_session IS NULL THEN RETURN jsonb_build_object('error','Session introuvable'); END IF;
  IF v_session.status = 'termine' THEN RETURN jsonb_build_object('error','Déjà terminé'); END IF;
  IF auth.uid() IS NULL OR auth.uid() NOT IN (v_session.player1_id, v_session.player2_id) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  v_pot := COALESCE(v_session.mise_player1,0) + COALESCE(v_session.mise_player2,0);

  IF p_winner_id IS NULL THEN
    UPDATE profiles SET balance=balance + v_session.mise_player1 WHERE user_id=v_session.player1_id;
    UPDATE profiles SET balance=balance + v_session.mise_player2 WHERE user_id=v_session.player2_id;
    INSERT INTO solde_history (user_id, delta_dc, reason) VALUES
      (v_session.player1_id, v_session.mise_player1, format('Duel %s : nul (remboursement)', v_session.game_type)),
      (v_session.player2_id, v_session.mise_player2, format('Duel %s : nul (remboursement)', v_session.game_type));
  ELSE
    IF p_winner_id NOT IN (v_session.player1_id, v_session.player2_id) THEN
      RETURN jsonb_build_object('error','Vainqueur invalide');
    END IF;
    UPDATE profiles SET balance=balance + v_pot WHERE user_id=p_winner_id;
    INSERT INTO solde_history (user_id, delta_dc, reason)
    VALUES (p_winner_id, v_pot, format('Duel %s : victoire', v_session.game_type));
  END IF;

  UPDATE games_sessions SET status='termine', winner_id=p_winner_id, updated_at=now() WHERE id=p_session_id;
  RETURN jsonb_build_object('success', true);
END $$;