
-- Fix overly permissive INSERT on kiss_marry_votes: limit to one vote set per voter_hash per month_year
-- The WITH CHECK (true) is intentional here since we use voter_hash (anonymous), not user_id
-- But we can add a uniqueness constraint to prevent double-voting
ALTER TABLE kiss_marry_votes ADD CONSTRAINT km_unique_voter_category_month UNIQUE (voter_hash, category, month_year);

-- Fix solde_history: restrict INSERT to own user or admin
DROP POLICY IF EXISTS "Insert history" ON solde_history;
CREATE POLICY "Users insert own history" ON solde_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
