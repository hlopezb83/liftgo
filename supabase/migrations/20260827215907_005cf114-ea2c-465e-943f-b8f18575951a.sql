CREATE OR REPLACE FUNCTION public.reconcile_expired_bookings()
RETURNS TABLE(closed_bookings integer, freed_forklifts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_cron boolean := (auth.uid() IS NULL);
  v_closed integer := 0;
  v_freed integer := 0;
BEGIN
  IF NOT v_is_cron AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  WITH closable AS (
    SELECT b.id
    FROM public.bookings b
    WHERE b.status IN ('confirmed', 'active')
      AND b.end_date < public.today_mty()
      AND (
        b.return_status = 'returned'
        OR EXISTS (
          SELECT 1 FROM public.deliveries d
          WHERE d.booking_id = b.id AND d.type = 'return' AND d.status = 'completed'
        )
        OR EXISTS (
          SELECT 1 FROM public.return_inspections ri WHERE ri.booking_id = b.id
        )
      )
  ), upd AS (
    UPDATE public.bookings b
    SET status = 'completed',
        recurring_billing = false,
        updated_at = now()
    FROM closable c
    WHERE b.id = c.id
    RETURNING b.id
  )
  SELECT count(*)::integer INTO v_closed FROM upd;

  WITH active AS (
    SELECT DISTINCT b.forklift_id AS fid
    FROM public.bookings b
    WHERE b.status = 'confirmed'
      AND b.start_date <= public.today_mty()
      AND (
        b.end_date >= public.today_mty()
        OR (
          b.return_status IS DISTINCT FROM 'returned'
          AND NOT EXISTS (
            SELECT 1 FROM public.deliveries r
            WHERE r.booking_id = b.id AND r.type = 'return' AND r.status = 'completed'
          )
        )
      )
  ), demote AS (
    UPDATE public.forklifts f
    SET status = 'available', updated_at = now()
    WHERE f.status = 'rented'
      AND NOT EXISTS (SELECT 1 FROM active a WHERE a.fid = f.id)
    RETURNING f.id
  )
  SELECT count(*)::integer INTO v_freed FROM demote;

  PERFORM set_config('app.forklift_rpc', 'off', true);

  RETURN QUERY SELECT v_closed, v_freed;
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_expired_bookings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_expired_bookings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_expired_bookings() TO service_role;

SELECT cron.schedule(
  'reconcile-expired-bookings',
  '10 8 * * *',
  $$SELECT public.reconcile_expired_bookings();$$
);