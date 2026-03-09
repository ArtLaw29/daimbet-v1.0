
-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Users post gazette" ON public.gazette_messages;

-- Create new INSERT policy that allows:
-- 1. Users posting their own messages (user_id = auth.uid())
-- 2. Admins posting system messages (user_id IS NULL, is_system_message = true)
CREATE POLICY "Users post gazette"
ON public.gazette_messages
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  OR
  (user_id IS NULL AND is_system_message = true AND public.has_role(auth.uid(), 'admin'))
);
