
-- Add email column
ALTER TABLE public.profiles ADD COLUMN email text;

-- Add UNIQUE constraint on email
ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);

-- Update handle_new_user to store email and set is_activated = false
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, emoji, balance, email, is_activated)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'emoji', '🦌'),
    1000,
    NEW.email,
    false
  );
  RETURN NEW;
END;
$function$;
