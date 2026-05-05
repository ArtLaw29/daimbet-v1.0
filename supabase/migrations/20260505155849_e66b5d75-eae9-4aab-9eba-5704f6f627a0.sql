CREATE POLICY "Users can delete own participation"
ON public.game_participations
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);