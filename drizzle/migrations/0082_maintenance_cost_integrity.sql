-- H-01 / FR-01 / MI-01 / MI-02: closed work orders and repair cost provenance.
-- No historical costs or mock evidence are rewritten by this migration.
ALTER TABLE public.damage_records
  ADD COLUMN actual_cost_source text,
  ADD COLUMN actual_cost_recorded_at timestamptz,
  ADD CONSTRAINT damage_actual_cost_source_check
    CHECK (actual_cost_source IS NULL OR actual_cost_source IN ('manual', 'maintenance'));
COMMENT ON COLUMN public.damage_records.actual_cost_source IS
  'Internal repair cost provenance. NULL means legacy/unverified; manual preserves an explicit valuation, including zero.';
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_closed_maintenance_header()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed text[] := ARRAY['updated_at'];
BEGIN
  IF OLD.work_status NOT IN ('completed', 'cancelled') THEN RETURN NEW; END IF;

  IF current_setting('app.maintenance_reopen_rpc', true) = 'on'
     AND public.has_role(v_uid, 'admin'::public.app_role)
     AND public.is_internal_member(v_uid)
     AND OLD.organization_id = public.current_internal_organization_id()
     AND NEW.work_status = 'in_progress' THEN
    v_allowed := v_allowed || ARRAY['work_status'];
  ELSIF current_setting('app.maintenance_archive_rpc', true) = 'on'
     AND public.is_internal_member(v_uid)
     AND OLD.organization_id = public.current_internal_organization_id()
     AND (public.has_role(v_uid, 'admin'::public.app_role)
          OR (OLD.work_status = 'cancelled' AND public.has_role(v_uid, 'administrativo'::public.app_role))) THEN
    v_allowed := v_allowed || ARRAY['deleted_at', 'deleted_by'];
  ELSIF current_setting('app.maintenance_restore_rpc', true) = 'on'
     AND public.has_role(v_uid, 'admin'::public.app_role)
     AND public.is_internal_member(v_uid)
     AND OLD.organization_id = public.current_internal_organization_id() THEN
    v_allowed := v_allowed || ARRAY['deleted_at', 'deleted_by'];
  END IF;

  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'La orden está cerrada o cancelada. Un administrador debe reabrirla antes de modificar el servicio o sus costos.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_closed_maintenance_header() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_closed_maintenance_header BEFORE UPDATE ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_maintenance_header();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_maintenance_completion_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
DECLARE v_parts numeric; v_labor numeric;
BEGIN
  IF NEW.work_status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.work_status IS DISTINCT FROM NEW.work_status
          OR OLD.performed_at IS DISTINCT FROM NEW.performed_at)
     AND (NEW.performed_at IS NULL OR NEW.performed_at > public.today_mty()) THEN
    RAISE EXCEPTION 'La fecha de cierre no puede ser futura y debe ser una fecha válida de Monterrey.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.work_status = 'completed' AND (TG_OP = 'INSERT' OR OLD.work_status IS DISTINCT FROM NEW.work_status) THEN
    SELECT COALESCE(SUM(quantity_used * cost_at_time), 0) INTO v_parts
      FROM public.maintenance_parts WHERE maintenance_log_id = NEW.id;
    SELECT COALESCE(SUM(total_cost), 0) INTO v_labor
      FROM public.maintenance_labor WHERE maintenance_log_id = NEW.id;
    NEW.cost := ROUND(COALESCE(NEW.manual_cost, 0) + v_parts + v_labor, 2);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_maintenance_completion_date() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_maintenance_completion_date BEFORE INSERT OR UPDATE OF work_status, performed_at
  ON public.maintenance_logs FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_completion_date();
--> statement-breakpoint

-- Lock the parent before consuming/removing parts or labor. A concurrent close
-- must wait for the final cost and a child mutation must observe a closed order.
CREATE OR REPLACE FUNCTION public.reject_mutations_on_closed_maintenance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_log_id uuid; v_status text;
BEGIN
  v_log_id := COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id);
  IF v_log_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  FOR v_status IN
    SELECT work_status FROM public.maintenance_logs
      WHERE id = v_log_id OR (TG_OP = 'UPDATE' AND id = OLD.maintenance_log_id)
      ORDER BY id FOR UPDATE
  LOOP
    IF v_status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'No se pueden modificar refacciones ni mano de obra de una orden %.', v_status
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_mutations_on_closed_maintenance() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.record_damage_actual_cost_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_setting('app.damage_cost_sync', true) = 'on' AND pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF OLD.invoice_id IS NOT NULL OR OLD.status = 'invoiced' THEN
    RAISE EXCEPTION 'El costo de un daño facturado no se modifica desde la reparación.'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.actual_cost_source := 'manual';
  NEW.actual_cost_recorded_at := now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_damage_actual_cost_source() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_damage_actual_cost_source
  BEFORE UPDATE OF actual_cost, actual_cost_source, actual_cost_recorded_at ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.record_damage_actual_cost_source();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.sync_completed_maintenance_damage_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_previous_flag text := current_setting('app.damage_cost_sync', true);
