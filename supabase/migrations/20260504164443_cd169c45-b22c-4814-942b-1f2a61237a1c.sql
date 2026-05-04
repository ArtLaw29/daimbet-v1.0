CREATE OR REPLACE FUNCTION public.get_gouvernements_public(p_session_id uuid)
 RETURNS TABLE(id uuid, user_id uuid, data jsonb, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    gp.id,
    gp.user_id,
    CASE
      WHEN gp.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
        THEN gp.data
      ELSE gp.data - 'comment'
    END AS data,
    gp.created_at
  FROM public.game_participations gp
  WHERE gp.session_id = p_session_id
  ORDER BY gp.created_at DESC;
$function$;