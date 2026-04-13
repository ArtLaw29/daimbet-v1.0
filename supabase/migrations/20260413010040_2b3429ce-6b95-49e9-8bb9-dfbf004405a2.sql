
-- Allow users to update their own tickets (for user_last_seen_at)
CREATE POLICY "Users can update own tickets"
  ON public.tickets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Enable realtime for ticket_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
