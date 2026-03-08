
-- ============================================
-- BLOC 1 : Schéma complet DaimBet
-- ============================================

-- 1. Drop old tables (order matters for FK dependencies)
DROP TABLE IF EXISTS proposal_votes CASCADE;
DROP TABLE IF EXISTS event_proposals CASCADE;
DROP TABLE IF EXISTS bets CASCADE;
DROP TABLE IF EXISTS event_options CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS kiss_marry_votes CASCADE;

-- 2. Create enums
CREATE TYPE bet_type AS ENUM ('binaire', 'over_under', 'tranches_multiples', 'tierce_du_daim');
CREATE TYPE bet_category AS ENUM ('urgent', 'long_terme', 'culture_daim');
CREATE TYPE bet_status AS ENUM ('ouvert', 'cloture_en_attente', 'resolu', 'suspendu', 'supprime');
CREATE TYPE resolution_mode AS ENUM ('admin', 'tirage_sort');
CREATE TYPE ticket_status AS ENUM ('ouvert', 'en_cours', 'resolu');
CREATE TYPE proposal_status AS ENUM ('en_attente', 'valide', 'rejete');
CREATE TYPE km_category AS ENUM ('kiss', 'marry', 'coup_soir', 'plan_q');
CREATE TYPE suggestion_status AS ENUM ('en_attente', 'approuve', 'rejete');

-- 3. Add columns to profiles (= users table)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_accepted_charter boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emoji text;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_display_name_unique;
ALTER TABLE profiles ADD CONSTRAINT profiles_display_name_unique UNIQUE (display_name);

-- 4. bets table (betting events)
CREATE TABLE bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  emoji text,
  type bet_type NOT NULL DEFAULT 'binaire',
  category bet_category NOT NULL DEFAULT 'urgent',
  description text,
  status bet_status NOT NULL DEFAULT 'ouvert',
  end_date timestamptz NOT NULL,
  close_date timestamptz,
  created_by uuid,
  is_long_terme boolean NOT NULL DEFAULT false,
  mise_max_pct integer NOT NULL DEFAULT 30,
  resolution_mode resolution_mode NOT NULL DEFAULT 'admin',
  max_winners integer NOT NULL DEFAULT 1,
  open_to_suggestions boolean NOT NULL DEFAULT false,
  suppression_motif text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_bets_updated_at
  BEFORE UPDATE ON bets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. bet_options
CREATE TABLE bet_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id uuid NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  label text NOT NULL,
  cote_actuelle numeric NOT NULL DEFAULT 1.10,
  total_mises_dc integer NOT NULL DEFAULT 0,
  is_winner boolean,
  bornes_info text
);

-- Add validation trigger for cote_actuelle >= 1.0
CREATE OR REPLACE FUNCTION validate_cote_minimum()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.cote_actuelle < 1.0 THEN
    NEW.cote_actuelle := 1.0;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_cote_minimum
  BEFORE INSERT OR UPDATE ON bet_options
  FOR EACH ROW EXECUTE FUNCTION validate_cote_minimum();

-- 6. wagers (individual user bets)
CREATE TABLE wagers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bet_id uuid NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES bet_options(id) ON DELETE CASCADE,
  montant_dc integer NOT NULL,
  cote_au_moment_mise numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_retracted boolean NOT NULL DEFAULT false,
  retracted_at timestamptz
);

-- 7. gazette_messages
CREATE TABLE gazette_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  content text NOT NULL,
  is_system_message boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  flag_status boolean NOT NULL DEFAULT false,
  flag_score integer NOT NULL DEFAULT 0,
  flag_reason text,
  is_deleted boolean NOT NULL DEFAULT false
);

-- 8. gazette_reactions
CREATE TABLE gazette_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES gazette_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- 9. kiss_marry_votes (anonymous - no user_id!)
CREATE TABLE kiss_marry_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_hash text NOT NULL,
  category km_category NOT NULL,
  voted_prenom text NOT NULL,
  month_year text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. daimocratie_proposals
CREATE TABLE daimocratie_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  type text,
  options_json jsonb,
  end_date_proposed timestamptz,
  votes_positive integer NOT NULL DEFAULT 0,
  votes_negative integer NOT NULL DEFAULT 0,
  status proposal_status NOT NULL DEFAULT 'en_attente',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. daimocratie_votes
CREATE TABLE daimocratie_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES daimocratie_proposals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vote text NOT NULL CHECK (vote IN ('positif', 'negatif')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, user_id)
);

-- 12. tickets
CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL,
  status ticket_status NOT NULL DEFAULT 'ouvert',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 13. ticket_messages
CREATE TABLE ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('utilisateur', 'admin')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 14. liquidity_injections
CREATE TABLE liquidity_injections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_dc integer NOT NULL DEFAULT 250,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  triggered_by uuid
);

