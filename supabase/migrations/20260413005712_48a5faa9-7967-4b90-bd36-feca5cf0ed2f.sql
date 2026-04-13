
CREATE OR REPLACE FUNCTION public.mark_code_used(p_code TEXT, p_prenom TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row FROM inscription_codes WHERE code = p_code AND prenom = p_prenom AND used = false FOR UPDATE;
  IF v_row IS NULL THEN
    RETURN false;
  END IF;
  UPDATE inscription_codes SET used = true, used_at = now() WHERE id = v_row.id;
  RETURN true;
END;
$$;
