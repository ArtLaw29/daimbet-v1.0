-- Banned words table
CREATE TABLE public.banned_words (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  word text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.banned_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read banned words" ON public.banned_words
  FOR SELECT USING (true);

CREATE POLICY "Admin can insert banned words" ON public.banned_words
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update banned words" ON public.banned_words
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete banned words" ON public.banned_words
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Content reports table
CREATE TABLE public.content_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type text NOT NULL, -- 'proposal', 'sondage_session', 'tournoi_session', etc.
  content_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(content_type, content_id, reporter_id)
);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can report content" ON public.content_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view own reports" ON public.content_reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete reports" ON public.content_reports
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Add is_hidden and report_count to daimocratie_proposals
ALTER TABLE public.daimocratie_proposals
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 0;

-- Add is_hidden and report_count to game_sessions (for sondage/tournoi proposals)
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 0;

-- Function to increment report count and auto-hide at 3
CREATE OR REPLACE FUNCTION public.handle_content_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Count total reports for this content
  SELECT COUNT(*) INTO v_count
  FROM content_reports
  WHERE content_type = NEW.content_type AND content_id = NEW.content_id;

  -- Update the appropriate table
  IF NEW.content_type = 'proposal' THEN
    UPDATE daimocratie_proposals SET report_count = v_count, is_hidden = (v_count >= 3) WHERE id = NEW.content_id;
    IF v_count >= 3 THEN
      INSERT INTO admin_notifications (type, title, detail, reference_id)
      VALUES ('report', 'Proposition signalée (3+ reports)', 
              format('La proposition %s a reçu %s signalements et a été masquée.', NEW.content_id, v_count),
              NEW.content_id);
    END IF;
  ELSIF NEW.content_type IN ('sondage_session', 'tournoi_session') THEN
    UPDATE game_sessions SET report_count = v_count, is_hidden = (v_count >= 3) WHERE id = NEW.content_id;
    IF v_count >= 3 THEN
      INSERT INTO admin_notifications (type, title, detail, reference_id)
      VALUES ('report', 'Session signalée (3+ reports)',
              format('La session %s a reçu %s signalements et a été masquée.', NEW.content_id, v_count),
              NEW.content_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_content_report_insert
  AFTER INSERT ON public.content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_content_report();