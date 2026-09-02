-- FIX-5 (ronda 2): simetría del guard de mantenimiento. create_booking /
-- extend_booking ya rechazan reservas dentro de next_service_date ± buffer;
-- aquí se rechaza el otro sentido.
CREATE OR REPLACE FUNCTION public.enforce_maintenance_booking_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.next_service_date IS NULL
     OR NEW.deleted_at IS NOT NULL
     OR NEW.work_status IN ('scheduled', 'cancelled', 'completed') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM bookings b
     WHERE b.forklift_id = NEW.forklift_id
       AND b.status = 'confirmed'
       AND b.start_date <= NEW.next_service_date + public.maintenance_buffer_days()
       AND b.end_date   >= NEW.next_service_date - public.maintenance_buffer_days()
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene una reserva confirmada dentro de la ventana del próximo servicio (buffer de % días). Reagenda el servicio o la renta.',
      public.maintenance_buffer_days()
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_maintenance_booking_window ON public.maintenance_logs;
CREATE TRIGGER trg_maintenance_booking_window
  BEFORE INSERT OR UPDATE OF forklift_id, next_service_date, work_status
  ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_maintenance_booking_window();