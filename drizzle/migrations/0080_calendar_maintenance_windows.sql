-- Calendar readers (including Ventas/Despacho) need availability blockers even
-- without Mantenimiento/read. The function returns generic labels only and
-- explicitly scopes BOTH maintenance logs and forklifts to the verified org.
CREATE FUNCTION public.get_calendar_maintenance_windows(
  _start date,
  _end date,
  _include_e2e boolean DEFAULT false
)
RETURNS TABLE(id text, forklift_id uuid, date date, label text, is_open boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_buffer integer;
  v_org uuid;
BEGIN
  IF NOT public.has_permission('Calendario', 'read') THEN
    RAISE EXCEPTION 'Permiso insuficiente: se requiere Calendario/read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _start IS NULL OR _end IS NULL OR _end < _start THEN
    RAISE EXCEPTION 'Rango de fechas inválido';
  END IF;
  v_org := public.current_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organización no verificada'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_buffer := public.maintenance_buffer_days();

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (ml.forklift_id) ml.id, ml.forklift_id,
      ml.next_service_date
    FROM public.maintenance_logs ml
    JOIN public.forklifts f ON f.id = ml.forklift_id
      AND f.organization_id = v_org AND f.deleted_at IS NULL
    WHERE ml.next_service_date IS NOT NULL
      AND ml.organization_id = v_org
      AND ml.deleted_at IS NULL
      AND ml.work_status NOT IN ('scheduled', 'cancelled')
      AND (_include_e2e OR ml.is_e2e IS NOT TRUE)
    ORDER BY ml.forklift_id, ml.performed_at DESC
  )
  SELECT latest.id::text || '-next', latest.forklift_id,
    latest.next_service_date,
    'Próximo servicio'::text, false
  FROM latest
  WHERE latest.next_service_date - v_buffer <= _end
    AND latest.next_service_date + v_buffer >= _start
  UNION ALL
  SELECT ml.id::text || '-open', ml.forklift_id, _start,
    'OT abierta'::text, true
  FROM public.maintenance_logs ml
  JOIN public.forklifts f ON f.id = ml.forklift_id
    AND f.organization_id = v_org AND f.deleted_at IS NULL
  WHERE ml.organization_id = v_org
    AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
    AND ml.deleted_at IS NULL
    AND (_include_e2e OR ml.is_e2e IS NOT TRUE);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_calendar_maintenance_windows(date, date, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_maintenance_windows(date, date, boolean)
  TO authenticated;