-- 15. solde_history
CREATE TABLE solde_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta_dc integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 16. admin_emails_log
CREATE TABLE admin_emails_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipients_json jsonb NOT NULL,
  subject text NOT NULL,
  body_preview text,
  status text NOT NULL DEFAULT 'succes',
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- 17. tierce_suggestions
CREATE TABLE tierce_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id uuid NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  suggested_by uuid NOT NULL,
  prenom_suggested text NOT NULL,
  comment text,
  status suggestion_status NOT NULL DEFAULT 'en_attente',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_wagers_bet_id ON wagers(bet_id);
CREATE INDEX idx_wagers_user_id ON wagers(user_id);
CREATE INDEX idx_bet_options_bet_id ON bet_options(bet_id);
CREATE INDEX idx_gazette_messages_created_at ON gazette_messages(created_at);
CREATE INDEX idx_kiss_marry_votes_month_year ON kiss_marry_votes(month_year);

-- ============================================
-- RLS ON ALL TABLES
-- ============================================
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bet_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE wagers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gazette_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gazette_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiss_marry_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE daimocratie_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE daimocratie_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidity_injections ENABLE ROW LEVEL SECURITY;
ALTER TABLE solde_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_emails_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tierce_suggestions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- BETS
CREATE POLICY "Bets viewable by authenticated" ON bets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert bets" ON bets FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update bets" ON bets FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete bets" ON bets FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- BET_OPTIONS
CREATE POLICY "Options viewable by authenticated" ON bet_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert options" ON bet_options FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update options" ON bet_options FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete options" ON bet_options FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- WAGERS
CREATE POLICY "Users view own wagers" ON wagers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin view all wagers" ON wagers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users place wagers" ON wagers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own wagers" ON wagers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin update wagers" ON wagers FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- GAZETTE_MESSAGES
CREATE POLICY "Public read gazette" ON gazette_messages FOR SELECT TO authenticated USING (is_deleted = false OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users post gazette" ON gazette_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin update gazette" ON gazette_messages FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete gazette" ON gazette_messages FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- GAZETTE_REACTIONS
CREATE POLICY "Reactions viewable" ON gazette_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can react" ON gazette_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove own reaction" ON gazette_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- KISS_MARRY_VOTES (anonymous - insert only, no read)
CREATE POLICY "Insert km votes" ON kiss_marry_votes FOR INSERT TO authenticated WITH CHECK (true);
-- No SELECT policy = nobody can read individual rows

-- DAIMOCRATIE_PROPOSALS
CREATE POLICY "Proposals viewable" ON daimocratie_proposals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can propose" ON daimocratie_proposals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin update proposals" ON daimocratie_proposals FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- DAIMOCRATIE_VOTES
CREATE POLICY "Votes viewable" ON daimocratie_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can vote daimocratie" ON daimocratie_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- TICKETS (owner + admin)
CREATE POLICY "View own tickets" ON tickets FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Create tickets" ON tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin update tickets" ON tickets FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- TICKET_MESSAGES (owner of parent ticket + admin)
CREATE POLICY "View ticket messages" ON ticket_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND (tickets.user_id = auth.uid() OR has_role(auth.uid(), 'admin')))
);
CREATE POLICY "Send ticket messages" ON ticket_messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND (tickets.user_id = auth.uid() OR has_role(auth.uid(), 'admin')))
);

-- LIQUIDITY_INJECTIONS (admin only)
CREATE POLICY "Admin view injections" ON liquidity_injections FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert injections" ON liquidity_injections FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));

-- SOLDE_HISTORY (user sees own, admin sees all)
CREATE POLICY "View own history" ON solde_history FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Insert history" ON solde_history FOR INSERT TO authenticated WITH CHECK (true);

-- ADMIN_EMAILS_LOG (admin only)
CREATE POLICY "Admin view emails" ON admin_emails_log FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert emails" ON admin_emails_log FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));

-- TIERCE_SUGGESTIONS
CREATE POLICY "Suggestions viewable" ON tierce_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can suggest" ON tierce_suggestions FOR INSERT TO authenticated WITH CHECK (auth.uid() = suggested_by);
CREATE POLICY "Admin update suggestions" ON tierce_suggestions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- ============================================
-- Aggregate function for anonymous KM results
-- ============================================
CREATE OR REPLACE FUNCTION get_km_results(p_month_year text)
RETURNS TABLE(category km_category, voted_prenom text, vote_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT category, voted_prenom, COUNT(*) as vote_count
  FROM kiss_marry_votes
  WHERE month_year = p_month_year
  GROUP BY category, voted_prenom
  ORDER BY vote_count DESC;
$$;
