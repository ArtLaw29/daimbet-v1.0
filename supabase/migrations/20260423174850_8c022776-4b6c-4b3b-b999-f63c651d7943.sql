-- 1. Create public view exposing only safe fields
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker=on) AS
SELECT
  user_id,
  display_name,
  emoji,
  avatar_url,
  balance,
  visible_in_sondages,
  visible_in_kiss_marry
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;

-- 2. Restrict base table SELECT to owner + admin
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;

CREATE POLICY "Users view own profile or admin"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));