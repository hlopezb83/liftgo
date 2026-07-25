CREATE OR REPLACE FUNCTION public.get_sidebar_badge_counts()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'maintenance_open', (SELECT COUNT(*) FROM maintenance_logs
                         WHERE work_status IS DISTINCT FROM 'completed'
                           AND work_status IS DISTINCT FROM 'cancelled'),
    'deliveries_today', (SELECT COUNT(*) FROM deliveries
                         WHERE scheduled_date = CURRENT_DATE
                           AND status = 'scheduled'),
    'returns_today',    (SELECT COUNT(*) FROM bookings
                         WHERE status = 'confirmed'
                           AND end_date = CURRENT_DATE),
    'intents_pending',  (SELECT COUNT(*) FROM customer_payment_intents
                         WHERE status::text = 'pending_review')
  );
$$;

REVOKE ALL ON FUNCTION public.get_sidebar_badge_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sidebar_badge_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sidebar_badge_counts() TO authenticated;