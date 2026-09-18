-- Corrige la regresión del linter: la vista debe evaluar permisos del consultante.
ALTER VIEW public.v_overdue_invoices SET (security_invoker = on);

-- M18: criterio unificado de renta activa (faltaba en la base).
CREATE OR REPLACE FUNCTION public.has_active_rental(p_forklift_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE forklift_id = p_forklift_id
      AND status = 'confirmed'
      AND public.today_mty() BETWEEN start_date AND end_date
  );
$$;
REVOKE ALL ON FUNCTION public.has_active_rental(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_rental(uuid) TO authenticated, service_role;

-- FIX-R2-04 (N7): asignación de venta atómica con guards completos.
CREATE OR REPLACE FUNCTION public.assign_forklift_to_sale_quote(
  p_quote_id uuid,
  p_forklift_ids uuid[],
  p_line_indices int[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idx int;
  v_fid uuid;
  v_prev text;
  v_deleted_at timestamptz;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_forklift_ids IS NULL OR p_line_indices IS NULL
     OR array_length(p_forklift_ids, 1) IS NULL
     OR array_length(p_forklift_ids, 1) <> array_length(p_line_indices, 1) THEN
    RAISE EXCEPTION 'Las listas de unidades y líneas deben tener la misma longitud'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  FOR v_idx IN 1 .. array_length(p_forklift_ids, 1) LOOP
    v_fid := p_forklift_ids[v_idx];

    SELECT status, deleted_at INTO v_prev, v_deleted_at
      FROM public.forklifts WHERE id = v_fid FOR UPDATE;
    IF v_prev IS NULL THEN
      RAISE EXCEPTION 'Montacargas no encontrado: %', v_fid USING ERRCODE = 'check_violation';
    END IF;
    IF v_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'El montacargas % está archivado; restáuralo antes de asignarlo a una venta', v_fid
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_prev = 'sold' THEN
      RAISE EXCEPTION 'El montacargas % ya está vendido', v_fid USING ERRCODE = 'check_violation';
    END IF;
    IF public.has_active_rental(v_fid) THEN
      RAISE EXCEPTION 'El montacargas % tiene una renta activa: cierra la renta antes de venderlo', v_fid
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.quote_assigned_forklifts (quote_id, forklift_id, line_index)
    VALUES (p_quote_id, v_fid, p_line_indices[v_idx]);

    UPDATE public.forklifts
       SET status = 'sold', updated_at = now()
     WHERE id = v_fid;

    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (v_fid, v_prev, 'sold',
            'Asignado a cotización de venta ' || p_quote_id::text);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_forklift_to_sale_quote(uuid, uuid[], int[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_forklift_to_sale_quote(uuid, uuid[], int[]) TO authenticated;

-- M15: horómetro no negativo (verificado: 0 filas violadoras).
ALTER TABLE public.deliveries
  DROP CONSTRAINT IF EXISTS deliveries_hours_reading_non_negative;
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_hours_reading_non_negative
  CHECK (hours_reading IS NULL OR hours_reading >= 0);

-- FIX-R2-10 (1): backfill H7(b) desambiguado (póliza activa más reciente).
UPDATE public.maintenance_logs ml
   SET manual_cost = ROUND((
        SELECT mp.monthly_cost FROM public.maintenance_policies mp
         WHERE mp.forklift_id = ml.forklift_id AND mp.service_type = ml.service_type
         ORDER BY mp.is_active DESC, mp.updated_at DESC, mp.created_at DESC LIMIT 1
       ), 2)
 WHERE ml.deleted_at IS NULL
   AND ml.work_status = 'scheduled'
   AND date_trunc('month', ml.performed_at)::date = ml.performed_at::date
   AND EXTRACT(DAY FROM ml.performed_at) = 1
   AND (ml.description LIKE 'Póliza mensual - %' OR ml.description IS NOT DISTINCT FROM (
        SELECT mp.description FROM public.maintenance_policies mp
         WHERE mp.forklift_id = ml.forklift_id AND mp.service_type = ml.service_type
         ORDER BY mp.is_active DESC, mp.updated_at DESC, mp.created_at DESC LIMIT 1
       ))
   AND COALESCE(ml.cost, 0) = 0
   AND COALESCE(ml.manual_cost, 0) = 0
   AND COALESCE((
        SELECT mp.monthly_cost FROM public.maintenance_policies mp
         WHERE mp.forklift_id = ml.forklift_id AND mp.service_type = ml.service_type
         ORDER BY mp.is_active DESC, mp.updated_at DESC, mp.created_at DESC LIMIT 1
       ), 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_parts pt WHERE pt.maintenance_log_id = ml.id)
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_labor lb WHERE lb.maintenance_log_id = ml.id);

-- FIX-R2-10 (2): limpiar next_service_date de logs de póliza programados.
UPDATE public.maintenance_logs ml
   SET next_service_date = NULL, updated_at = now()
 WHERE ml.deleted_at IS NULL
   AND ml.work_status = 'scheduled'
   AND ml.next_service_date IS NOT NULL
   AND date_trunc('month', ml.performed_at)::date = ml.performed_at::date
   AND EXTRACT(DAY FROM ml.performed_at) = 1
   AND ml.description LIKE 'Póliza mensual - %';

-- FIX-R2-10 (3): status_logs retroactivos del backfill H8.
INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
SELECT f.id, 'maintenance', 'available',
       'Backfill retroactivo (FIX-R2-10): la unidad quedó disponible cuando su OT fue archivada/cancelada por el backfill H8; este log cierra el hueco de auditoría.'
  FROM public.forklifts f
 WHERE f.status = 'available'
   AND f.deleted_at IS NULL
   AND (SELECT sl.to_status
          FROM public.status_logs sl
         WHERE sl.forklift_id = f.id
         ORDER BY sl.changed_at DESC
         LIMIT 1) = 'maintenance'
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_logs ml
                    WHERE ml.forklift_id = f.id AND ml.deleted_at IS NULL
                      AND ml.work_status IN ('pending', 'in_progress'))
   AND NOT EXISTS (SELECT 1 FROM public.damage_records dr
                    WHERE dr.forklift_id = f.id AND dr.deleted_at IS NULL
                      AND dr.status IN ('reported', 'in_repair'))
   AND NOT EXISTS (SELECT 1 FROM public.bookings b
                    WHERE b.forklift_id = f.id AND b.status = 'confirmed'
                      AND public.today_mty() BETWEEN b.start_date AND b.end_date);