-- Recurrent billing is offered only when the inclusive rental period covers
-- at least one calendar month. Keep the rule authoritative for direct RPC and
-- other server-side writes as well as the form.
CREATE OR REPLACE FUNCTION public.guard_recurring_booking_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.recurring_billing IS TRUE
     AND (
       NEW.start_date IS NULL
       OR NEW.end_date IS NULL
       OR NEW.start_date + INTERVAL '1 month' > NEW.end_date + INTERVAL '1 day'
     ) THEN
    RAISE EXCEPTION 'La facturación recurrente requiere un periodo de renta de al menos un mes.'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'bookings_recurring_billing_minimum_period';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_recurring_booking_period ON public.bookings;
CREATE TRIGGER trg_guard_recurring_booking_period
  BEFORE INSERT OR UPDATE OF start_date, end_date, recurring_billing
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_recurring_booking_period();

