CREATE OR REPLACE FUNCTION public.get_bet_pools(p_bet_ids uuid[])
RETURNS TABLE (
  bet_id uuid,
  option_id uuid,
  pool_dc bigint,
  participants bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bet_id, option_id,
         COALESCE(SUM(montant_dc), 0)::bigint,
         COUNT(DISTINCT user_id)::bigint
  FROM public.wagers
  WHERE bet_id = ANY(p_bet_ids) AND is_retracted = false
  GROUP BY bet_id, option_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_bet_pools(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_bet_participant_counts(p_bet_ids uuid[])
RETURNS TABLE (bet_id uuid, participants bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bet_id, COUNT(DISTINCT user_id)::bigint
  FROM public.wagers
  WHERE bet_id = ANY(p_bet_ids) AND is_retracted = false
  GROUP BY bet_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_bet_participant_counts(uuid[]) TO authenticated;