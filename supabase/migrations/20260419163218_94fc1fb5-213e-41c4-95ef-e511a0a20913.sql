-- Trigger function: notify admin when a new ticket is created
CREATE OR REPLACE FUNCTION public.notify_admin_new_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (type, title, detail, reference_id)
  VALUES (
    'new_ticket',
    format('Nouveau ticket : %s', NEW.subject),
    'Un utilisateur a ouvert un nouveau ticket.',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_new_ticket ON public.tickets;
CREATE TRIGGER trg_notify_admin_new_ticket
AFTER INSERT ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_new_ticket();

-- Trigger function: notify admin when a user posts a message on an existing ticket
CREATE OR REPLACE FUNCTION public.notify_admin_ticket_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject text;
BEGIN
  -- Only notify on user messages, not admin replies
  IF NEW.sender <> 'utilisateur' THEN
    RETURN NEW;
  END IF;

  SELECT subject INTO v_subject FROM public.tickets WHERE id = NEW.ticket_id;

  INSERT INTO public.admin_notifications (type, title, detail, reference_id)
  VALUES (
    'ticket_message',
    format('Nouveau message ticket : %s', COALESCE(v_subject, '(sans sujet)')),
    LEFT(NEW.content, 200),
    NEW.ticket_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_ticket_message ON public.ticket_messages;
CREATE TRIGGER trg_notify_admin_ticket_message
AFTER INSERT ON public.ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_ticket_message();