-- 1. Update handle_new_user trigger to no longer write email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, emoji, balance, rules_accepted, rules_accepted_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'emoji', '🦌'),
    1000,
    COALESCE((NEW.raw_user_meta_data->>'rules_accepted')::boolean, false),
    CASE WHEN COALESCE((NEW.raw_user_meta_data->>'rules_accepted')::boolean, false) THEN now() ELSE NULL END
  );
  RETURN NEW;
END;
$function$;

-- 2. Drop email column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

-- 3. Add ticket_messages to realtime publication so RLS gets enforced on subscriptions
ALTER TABLE public.ticket_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ticket_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
  END IF;
END $$;