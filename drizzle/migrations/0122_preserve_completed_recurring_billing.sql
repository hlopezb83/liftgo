-- Preserve the billing modality as historical contract information when returned.
-- Automatic invoicing remains confirmed-only; completed recovery is manual.
-- No historical backfill, trigger replacement, grant changes or booking-date changes.
CREATE OR REPLACE FUNCTION public.clear_recurring_billing_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    NEW.recurring_billing := false;
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
-- Keep reconciliation scope, role checks, equipment lifecycle and invoker RLS.
-- Only remove the destructive reset of the completed booking's billing modality.
CREATE OR REPLACE FUNCTION public.reconcile_expired_bookings()
RETURNS TABLE(closed_bookings integer, freed_forklifts integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_is_cron boolean := ((select auth.uid()) IS NULL);
  v_closed integer := 0;
  v_freed integer := 0;
  v_previous_booking_rpc text := current_setting('app.booking_rpc', true);
  v_previous_forklift_rpc text := current_setting('app.forklift_rpc', true);
BEGIN
  IF NOT v_is_cron
     AND NOT public.has_role((select auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  -- This existing admin reconciliation must use the guarded completion path.
  -- The guard still requires a real return inspection; no direct status bypass.
  PERFORM set_config('app.booking_rpc', 'on', true);

  WITH closable AS (
    SELECT b.id
      FROM public.bookings b
     WHERE b.status IN ('confirmed', 'active')
       AND b.end_date < public.today_mty()
       AND public.booking_is_returned(b.id)
  ),
  updated AS (
    UPDATE public.bookings b
       SET status = 'completed',
           updated_at = now()
      FROM closable c
     WHERE b.id = c.id
    RETURNING b.id
  )
  SELECT count(*)::integer INTO v_closed FROM updated;

  -- Limit the booking context to the completion UPDATE only.
  PERFORM set_config('app.booking_rpc', COALESCE(v_previous_booking_rpc, ''), true);

  WITH active AS (
    SELECT DISTINCT b.forklift_id AS fid
      FROM public.bookings b
     WHERE b.status = 'confirmed'
       AND NOT public.booking_is_returned(b.id)
       AND EXISTS (
         SELECT 1
           FROM public.deliveries d
          WHERE d.booking_id = b.id
            AND d.type = 'delivery'
            AND d.status = 'completed'
       )
  ),
  moved AS (
    UPDATE public.forklifts f
       SET status = CASE
             WHEN EXISTS (
               SELECT 1 FROM public.damage_records dr
                WHERE dr.forklift_id = f.id
                  AND dr.deleted_at IS NULL
                  AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL)
             ) OR EXISTS (
               SELECT 1 FROM public.maintenance_logs ml
                WHERE ml.forklift_id = f.id
                  AND ml.deleted_at IS NULL
                  AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
             ) THEN 'maintenance'
             ELSE 'available'
           END,
           updated_at = now()
     WHERE f.status = 'rented'
       AND NOT EXISTS (SELECT 1 FROM active a WHERE a.fid = f.id)
    RETURNING f.id
  )
  SELECT count(*)::integer INTO v_freed FROM moved;

  PERFORM set_config('app.forklift_rpc', COALESCE(v_previous_forklift_rpc, ''), true);
  RETURN QUERY SELECT v_closed, v_freed;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.booking_rpc', COALESCE(v_previous_booking_rpc, ''), true);
  PERFORM set_config('app.forklift_rpc', COALESCE(v_previous_forklift_rpc, ''), true);
  RAISE;
END;
$function$;
