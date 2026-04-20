
CREATE OR REPLACE FUNCTION public.recount_proposal_votes(p_proposal_id uuid)
RETURNS TABLE (positives bigint, negatives bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pos bigint;
  v_neg bigint;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE vote = 'positif'),
    COUNT(*) FILTER (WHERE vote = 'negatif')
  INTO v_pos, v_neg
  FROM public.daimocratie_votes
  WHERE proposal_id = p_proposal_id;

  UPDATE public.daimocratie_proposals
  SET votes_positive = v_pos, votes_negative = v_neg
  WHERE id = p_proposal_id;

  RETURN QUERY SELECT v_pos, v_neg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recount_proposal_votes(uuid) TO authenticated;
