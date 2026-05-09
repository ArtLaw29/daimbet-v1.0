DROP POLICY IF EXISTS "Authenticated can join open challenges" ON public.challenges;
CREATE POLICY "Authenticated can join open challenges"
ON public.challenges
FOR UPDATE
TO authenticated
USING (status = 'ouvert')
WITH CHECK (true);