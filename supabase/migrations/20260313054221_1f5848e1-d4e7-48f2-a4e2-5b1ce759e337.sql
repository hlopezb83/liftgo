
CREATE OR REPLACE FUNCTION public.get_available_forklifts(p_start_date date, p_end_date date)
 RETURNS SETOF forklifts
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT f.*
  FROM forklifts f
  WHERE f.status IN ('available', 'rented')
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.forklift_id = f.id
        AND b.status != 'completed'
        AND b.status != 'cancelled'
        AND b.start_date <= p_end_date
        AND b.end_date >= p_start_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
        FROM maintenance_logs ml
        WHERE ml.next_service_date IS NOT NULL
        ORDER BY ml.forklift_id, ml.performed_at DESC
      ) latest
      WHERE latest.forklift_id = f.id
        AND latest.next_service_date <= (CURRENT_DATE + INTERVAL '3 days')
    )
  ORDER BY f.name;
$function$;
