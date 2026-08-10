-- FIX-01 (H7): el importe de la OT de daño va en manual_cost.
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

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), p.email)
    INTO v_actor
    FROM public.profiles p
   WHERE p.id = auth.uid();

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

UPDATE public.maintenance_logs ml
   SET manual_cost = ROUND(dr.estimated_cost, 2)
  FROM public.damage_records dr
 WHERE dr.maintenance_log_id = ml.id
   AND COALESCE(ml.cost, 0) = 0
   AND COALESCE(ml.manual_cost, 0) = 0
   AND COALESCE(dr.estimated_cost, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_parts mp WHERE mp.maintenance_log_id = ml.id)
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_labor mlb WHERE mlb.maintenance_log_id = ml.id);

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

-- FIX-02 (H8): logs/OTs archivados dejan de bloquear disponibilidad.
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
          AND ml.deleted_at IS NULL
        ORDER BY ml.forklift_id, ml.performed_at DESC
      ) latest
      WHERE latest.forklift_id = f.id
        AND latest.next_service_date - INTERVAL '3 days' <= p_end_date
        AND latest.next_service_date + INTERVAL '3 days' >= p_start_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM maintenance_logs ml
      WHERE ml.forklift_id = f.id AND ml.work_status = 'in_progress'
        AND ml.deleted_at IS NULL
    )
  ORDER BY f.name;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_maintenance_log(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: solo admin/administrativo pueden archivar mantenimientos';
  END IF;

  UPDATE maintenance_logs
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         work_status = CASE
           WHEN work_status IN ('pending', 'in_progress', 'scheduled') THEN 'cancelled'
           ELSE work_status
         END,
         updated_at = now()
   WHERE id = p_log_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado';
  END IF;
END;
$$;

UPDATE public.maintenance_logs
   SET work_status = 'cancelled', updated_at = now()
 WHERE deleted_at IS NOT NULL
   AND work_status IN ('pending', 'in_progress', 'scheduled');

UPDATE public.forklifts f
   SET status = 'available', updated_at = now()
 WHERE f.status = 'maintenance'
   AND f.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.maintenance_logs ml
                    WHERE ml.forklift_id = f.id AND ml.deleted_at IS NULL
                      AND ml.work_status IN ('pending', 'in_progress'))
   AND NOT EXISTS (SELECT 1 FROM public.damage_records dr
                    WHERE dr.forklift_id = f.id AND dr.deleted_at IS NULL
                      AND dr.status IN ('reported', 'in_repair'))
   AND NOT EXISTS (SELECT 1 FROM public.bookings b
                    WHERE b.forklift_id = f.id AND b.status = 'confirmed'
                      AND public.today_mty() BETWEEN b.start_date AND b.end_date);

-- FIX-03 (H9): evitar doble facturación de un daño.
CREATE UNIQUE INDEX IF NOT EXISTS uq_damage_records_invoice_id
  ON public.damage_records (invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_damage_record_double_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL
     AND OLD.status = 'invoiced'
     AND OLD.invoice_id IS NOT NULL
     AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
    RAISE EXCEPTION 'El daño ya está facturado (invoice_id=%). Cancela la factura previa antes de ligar otra.', OLD.invoice_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_damage_double_invoice ON public.damage_records;
CREATE TRIGGER trg_guard_damage_double_invoice
  BEFORE UPDATE OF invoice_id, status ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_damage_record_double_invoice();

-- FIX-04 (H10): no liberar la unidad si queda otra OT abierta.
CREATE OR REPLACE FUNCTION public.sync_forklift_status_on_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_forklift_status  text;
  v_active_bookings  int;
  v_open_damages     int;
  v_open_work_orders int;
BEGIN
  IF NEW.forklift_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.work_status IS NOT DISTINCT FROM NEW.work_status THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_forklift_status
    FROM public.forklifts WHERE id = NEW.forklift_id FOR UPDATE;

  IF v_forklift_status IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_active_bookings
    FROM public.bookings
   WHERE forklift_id = NEW.forklift_id
     AND status = 'confirmed'
     AND public.today_mty() BETWEEN start_date AND end_date;

  IF NEW.work_status = 'in_progress'
     AND v_forklift_status = 'available' THEN
    UPDATE public.forklifts SET status = 'maintenance', updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' en progreso');
  ELSIF NEW.work_status IN ('completed', 'cancelled')
     AND v_forklift_status = 'maintenance'
     AND v_active_bookings = 0 THEN
    SELECT COUNT(*) INTO v_open_damages
      FROM public.damage_records
     WHERE forklift_id = NEW.forklift_id
       AND deleted_at IS NULL
       AND status IN ('reported', 'in_repair');
    IF v_open_damages > 0 THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
              'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' ||
              CASE WHEN NEW.work_status = 'completed' THEN 'completada' ELSE 'cancelada' END ||
              ': la unidad permanece en mantenimiento por ' || v_open_damages ||
              ' daño(s) abierto(s) (reported/in_repair)');
      RETURN NEW;
    END IF;
    SELECT COUNT(*) INTO v_open_work_orders
      FROM public.maintenance_logs ml
     WHERE ml.forklift_id = NEW.forklift_id
       AND ml.deleted_at IS NULL
       AND ml.id <> NEW.id
       AND ml.work_status IN ('pending', 'in_progress');
    IF v_open_work_orders > 0 THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
              'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' ||
              CASE WHEN NEW.work_status = 'completed' THEN 'completada' ELSE 'cancelada' END ||
              ': la unidad permanece en mantenimiento por ' || v_open_work_orders ||
              ' OT(s) abierta(s) (pending/in_progress)');
      RETURN NEW;
    END IF;
    UPDATE public.forklifts SET status = 'available', updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, v_forklift_status, 'available',
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' ||
            CASE WHEN NEW.work_status = 'completed' THEN 'completada' ELSE 'cancelada' END);
  END IF;

  RETURN NEW;
END;
$function$;