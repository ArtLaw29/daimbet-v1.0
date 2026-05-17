
-- ============ game_rooms ============
CREATE TABLE public.game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type text NOT NULL,
  creator_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','in_progress','finished')),
  min_players int NOT NULL DEFAULT 2,
  max_players int NOT NULL DEFAULT 8,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX idx_game_rooms_status_type ON public.game_rooms (status, game_type);
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read rooms"
  ON public.game_rooms FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create rooms"
  ON public.game_rooms FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creator can update room"
  ON public.game_rooms FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id);

CREATE POLICY "Admin delete rooms"
  ON public.game_rooms FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin update rooms"
  ON public.game_rooms FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ room_players ============
CREATE TABLE public.room_players (
  room_id uuid NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  is_connected boolean NOT NULL DEFAULT true,
  PRIMARY KEY (room_id, user_id)
);
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read room players"
  ON public.room_players FOR SELECT TO authenticated USING (true);

CREATE POLICY "User joins a room"
  ON public.room_players FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User updates own connection"
  ON public.room_players FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "User leaves room"
  ON public.room_players FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- Helper: is current user a member of a room?
CREATE OR REPLACE FUNCTION public.is_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.room_players WHERE room_id = _room_id AND user_id = _user_id)
$$;

-- ============ room_chat_messages ============
CREATE TABLE public.room_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_room_chat_room ON public.room_chat_messages (room_id, created_at);
ALTER TABLE public.room_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read room chat"
  ON public.room_chat_messages FOR SELECT TO authenticated
  USING (public.is_room_member(room_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Members can write room chat"
  ON public.room_chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_room_member(room_id, auth.uid()));

CREATE POLICY "Admin delete room chat"
  ON public.room_chat_messages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger: when a room finishes, wipe its chat
CREATE OR REPLACE FUNCTION public.cleanup_room_chat_on_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.finished_at IS NOT NULL AND (OLD.finished_at IS NULL OR OLD.finished_at <> NEW.finished_at) THEN
    DELETE FROM public.room_chat_messages WHERE room_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_room_chat_on_finish
AFTER UPDATE ON public.game_rooms
FOR EACH ROW EXECUTE FUNCTION public.cleanup_room_chat_on_finish();

-- ============ dc_ledger ============
CREATE TABLE public.dc_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid,
  to_user_id uuid,
  amount integer NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dc_ledger_from ON public.dc_ledger (from_user_id, created_at DESC);
CREATE INDEX idx_dc_ledger_to ON public.dc_ledger (to_user_id, created_at DESC);
ALTER TABLE public.dc_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ledger"
  ON public.dc_ledger FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- Atomic DC transfer (called by edge function)
CREATE OR REPLACE FUNCTION public.process_dc_transaction(
  p_from uuid,
  p_to uuid,
  p_amount integer,
  p_reason text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance integer;
  v_ledger_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'Montant invalide');
  END IF;
  IF p_from IS NULL AND p_to IS NULL THEN
    RETURN jsonb_build_object('error', 'Au moins un compte est requis');
  END IF;

  IF p_from IS NOT NULL THEN
    SELECT balance INTO v_balance FROM public.profiles WHERE user_id = p_from FOR UPDATE;
    IF v_balance IS NULL THEN RETURN jsonb_build_object('error', 'Expéditeur introuvable'); END IF;
    IF v_balance < p_amount THEN RETURN jsonb_build_object('error', 'Solde insuffisant'); END IF;
    UPDATE public.profiles SET balance = balance - p_amount, updated_at = now() WHERE user_id = p_from;
    INSERT INTO public.solde_history (user_id, delta_dc, reason) VALUES (p_from, -p_amount, p_reason);
  END IF;

  IF p_to IS NOT NULL THEN
    UPDATE public.profiles SET balance = balance + p_amount, updated_at = now() WHERE user_id = p_to;
    INSERT INTO public.solde_history (user_id, delta_dc, reason) VALUES (p_to, p_amount, p_reason);
  END IF;

  INSERT INTO public.dc_ledger (from_user_id, to_user_id, amount, reason, metadata)
  VALUES (p_from, p_to, p_amount, p_reason, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object('success', true, 'ledger_id', v_ledger_id);
END;
$$;

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_chat_messages;

ALTER TABLE public.game_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.room_players REPLICA IDENTITY FULL;
ALTER TABLE public.room_chat_messages REPLICA IDENTITY FULL;
