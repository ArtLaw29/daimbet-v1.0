
-- 1. Function to calculate close_date based on rules
CREATE OR REPLACE FUNCTION public.calculate_close_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_diff interval;
BEGIN
  -- Only calculate if close_date not already set manually
  IF NEW.close_date IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_diff := NEW.end_date - NEW.created_at;

  -- URGENT category with "retard" in title → end_date - 4h
  IF NEW.category = 'urgent' AND LOWER(NEW.title) LIKE '%retard%' THEN
    NEW.close_date := NEW.end_date - interval '4 hours';
  -- Created less than 1h before end → end_date - 20min
  ELSIF v_diff < interval '1 hour' THEN
    NEW.close_date := NEW.end_date - interval '20 minutes';
  -- Default → end_date - 15min
  ELSE
    NEW.close_date := NEW.end_date - interval '15 minutes';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_close_date ON bets;
CREATE TRIGGER trg_calculate_close_date
BEFORE INSERT ON bets
FOR EACH ROW
EXECUTE FUNCTION calculate_close_date();

-- 2. Auto emoji assignment on bet creation
CREATE OR REPLACE FUNCTION public.assign_bet_emoji()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Only assign if not already set
  IF NEW.emoji IS NOT NULL AND NEW.emoji <> '' THEN
    RETURN NEW;
  END IF;

  -- Tiercé du Daim always gets 🏇
  IF NEW.type = 'tierce_du_daim' THEN
    NEW.emoji := '🏇';
    RETURN NEW;
  END IF;

  CASE NEW.category
    WHEN 'urgent' THEN
      CASE NEW.type
        WHEN 'binaire' THEN NEW.emoji := '⚡';
        ELSE NEW.emoji := '⏱️';
      END CASE;
    WHEN 'long_terme' THEN
      IF LOWER(NEW.title) LIKE '%couple%' OR LOWER(NEW.title) LIKE '%amour%' THEN
        NEW.emoji := '💕';
      ELSIF LOWER(NEW.title) LIKE '%projet%' OR LOWER(NEW.title) LIKE '%stage%' THEN
        NEW.emoji := '✅';
      ELSE
        NEW.emoji := '📅';
      END IF;
    WHEN 'culture_daim' THEN
      NEW.emoji := '🎪';
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_bet_emoji ON bets;
CREATE TRIGGER trg_assign_bet_emoji
BEFORE INSERT ON bets
FOR EACH ROW
EXECUTE FUNCTION assign_bet_emoji();
