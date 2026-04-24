-- Allow authenticated users to read non-deleted gazette messages
-- This is required for Realtime postgres_changes to deliver updates to clients.
-- Sensitive moderation columns (flag_status, flag_score, flag_reason) remain in the base table
-- but the frontend only queries the gazette_messages_public view which excludes them.

CREATE POLICY "Authenticated users read non-deleted gazette"
ON public.gazette_messages
FOR SELECT
TO authenticated
USING (is_deleted = false);
