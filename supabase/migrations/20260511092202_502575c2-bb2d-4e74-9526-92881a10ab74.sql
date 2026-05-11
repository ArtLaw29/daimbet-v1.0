REVOKE ALL ON FUNCTION public.submit_game_result(uuid, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_game_result(uuid, text, jsonb, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_daily_rank(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_rank(uuid, boolean) TO authenticated;