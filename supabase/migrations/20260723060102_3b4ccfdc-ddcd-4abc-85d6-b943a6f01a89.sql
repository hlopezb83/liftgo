-- R10 Bloque 11.5 + 11.6: get_available_forklifts considera la ventana
-- solicitada al aplicar el buffer de mantenimiento y excluye unidades con OT
-- en curso (work_status='in_progress').
CREATE OR REPLACE FUNCTION public.get_available_forklifts(p_start_date date, p_end_date date)
RETURNS SETOF forklifts
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
    -- R10 B11.6: mantenimiento programado que traslapa la ventana solicitada
    -- (con buffer de 3 días alrededor del next_service_date).
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
        FROM maintenance_logs ml
        WHERE ml.next_service_date IS NOT NULL
        ORDER BY ml.forklift_id, ml.performed_at DESC
      ) latest
      WHERE latest.forklift_id = f.id
        AND latest.next_service_date - INTERVAL '3 days' <= p_end_date
        AND latest.next_service_date + INTERVAL '3 days' >= p_start_date
    )
    -- R10 B11.5: OTs en curso bloquean nuevas reservas.
    AND NOT EXISTS (
      SELECT 1 FROM maintenance_logs ml
      WHERE ml.forklift_id = f.id AND ml.work_status = 'in_progress'
    )
  ORDER BY f.name;
$function$;
