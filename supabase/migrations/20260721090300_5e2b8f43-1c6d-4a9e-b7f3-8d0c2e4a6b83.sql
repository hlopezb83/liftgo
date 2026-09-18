-- ============================================================================
-- BL: reservas futuras nunca materializaban 'rented'. create_booking solo
-- marca la unidad como 'rented' cuando start_date <= CURRENT_DATE; nada
-- actualizaba el status cuando llegaba el día de inicio. Se agrega
-- mark_started_bookings_rented() + cron diario pg_cron (mismo patrón que
-- mark-overdue-supplier-bills-daily).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.mark_started_bookings_rented()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Materializa el estado operativo de las reservas que arrancan hoy (o ya
  -- arrancaron) y siguen vigentes. Solo se promueven unidades 'available'
  -- (mismo criterio que create_booking): una unidad en mantenimiento u
  -- out_of_service conserva su estado operativo aunque tenga reserva activa.
  WITH started AS (
    SELECT DISTINCT ON (f.id)
      f.id AS forklift_id,
      b.booking_number
    FROM public.forklifts f
    JOIN public.bookings b ON b.forklift_id = f.id
    WHERE f.status = 'available'
      AND f.deleted_at IS NULL
      AND b.status NOT IN ('cancelled', 'completed')
      AND b.start_date <= CURRENT_DATE
      AND b.end_date >= CURRENT_DATE
    ORDER BY f.id, b.start_date
  ),
  updated AS (
    UPDATE public.forklifts f
       SET status = 'rented', updated_at = now()
      FROM started s
     WHERE f.id = s.forklift_id
    RETURNING f.id, s.booking_number
  )
  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
  SELECT id, 'available', 'rented',
         'Reserva ' || booking_number || ' iniciada (materialización automática)'
  FROM updated;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_started_bookings_rented() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_started_bookings_rented() TO service_role;

-- Agenda diaria idempotente (mismo patrón que mark-overdue-supplier-bills-daily).
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'mark-started-bookings-rented-daily';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'mark-started-bookings-rented-daily',
  '20 7 * * *',
  $$SELECT public.mark_started_bookings_rented();$$
);
