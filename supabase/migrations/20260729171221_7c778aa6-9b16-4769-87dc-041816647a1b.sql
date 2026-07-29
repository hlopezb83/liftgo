CREATE OR REPLACE FUNCTION public.validate_delivery_not_in_past()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- FE2-11 / N-9: registrar una entrega YA REALIZADA (histórico) admite fecha
  -- pasada; la guarda solo aplica a entregas programadas.
  IF COALESCE(NEW.status, 'scheduled') = 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.scheduled_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'La entrega no puede programarse en el pasado (%)', NEW.scheduled_date USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_delivery_not_in_past ON public.deliveries;
CREATE TRIGGER trg_delivery_not_in_past
  BEFORE INSERT OR UPDATE OF scheduled_date, status ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_not_in_past();