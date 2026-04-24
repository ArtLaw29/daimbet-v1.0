
-- 1) Restrict gazette_messages SELECT to admins only
DROP POLICY IF EXISTS "Public read gazette" ON public.gazette_messages;

CREATE POLICY "Admin read gazette full"
ON public.gazette_messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Public view without moderation metadata
CREATE OR REPLACE VIEW public.gazette_messages_public
WITH (security_invoker = on) AS
SELECT
  id,
  content,
  user_id,
  is_system_message,
  is_deleted,
  created_at
FROM public.gazette_messages
WHERE is_deleted = false;

GRANT SELECT ON public.gazette_messages_public TO authenticated, anon;

-- 3) Explicit admin-only write policies on user_roles
CREATE POLICY "Admin can insert user_roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can update user_roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete user_roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can view all user_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
