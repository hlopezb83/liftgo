-- FIX-04 (Alta · H10): al cerrar una OT se liberaba la unidad aunque
-- existiera OTRA OT abierta (pending/in_progress) para la misma unidad.
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
    -- H10: no liberar si hay OTRA OT abierta (pending/in_progress, no archivada).
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
