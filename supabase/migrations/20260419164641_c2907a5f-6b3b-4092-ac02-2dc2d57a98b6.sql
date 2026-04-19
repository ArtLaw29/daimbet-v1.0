CREATE TABLE public.public_contact_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  nom text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  ip_address text,
  is_handled boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_public_contact_messages_created_at ON public.public_contact_messages (created_at DESC);
CREATE INDEX idx_public_contact_messages_is_handled ON public.public_contact_messages (is_handled);

ALTER TABLE public.public_contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view public contacts"
ON public.public_contact_messages
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can update public contacts"
ON public.public_contact_messages
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete public contacts"
ON public.public_contact_messages
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
-- No INSERT policy: only service role (edge function) can insert