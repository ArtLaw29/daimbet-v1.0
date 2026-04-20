
-- Bug 1: lock kiss_marry_votes inserts to service role only
DROP POLICY IF EXISTS "Authenticated users can insert km votes" ON public.kiss_marry_votes;
CREATE POLICY "Block direct km vote inserts"
  ON public.kiss_marry_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Bug 2: drop orphaned content_reports table, trigger, function and columns
DROP TRIGGER IF EXISTS on_content_report ON public.content_reports;
DROP FUNCTION IF EXISTS public.handle_content_report() CASCADE;
DROP TABLE IF EXISTS public.content_reports;

ALTER TABLE public.daimocratie_proposals
  DROP COLUMN IF EXISTS report_count,
  DROP COLUMN IF EXISTS is_hidden;

ALTER TABLE public.game_sessions
  DROP COLUMN IF EXISTS report_count,
  DROP COLUMN IF EXISTS is_hidden;
