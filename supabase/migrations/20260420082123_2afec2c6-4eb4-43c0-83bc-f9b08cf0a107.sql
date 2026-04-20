-- Restrict full ranking RPC to admins only (security check inside function)
CREATE OR REPLACE FUNCTION public.get_km_results(p_month_year text)
RETURNS TABLE(category km_category, voted_prenom text, vote_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT kmv.category, kmv.voted_prenom, COUNT(*)::bigint as vote_count
    FROM kiss_marry_votes kmv
    WHERE kmv.month_year = p_month_year
    GROUP BY kmv.category, kmv.voted_prenom
    ORDER BY COUNT(*) DESC;
END;
$function$;

-- Public-safe top 3 per category
CREATE OR REPLACE FUNCTION public.get_km_top3(p_month_year text)
RETURNS TABLE(category km_category, voted_prenom text, vote_count bigint, rank integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH counts AS (
    SELECT category, voted_prenom, COUNT(*)::bigint AS vote_count
    FROM kiss_marry_votes
    WHERE month_year = p_month_year
    GROUP BY category, voted_prenom
  ), ranked AS (
    SELECT category, voted_prenom, vote_count,
           ROW_NUMBER() OVER (PARTITION BY category ORDER BY vote_count DESC, voted_prenom ASC)::int AS rank
    FROM counts
  )
  SELECT category, voted_prenom, vote_count, rank
  FROM ranked
  WHERE rank <= 3
  ORDER BY category, rank;
$function$;

GRANT EXECUTE ON FUNCTION public.get_km_top3(text) TO authenticated, anon;