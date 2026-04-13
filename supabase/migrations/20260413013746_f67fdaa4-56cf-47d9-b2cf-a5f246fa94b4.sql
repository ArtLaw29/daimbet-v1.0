
-- Allow users to insert sondage sessions
CREATE POLICY "Users can propose sondage sessions"
ON public.game_sessions
FOR INSERT
TO authenticated
WITH CHECK (game_type = 'sondage' AND auth.uid() = created_by);
