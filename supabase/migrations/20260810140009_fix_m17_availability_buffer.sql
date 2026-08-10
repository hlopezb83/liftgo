-- FIX-09 (Media · M17): logs 'scheduled' de póliza (que generate-recurring-
-- maintenance crea cada mes con next_service_date = 1er día del mes siguiente)
-- activaban el buffer de ±3 días y dejaban la flota con póliza no reservable.
-- Incluye los filtros deleted_at del FIX-02/H8.
CREATE OR REPLACE FUNCTION public.get_available_forklifts(p_start_date date, p_end_date date)
RETURNS SETOF forklifts
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
  SELECT f.*
  FROM forklifts f
  WHERE f.status IN ('available', 'rented')
    AND f.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.forklift_id = f.id
        AND b.status NOT IN ('completed', 'cancelled')
        AND b.start_date <= p_end_date
        AND b.end_date >= p_start_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
        FROM maintenance_logs ml
        WHERE ml.next_service_date IS NOT NULL
          AND ml.deleted_at IS NULL                          -- H8
          AND ml.work_status NOT IN ('scheduled', 'cancelled') -- M17
        ORDER BY ml.forklift_id, ml.performed_at DESC
      ) latest
      WHERE latest.forklift_id = f.id
        AND latest.next_service_date - INTERVAL '3 days' <= p_end_date
        AND latest.next_service_date + INTERVAL '3 days' >= p_start_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM maintenance_logs ml
      WHERE ml.forklift_id = f.id
        AND ml.work_status = 'in_progress'
        AND ml.deleted_at IS NULL
    )
  ORDER BY f.name;
$function$;
