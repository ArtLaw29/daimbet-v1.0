
-- Admin can insert event_options directly
CREATE POLICY "Admins can insert options"
ON public.event_options
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin can delete events
CREATE POLICY "Admins can delete events"
ON public.events
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete event_options
CREATE POLICY "Admins can delete options"
ON public.event_options
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete bets (for cancelled events refunds)
CREATE POLICY "Admins can delete bets"
ON public.bets
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Users can delete own bets (for remorse/cancel)
CREATE POLICY "Users can delete own bets"
ON public.bets
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
