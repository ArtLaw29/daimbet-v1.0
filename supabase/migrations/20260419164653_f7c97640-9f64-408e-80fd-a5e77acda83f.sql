DROP POLICY IF EXISTS "Admin can update public contacts" ON public.public_contact_messages;
CREATE POLICY "Admin can update public contacts"
ON public.public_contact_messages
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));