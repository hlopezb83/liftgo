
-- Trigger: al cancelar una reserva, apagar recurring_billing
CREATE OR REPLACE FUNCTION public.clear_recurring_billing_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND COALESCE(OLD.status, '') <> 'cancelled' THEN
    NEW.recurring_billing := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_clear_recurring_on_cancel ON public.bookings;
CREATE TRIGGER trg_bookings_clear_recurring_on_cancel
BEFORE UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.clear_recurring_billing_on_cancel();

-- Limpieza histórica: reservas ya canceladas que conservaron recurring_billing = true
UPDATE public.bookings
   SET recurring_billing = false
 WHERE status = 'cancelled' AND recurring_billing = true;
