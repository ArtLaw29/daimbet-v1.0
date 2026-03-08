-- Allow users to delete their own votes (for vote changes)
CREATE POLICY "Users delete own votes"
ON public.daimocratie_votes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow admin to update proposals (accept/reject)
-- Already exists: "Admin update proposals"

-- Allow admin to delete proposals
CREATE POLICY "Admin delete proposals"
ON public.daimocratie_proposals
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));