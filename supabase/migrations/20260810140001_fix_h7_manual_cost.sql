-- FIX-01 (Alta · H7): el trigger BEFORE INSERT trg_recalc_log_from_manual_insert
-- fuerza cost := manual_cost en maintenance_logs. Los INSERTs que solo escriben
-- `cost` terminan en $0. Se corrige start_repair_work_order (RPC) para escribir
-- manual_cost, y se hace backfill de OTs de daño y logs de póliza ya afectados.

CREATE OR REPLACE FUNCTION public.start_repair_work_order(p_damage_id uuid, p_service_type text DEFAULT 'reparacion'::text, p_description text DEFAULT NULL::text, p_estimated_cost numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_damage public.damage_records%ROWTYPE;
  v_log_id uuid;
  v_actor text;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_estimated_cost IS NOT NULL AND p_estimated_cost < 0 THEN
    RAISE EXCEPTION 'El costo estimado de la reparación no puede ser negativo.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_damage
    FROM public.damage_records
   WHERE id = p_damage_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daño no encontrado o archivado' USING ERRCODE = 'P0001';
  END IF;
  IF v_damage.status <> 'reported' THEN
    RAISE EXCEPTION 'Solo se puede iniciar la reparación de un daño en estado reported (estado actual: %).', v_damage.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_damage.maintenance_log_id IS NOT NULL THEN
    RAISE EXCEPTION 'El daño ya tiene una orden de trabajo vinculada (%).', v_damage.maintenance_log_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- R13-P2-02: la OT creada desde un daño quedaba sin "Realizado por".
  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), p.email)
    INTO v_actor
    FROM public.profiles p
   WHERE p.id = auth.uid();

  -- H7: el importe va en manual_cost (el trigger BEFORE INSERT fuerza cost = manual_cost).
  INSERT INTO public.maintenance_logs (forklift_id, service_type, description, manual_cost, work_status, performed_by)
  VALUES (
    v_damage.forklift_id,
    COALESCE(NULLIF(btrim(p_service_type), ''), 'reparacion'),
    COALESCE(NULLIF(btrim(p_description), ''), 'Reparación de daño ' || p_damage_id::text || ': ' || v_damage.description),
    COALESCE(p_estimated_cost, v_damage.estimated_cost, 0),
    'in_progress',
    v_actor
  )
  RETURNING id INTO v_log_id;

  UPDATE public.damage_records
     SET maintenance_log_id = v_log_id,
         status = 'in_repair',
         updated_at = now()
   WHERE id = p_damage_id;

  RETURN v_log_id;
END;
$function$;

-- Backfill H7 (a): OTs de daño creadas con el costo borrado.
-- Marca: ligadas a un damage_record, cost=0 y manual_cost=0, sin partes ni labor.
-- El UPDATE a manual_cost dispara trg_recalc_log_from_manual y recalcula cost.
UPDATE public.maintenance_logs ml
   SET manual_cost = ROUND(dr.estimated_cost, 2)
  FROM public.damage_records dr
 WHERE dr.maintenance_log_id = ml.id
   AND COALESCE(ml.cost, 0) = 0
   AND COALESCE(ml.manual_cost, 0) = 0
   AND COALESCE(dr.estimated_cost, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_parts mp WHERE mp.maintenance_log_id = ml.id)
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_labor mlb WHERE mlb.maintenance_log_id = ml.id);

-- Backfill H7 (b): logs de póliza mensual generados por generate-recurring-maintenance.
-- Marca: work_status='scheduled', performed_at = día 1 del mes,
-- description con el prefijo 'Póliza mensual - ' (fallback de la edge function).
UPDATE public.maintenance_logs ml
   SET manual_cost = ROUND(mp.monthly_cost, 2)
  FROM public.maintenance_policies mp
 WHERE mp.forklift_id = ml.forklift_id
   AND mp.service_type = ml.service_type
   AND ml.work_status = 'scheduled'
   AND date_trunc('month', ml.performed_at)::date = ml.performed_at::date
   AND EXTRACT(DAY FROM ml.performed_at) = 1
   AND (ml.description LIKE 'Póliza mensual - %' OR ml.description IS NOT DISTINCT FROM mp.description)
   AND COALESCE(ml.cost, 0) = 0
   AND COALESCE(ml.manual_cost, 0) = 0
   AND COALESCE(mp.monthly_cost, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_parts pt WHERE pt.maintenance_log_id = ml.id)
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_labor lb WHERE lb.maintenance_log_id = ml.id);
