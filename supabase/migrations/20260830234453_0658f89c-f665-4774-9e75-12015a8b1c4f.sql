CREATE OR REPLACE FUNCTION public.sync_forklift_status_on_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forklift_status  text;
  v_active_bookings  int;
  v_open_damages     int;
  v_open_work_orders int;
  v_effective_status text;
  v_archived         boolean := false;
  v_verb             text;
BEGIN
  IF NEW.forklift_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- A6-1: archivar una OT abierta debe liberar la unidad igual que cancelarla.
  -- Antes el trigger sólo reaccionaba a work_status, así que archivar una OT
  -- 'in_progress' dejaba el montacargas atascado en 'maintenance'.
  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL THEN
    v_archived := true;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NOT v_archived
     AND OLD.work_status IS NOT DISTINCT FROM NEW.work_status THEN
    RETURN NEW;
  END IF;

  -- Una OT ya archivada no debe seguir moviendo el estatus de la unidad.
  IF NOT v_archived AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_effective_status := CASE WHEN v_archived THEN 'cancelled' ELSE NEW.work_status END;

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

  IF v_effective_status = 'in_progress'
     AND v_forklift_status = 'available' THEN
    UPDATE public.forklifts SET status = 'maintenance', updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' en progreso');
  ELSIF v_effective_status IN ('completed', 'cancelled')
     AND v_forklift_status = 'maintenance'
     AND v_active_bookings = 0 THEN
    v_verb := CASE
                WHEN v_archived THEN 'archivada'
                WHEN NEW.work_status = 'completed' THEN 'completada'
                ELSE 'cancelada'
              END;

    SELECT COUNT(*) INTO v_open_damages
      FROM public.damage_records
     WHERE forklift_id = NEW.forklift_id
       AND deleted_at IS NULL
       AND status IN ('reported', 'in_repair');
    IF v_open_damages > 0 THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
              'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb ||
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
              'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb ||
              ': la unidad permanece en mantenimiento por ' || v_open_work_orders ||
              ' OT(s) abierta(s) (pending/in_progress)');
      RETURN NEW;
    END IF;

    UPDATE public.forklifts SET status = 'available', updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, v_forklift_status, 'available',
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_forklift_on_maintenance ON public.maintenance_logs;
CREATE TRIGGER trg_sync_forklift_on_maintenance
AFTER INSERT OR UPDATE OF work_status, deleted_at ON public.maintenance_logs
FOR EACH ROW EXECUTE FUNCTION public.sync_forklift_status_on_maintenance();

REVOKE EXECUTE ON FUNCTION public.sync_forklift_status_on_maintenance() FROM PUBLIC, anon, authenticated;