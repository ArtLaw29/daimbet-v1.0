CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_display_name text;
  v_emoji text;
BEGIN
  v_display_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'), ''),
    split_part(NEW.email, '@', 1)
  );
  v_emoji := COALESCE(NULLIF(NEW.raw_user_meta_data->>'emoji', ''), '🦌');

  BEGIN
    INSERT INTO public.profiles (
      user_id, display_name, emoji, balance,
      rules_accepted, rules_accepted_at, has_accepted_charter
    )
    VALUES (
      NEW.id, v_display_name, v_emoji, 1000,
      true, now(), true
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never break signup if profile creation fails (e.g. duplicate display_name)
    RAISE WARNING 'handle_new_user: profile insert failed for %: %', NEW.id, SQLERRM;
    BEGIN
      INSERT INTO public.profiles (
        user_id, display_name, emoji, balance,
        rules_accepted, rules_accepted_at, has_accepted_charter
      )
      VALUES (
        NEW.id,
        split_part(NEW.email, '@', 1) || '_' || substr(NEW.id::text, 1, 4),
        v_emoji, 1000, true, now(), true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: fallback profile insert also failed for %: %', NEW.id, SQLERRM;
    END;
  END;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();