BEGIN
  IF NEW.work_status <> 'completed' OR OLD.work_status = 'completed' THEN RETURN NEW; END IF;
  PERFORM set_config('app.damage_cost_sync', 'on', true);
  UPDATE public.damage_records
     SET actual_cost = COALESCE(NEW.cost, 0),
         actual_cost_source = 'maintenance',
         actual_cost_recorded_at = now()
   WHERE maintenance_log_id = NEW.id
     AND organization_id = NEW.organization_id
     AND deleted_at IS NULL
     AND status = 'repaired'
     AND invoice_id IS NULL
     AND (actual_cost_source = 'maintenance'
          OR (actual_cost_source IS NULL AND COALESCE(actual_cost, 0) = 0));
  PERFORM set_config('app.damage_cost_sync', COALESCE(v_previous_flag, 'off'), true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.damage_cost_sync', COALESCE(v_previous_flag, 'off'), true);
  RAISE;
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_completed_maintenance_damage_cost() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_sync_completed_maintenance_damage_cost AFTER UPDATE OF work_status ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_completed_maintenance_damage_cost();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.start_repair_work_order(p_damage_id uuid, p_service_type text DEFAULT 'reparacion'::text, p_description text DEFAULT NULL::text, p_estimated_cost numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_damage public.damage_records%ROWTYPE;
  v_log_id uuid;
  v_actor text;
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_estimated_cost IS NOT NULL AND p_estimated_cost < 0 THEN
    RAISE EXCEPTION 'El costo estimado de la reparación no puede ser negativo.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_damage
    FROM public.damage_records
   WHERE id = p_damage_id
     AND deleted_at IS NULL
     AND organization_id = v_org
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
   WHERE p.id = v_uid;

  INSERT INTO public.maintenance_logs (forklift_id, service_type, description, manual_cost, work_status, performed_by, organization_id)
  VALUES (
    v_damage.forklift_id,
    COALESCE(NULLIF(btrim(p_service_type), ''), 'reparacion'),
    COALESCE(NULLIF(btrim(p_description), ''), 'Reparación de daño ' || p_damage_id::text || ': ' || v_damage.description),
    0, -- The estimate remains on the damage record; actual expenses are captured separately.
    'in_progress',
    v_actor,
    v_org
  )
  RETURNING id INTO v_log_id;

  UPDATE public.damage_records
     SET maintenance_log_id = v_log_id,
         status = 'in_repair',
         updated_at = now()
   WHERE id = p_damage_id AND organization_id = v_org;

  RETURN v_log_id;
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.restore_maintenance_log(p_log_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_forklift uuid;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: solo un administrador puede restaurar mantenimientos'
      USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'Forbidden: solo un administrador puede restaurar mantenimientos'
      USING ERRCODE = '42501';
  END IF;

  SELECT forklift_id INTO v_forklift
    FROM public.maintenance_logs
   WHERE id = p_log_id AND organization_id = v_org AND deleted_at IS NOT NULL
   FOR UPDATE;

  IF v_forklift IS NULL THEN
    RAISE EXCEPTION 'Registro no encontrado o no esta archivado';
  END IF;

  PERFORM set_config('app.maintenance_restore_rpc', 'on', true);
  UPDATE public.maintenance_logs
     SET deleted_at = NULL,
         updated_at = now()
   WHERE id = p_log_id AND organization_id = v_org;

  PERFORM set_config('app.maintenance_restore_rpc', 'off', true);

  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by, organization_id)
  VALUES (v_forklift, 'ot:archived', 'ot:active',
          'Orden de trabajo ' || p_log_id::text || ' restaurada desde archivados',
          v_uid, v_org);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.maintenance_restore_rpc', 'off', true);
  RAISE;
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_damage_record_mechanic_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  IF current_setting('app.e2e_seed', true) = 'on'
     OR current_setting('app.e2e_teardown', true) = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR v_jwt_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'mechanic'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'administrativo'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'dispatcher'::public.app_role)
  ) THEN
    RETURN NEW;
  END IF;

  -- Only the nested maintenance close trigger can record internal cost for a mechanic.
  IF current_setting('app.damage_cost_sync', true) = 'on' AND pg_trigger_depth() > 1
     AND NEW.actual_cost_source = 'maintenance'
     AND OLD.status = 'repaired' AND OLD.invoice_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.maintenance_logs ml
       WHERE ml.id = OLD.maintenance_log_id AND ml.organization_id = OLD.organization_id
         AND ml.work_status = 'completed' AND NEW.actual_cost = COALESCE(ml.cost, 0)
     )
     AND (to_jsonb(NEW) - ARRAY['actual_cost', 'actual_cost_source', 'actual_cost_recorded_at', 'updated_at'])
       IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['actual_cost', 'actual_cost_source', 'actual_cost_recorded_at', 'updated_at']) THEN
    RETURN NEW;
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description
     OR NEW.estimated_cost IS DISTINCT FROM OLD.estimated_cost
     OR NEW.actual_cost IS DISTINCT FROM OLD.actual_cost
     OR NEW.actual_cost_source IS DISTINCT FROM OLD.actual_cost_source
     OR NEW.actual_cost_recorded_at IS DISTINCT FROM OLD.actual_cost_recorded_at
     OR NEW.forklift_id IS DISTINCT FROM OLD.forklift_id
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.inspection_id IS DISTINCT FROM OLD.inspection_id
     OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.previous_forklift_status IS DISTINCT FROM OLD.previous_forklift_status THEN
    RAISE EXCEPTION 'Un mechanic solo puede actualizar el estado y cierre del daño (status, maintenance_log_id, repaired_at o su archivo), no montos, cliente ni factura.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'in_repair' AND NEW.status = 'repaired' THEN
      NEW.repaired_at := COALESCE(NEW.repaired_at, now());
    ELSIF OLD.status = 'reported' AND NEW.status = 'in_repair'
          AND NEW.maintenance_log_id IS NOT NULL THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Transición de estado no permitida para mechanic en daños: % -> %. Solo se permite in_repair -> repaired (cierre de reparación) o reported -> in_repair con orden de trabajo ligada.',
        OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    IF OLD.status NOT IN ('reported', 'in_repair') THEN
      RAISE EXCEPTION 'Un mechanic solo puede archivar daños abiertos (reported/in_repair). Estado actual: %.', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.deleted_by := COALESCE(NEW.deleted_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

