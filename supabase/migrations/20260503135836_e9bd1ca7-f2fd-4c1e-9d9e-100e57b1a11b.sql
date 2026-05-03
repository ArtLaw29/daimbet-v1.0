
ALTER TABLE public.bets REPLICA IDENTITY FULL;
ALTER TABLE public.wagers REPLICA IDENTITY FULL;
ALTER TABLE public.bet_options REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='bets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bets;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='wagers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wagers;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='bet_options') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bet_options;
  END IF;
END $$;
