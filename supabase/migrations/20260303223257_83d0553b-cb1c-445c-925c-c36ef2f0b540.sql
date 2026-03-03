
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  balance INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'bet',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'resolved')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closes_at TIMESTAMPTZ
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events viewable by authenticated" ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Events insertable by authenticated" ON public.events FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- Event options
CREATE TABLE public.event_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  odds NUMERIC(6,2) NOT NULL DEFAULT 2.0,
  is_winner BOOLEAN DEFAULT false
);

ALTER TABLE public.event_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Options viewable by authenticated" ON public.event_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "Options insertable by authenticated" ON public.event_options FOR INSERT TO authenticated WITH CHECK (true);

-- Bets table
CREATE TABLE public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.event_options(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  potential_winnings NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bets" ON public.bets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can place bets" ON public.bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Kiss/Marry votes
CREATE TABLE public.kiss_marry_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('kiss', 'marry', 'coup_un_soir', 'plan_q')),
  chosen_name TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, category, month, year)
);

ALTER TABLE public.kiss_marry_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own votes" ON public.kiss_marry_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own votes" ON public.kiss_marry_votes FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Event proposals
CREATE TABLE public.event_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  proposed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Proposals viewable by authenticated" ON public.event_proposals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can propose" ON public.event_proposals FOR INSERT TO authenticated WITH CHECK (auth.uid() = proposed_by);
CREATE POLICY "Users can update proposals" ON public.event_proposals FOR UPDATE TO authenticated USING (true);

-- Proposal votes
CREATE TABLE public.proposal_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.event_proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, user_id)
);

ALTER TABLE public.proposal_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view votes" ON public.proposal_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can vote" ON public.proposal_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can change vote" ON public.proposal_votes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
