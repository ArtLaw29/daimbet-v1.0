
-- Fix overly permissive INSERT policy on event_options
DROP POLICY "Options insertable by authenticated" ON public.event_options;
CREATE POLICY "Options insertable by event creator" ON public.event_options FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE events.id = event_id AND events.created_by = auth.uid()));

-- Fix overly permissive UPDATE policy on event_proposals
DROP POLICY "Users can update proposals" ON public.event_proposals;
CREATE POLICY "Users can update own proposals" ON public.event_proposals FOR UPDATE TO authenticated USING (auth.uid() = proposed_by);
