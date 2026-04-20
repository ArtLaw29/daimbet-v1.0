
-- ===== 1. daimocratie_votes : SELECT restreint à l'auteur =====
DROP POLICY IF EXISTS "Votes viewable" ON public.daimocratie_votes;
CREATE POLICY "Users view own daimocratie votes"
ON public.daimocratie_votes FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- ===== 2. tierce_suggestions : SELECT restreint à l'auteur + admin, vue publique limitée =====
DROP POLICY IF EXISTS "Suggestions viewable" ON public.tierce_suggestions;
CREATE POLICY "Users view own tierce suggestions"
ON public.tierce_suggestions FOR SELECT TO authenticated
USING (auth.uid() = suggested_by OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE VIEW public.tierce_suggestions_public
WITH (security_invoker = on) AS
SELECT id, bet_id, prenom_suggested, status, created_at
FROM public.tierce_suggestions;

GRANT SELECT ON public.tierce_suggestions_public TO authenticated;

-- Rendre la vue lisible par tous les authentifiés indépendamment de la RLS de la table source :
-- On utilise une fonction wrapper SECURITY DEFINER pour le détail public si besoin, mais ici
-- on veut que tous puissent voir prenom_suggested → on crée une RPC dédiée.
CREATE OR REPLACE FUNCTION public.get_tierce_suggestions_public(p_bet_id uuid)
RETURNS TABLE (id uuid, bet_id uuid, prenom_suggested text, status suggestion_status, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, bet_id, prenom_suggested, status, created_at
  FROM public.tierce_suggestions
  WHERE bet_id = p_bet_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_tierce_suggestions_public(uuid) TO authenticated;

-- ===== 3. game_participations : SELECT restreint à l'auteur + admin =====
DROP POLICY IF EXISTS "Participations viewable by authenticated" ON public.game_participations;
CREATE POLICY "Users view own participation"
ON public.game_participations FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- RPC : counts par session (pour afficher le nombre de participants)
CREATE OR REPLACE FUNCTION public.get_session_participation_counts(p_session_ids uuid[])
RETURNS TABLE (session_id uuid, participant_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT session_id, COUNT(*)::bigint
  FROM public.game_participations
  WHERE session_id = ANY(p_session_ids)
  GROUP BY session_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_session_participation_counts(uuid[]) TO authenticated;

-- RPC : gouvernements (jeu publiquement collaboratif)
CREATE OR REPLACE FUNCTION public.get_gouvernements_public(p_session_id uuid)
RETURNS TABLE (id uuid, user_id uuid, data jsonb, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, user_id, data, created_at
  FROM public.game_participations
  WHERE session_id = p_session_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_gouvernements_public(uuid) TO authenticated;

-- RPC : combos publics d'un sondage (uniquement le champ "combo", pas le pronostic ni la mise)
CREATE OR REPLACE FUNCTION public.get_sondage_combos_public(p_session_id uuid)
RETURNS TABLE (user_id uuid, combo text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, (data->>'combo')::text AS combo
  FROM public.game_participations
  WHERE session_id = p_session_id
    AND data ? 'combo';
$$;
GRANT EXECUTE ON FUNCTION public.get_sondage_combos_public(uuid) TO authenticated;

-- RPC : citations harcèlement (admin only)
CREATE OR REPLACE FUNCTION public.get_session_data_for_harassment(p_session_ids uuid[])
RETURNS TABLE (session_id uuid, data jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT gp.session_id, gp.data
    FROM public.game_participations gp
    WHERE gp.session_id = ANY(p_session_ids);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_session_data_for_harassment(uuid[]) TO authenticated;
