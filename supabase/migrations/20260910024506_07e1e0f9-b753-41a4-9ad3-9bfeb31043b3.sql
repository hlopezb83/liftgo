CREATE OR REPLACE FUNCTION public.damage_restore_forklift_status(
  p_forklift_id uuid,
  p_previous text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.maintenance_logs ml
     WHERE ml.forklift_id = p_forklift_id
       AND ml.deleted_at IS NULL
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
  ) THEN
    RETURN 'maintenance';
  END IF;

  IF p_previous = 'rented' AND public.has_open_rental(p_forklift_id) THEN
    RETURN 'rented';
  END IF;

  RETURN 'available';
END;
$function$;

REVOKE ALL ON FUNCTION public.damage_restore_forklift_status(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.damage_restore_forklift_status(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_forklift_status_on_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_forklift_status text;
  v_has_open_rental boolean := false;
  v_open_damages integer;
  v_open_work_orders integer;
  v_effective_status text;
  v_archived boolean := false;
  v_restored boolean := false;
  v_verb text;
  v_target text;
BEGIN
  IF NEW.forklift_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL THEN
    v_archived := true;
  ELSIF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NOT NULL
     AND NEW.deleted_at IS NULL THEN
    v_restored := true;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NOT v_archived
     AND NOT v_restored
     AND OLD.work_status IS NOT DISTINCT FROM NEW.work_status THEN
    RETURN NEW;
  END IF;

  IF NOT v_archived AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF v_restored AND NEW.work_status NOT IN ('pending', 'in_progress', 'waiting_parts') THEN
    RETURN NEW;
  END IF;

  v_effective_status := CASE WHEN v_archived THEN 'cancelled' ELSE NEW.work_status END;

  SELECT status INTO v_forklift_status
    FROM public.forklifts
   WHERE id = NEW.forklift_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_has_open_rental := public.has_open_rental(NEW.forklift_id);

  IF v_effective_status IN ('pending', 'in_progress', 'waiting_parts')
     AND (
       v_forklift_status = 'available'
       OR (v_forklift_status = 'rented' AND NOT v_has_open_rental)
     ) THEN
    UPDATE public.forklifts
       SET status = 'maintenance', updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (
      NEW.forklift_id,
      v_forklift_status,
      'maintenance',
      CASE WHEN v_restored
        THEN 'OT ' || COALESCE(NEW.service_type, 'servicio') || ' restaurada en ' || NEW.work_status
        ELSE 'OT ' || COALESCE(NEW.service_type, 'servicio') || ' en ' || NEW.work_status
      END,
      (select auth.uid())
    );
  ELSIF v_effective_status IN ('completed', 'cancelled')
     AND v_forklift_status = 'maintenance' THEN
    v_verb := CASE
      WHEN v_archived THEN 'archivada'
      WHEN NEW.work_status = 'completed' THEN 'completada'
      ELSE 'cancelada'
    END;

    SELECT count(*) INTO v_open_damages
      FROM public.damage_records dr
     WHERE dr.forklift_id = NEW.forklift_id
       AND dr.deleted_at IS NULL
       AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL);
    IF v_open_damages > 0 THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
      VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
              'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb ||
              ': la unidad permanece en mantenimiento por ' || v_open_damages || ' daño(s) abierto(s)',
              (select auth.uid()));
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_open_work_orders
      FROM public.maintenance_logs ml
     WHERE ml.forklift_id = NEW.forklift_id
       AND ml.deleted_at IS NULL
       AND ml.id <> NEW.id
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts');
    IF v_open_work_orders > 0 THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
      VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
              'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb ||
              ': la unidad permanece en mantenimiento por ' || v_open_work_orders || ' OT(s) abierta(s)',
              (select auth.uid()));
      RETURN NEW;
    END IF;

    v_target := CASE WHEN v_has_open_rental THEN 'rented' ELSE 'available' END;
    UPDATE public.forklifts
       SET status = v_target, updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (NEW.forklift_id, v_forklift_status, v_target,
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb,
            (select auth.uid()));
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_forklift_status_on_maintenance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_forklift_on_maintenance ON public.maintenance_logs;
CREATE TRIGGER trg_sync_forklift_on_maintenance
  AFTER INSERT OR UPDATE OF work_status, deleted_at ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_forklift_status_on_maintenance();

NOTIFY pgrst, 'reload schema';