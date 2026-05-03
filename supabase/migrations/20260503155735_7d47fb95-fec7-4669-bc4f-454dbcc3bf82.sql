CREATE OR REPLACE FUNCTION public.get_gouvernements_public(p_session_id uuid)
RETURNS TABLE(id uuid, user_id uuid, data jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, user_id, data, created_at
  FROM public.game_participations
  WHERE session_id = p_session_id
  ORDER BY created_at DESC;
$$;