-- Keep the dashboard's overdue-return alert aligned with the return workflow.
-- Preserve the live function's other metrics, security mode, and grants.
DO $do$
DECLARE
  v_def text := pg_get_functiondef('public.get_dashboard_stats()'::regprocedure);
  v_before text := E'WHERE b.status = ''confirmed''\n          AND b.is_e2e IS NOT TRUE\n          AND b.end_date < public.today_mty()\n          AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE';
  v_after text := E'WHERE b.status = ''confirmed''\n          AND b.is_e2e IS NOT TRUE\n          AND b.return_status IS NULL\n          AND b.start_date <= public.today_mty()\n          AND b.end_date < public.today_mty()\n          AND EXISTS (\n            SELECT 1 FROM public.deliveries d\n            WHERE d.booking_id = b.id\n              AND d.organization_id = b.organization_id\n              AND d.type = ''delivery''\n              AND d.status = ''completed''\n          )\n          AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE';
BEGIN
  IF v_def IS NULL OR position(v_before IN v_def) = 0 THEN
    RAISE EXCEPTION 'get_dashboard_stats: overdue_bookings definition changed';
  END IF;
  EXECUTE replace(v_def, v_before, v_after);
END
$do$;
