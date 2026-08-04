CREATE OR REPLACE FUNCTION public.validate_delivery_not_in_past()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF COALESCE(NEW.status, 'scheduled') = 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.scheduled_date < public.today_mty() THEN
    RAISE EXCEPTION 'La entrega no puede programarse en el pasado (%)', NEW.scheduled_date USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;