-- Audit trail table for admin moderation actions
CREATE TABLE public.moderation_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  description TEXT NOT NULL,
  motif TEXT,
  actor_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY "Admin can read moderation log"
ON public.moderation_log FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert (via client). Edge functions with service role bypass RLS.
CREATE POLICY "Admin can insert moderation log"
ON public.moderation_log FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- No UPDATE / DELETE policies → table is insert-only

CREATE INDEX idx_moderation_log_created_at ON public.moderation_log (created_at DESC);
CREATE INDEX idx_moderation_log_action_type ON public.moderation_log (action_type);
CREATE INDEX idx_moderation_log_target_type ON public.moderation_log (target_type);