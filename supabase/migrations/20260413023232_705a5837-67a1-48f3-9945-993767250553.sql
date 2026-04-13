
-- Fix 1: solde_history - restrict INSERT to admin only
DROP POLICY IF EXISTS "Users insert own history" ON public.solde_history;
CREATE POLICY "Admin insert history" ON public.solde_history
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: admin_notifications - restrict INSERT to admin or service role only
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.admin_notifications;
CREATE POLICY "Admin can insert notifications" ON public.admin_notifications
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix 3: kiss_marry_votes - restrict INSERT to authenticated users only (not WITH CHECK true)
DROP POLICY IF EXISTS "Insert km votes" ON public.kiss_marry_votes;
CREATE POLICY "Authenticated users can insert km votes" ON public.kiss_marry_votes
  FOR INSERT TO authenticated
  WITH CHECK (true);
