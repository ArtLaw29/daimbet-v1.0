DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public AS
SELECT
  user_id,
  display_name,
  emoji,
  avatar_url,
  balance,
  visible_in_sondages,
  visible_in_kiss_marry
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles_public FROM PUBLIC;