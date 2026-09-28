-- Aggregate the full visible fleet on the server. The list hooks intentionally
-- cap results at 500 and must never be used as the source of dashboard totals.
-- SECURITY INVOKER preserves the restrictive organization RLS on both tables.
CREATE OR REPLACE FUNCTION public.get_dashboard_fleet_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_counts jsonb;
BEGIN
  IF NOT (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role) OR
    public.has_role((SELECT auth.uid()), 'administrativo'::public.app_role) OR
    public.has_role((SELECT auth.uid()), 'auditor'::public.app_role) OR
    public.has_role((SELECT auth.uid()), 'dispatcher'::public.app_role) OR
    public.has_role((SELECT auth.uid()), 'ventas'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH occupied AS (
    SELECT DISTINCT b.forklift_id
    FROM public.bookings b
    WHERE b.status = 'confirmed'
      AND b.is_e2e IS NOT TRUE
      AND b.start_date <= public.today_mty()
      AND b.end_date >= public.today_mty()
  ), effective AS (
    SELECT CASE
      WHEN f.status = 'available' AND o.forklift_id IS NOT NULL THEN 'rented'
      ELSE f.status
    END AS status
    FROM public.forklifts f
    LEFT JOIN occupied o ON o.forklift_id = f.id
    WHERE f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
  )
  SELECT jsonb_build_object(
    'total', count(*),
    'available', count(*) FILTER (WHERE status = 'available'),
    'rented', count(*) FILTER (WHERE status = 'rented'),
    'maintenance', count(*) FILTER (WHERE status = 'maintenance'),
    'retired', count(*) FILTER (WHERE status = 'retired'),
    'sold', count(*) FILTER (WHERE status = 'sold')
  ) INTO v_counts
  FROM effective;

  RETURN v_counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_fleet_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_fleet_counts() TO authenticated, service_role;
