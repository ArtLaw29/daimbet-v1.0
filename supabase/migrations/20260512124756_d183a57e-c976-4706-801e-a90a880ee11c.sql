CREATE OR REPLACE FUNCTION public.get_wordle_leaderboard(p_variant text, p_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(rank integer, user_id uuid, display_name text, emoji text, avatar_url text, amount_earned integer, attempts integer, finished_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ds.rank,
    ds.user_id,
    p.display_name,
    p.emoji,
    p.avatar_url,
    ds.amount_earned,
    COALESCE((ds.score->>'attempts')::int, NULL) AS attempts,
    ds.finished_at
  FROM public.daily_scores ds
  LEFT JOIN public.profiles p ON p.user_id = ds.user_id
  WHERE ds.game_type = 'wordle'
    AND ds.played_on = p_date
    AND ds.variant = p_variant
    AND ds.rank IS NOT NULL
  ORDER BY ds.rank ASC NULLS LAST, ds.finished_at ASC;
$function$;