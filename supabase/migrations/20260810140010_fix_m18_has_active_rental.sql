-- FIX-10 (Media · M18): change_forklift_status y guard_forklift_status_change
-- contaban cualquier booking 'confirmed' (incl. futuro/vencido), mientras
-- sync_forklift_status_on_maintenance filtraba por rango de fechas. Se unifica
-- el criterio en has_active_rental().
--
-- NOTA de validación: la propuesta original del paquete de fixes reescribía
-- damage_restore_forklift_status quitando la verificación de OTs abiertas
-- (pending/in_progress) que SÍ existe en la versión vigente (20260729210845)
-- y que evita restaurar 'available'/'rented' si la unidad sigue en taller por
-- otra OT. Esa verificación se conserva aquí; solo se reemplaza el criterio
-- de renta activa por has_active_rental().
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

CREATE OR REPLACE FUNCTION public.change_forklift_status(p_forklift_id uuid, p_new_status text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_current text; v_has_rental boolean;
BEGIN
  SELECT status INTO v_current FROM public.forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Montacargas no encontrado'; END IF;
  IF v_current = p_new_status THEN RETURN; END IF;
  IF p_new_status NOT IN ('available','rented','maintenance','retired','sold') THEN
    RAISE EXCEPTION 'Estado no válido: %', p_new_status;
  END IF;
  v_has_rental := public.has_active_rental(p_forklift_id);
  IF p_new_status = 'rented' AND NOT v_has_rental THEN
    RAISE EXCEPTION 'No se puede marcar rentado sin una renta activa';
  END IF;
  IF v_current = 'rented' AND p_new_status IN ('maintenance','available','sold','retired') AND v_has_rental THEN
    RAISE EXCEPTION 'El montacargas tiene una renta activa: cierra la renta antes de cambiar su estado';
  END IF;
  IF p_new_status IN ('maintenance','sold','retired') AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'La razón es obligatoria para este cambio de estado';
  END IF;
  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts SET status = p_new_status WHERE id = p_forklift_id;
  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note) VALUES (p_forklift_id, v_current, p_new_status, p_reason);
END; $$;

CREATE OR REPLACE FUNCTION public.guard_forklift_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_has_rental boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF current_setting('app.forklift_rpc', true) = 'on' THEN RETURN NEW; END IF;
  v_has_rental := public.has_active_rental(NEW.id);
  IF OLD.status = 'rented' AND NEW.status IN ('maintenance','available','sold','retired','out_of_service') AND v_has_rental THEN
    RAISE EXCEPTION 'El montacargas tiene una renta activa: cierra la renta antes de cambiar su estado' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'rented' AND OLD.status IS DISTINCT FROM 'rented' AND NOT v_has_rental THEN
    RAISE EXCEPTION 'No se puede marcar rentado sin una renta activa' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IN ('maintenance','sold','retired') AND OLD.status IS DISTINCT FROM NEW.status
     AND current_setting('app.forklift_rpc', true) IS DISTINCT FROM 'on'
     AND NOT EXISTS (SELECT 1 FROM public.maintenance_logs WHERE forklift_id = NEW.id AND deleted_at IS NULL AND work_status NOT IN ('completed','cancelled','closed','done')) THEN
    RAISE EXCEPTION 'Cambio a % solo via change_forklift_status (con razon) o con bitacora de mantenimiento abierta', NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

-- damage_restore_forklift_status: se conserva la verificación vigente de OTs
-- abiertas (pending/in_progress, no archivadas) y solo se reemplaza el
-- criterio de renta activa por has_active_rental().
CREATE OR REPLACE FUNCTION public.damage_restore_forklift_status(p_forklift_id uuid, p_previous text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.maintenance_logs
    WHERE forklift_id = p_forklift_id
      AND deleted_at IS NULL
      AND work_status IN ('pending', 'in_progress')
  ) THEN
    RETURN 'maintenance';
  END IF;

  -- M18: criterio unificado (antes: cualquier confirmed, sin rango de fechas).
  IF p_previous = 'rented' AND public.has_active_rental(p_forklift_id) THEN
    RETURN 'rented';
  END IF;
  RETURN 'available';
END; $$;

-- M18: sync_forklift_status_on_maintenance (FIX-04) usa el mismo criterio.
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

  -- M18: criterio unificado de renta activa.
  v_active_bookings := CASE WHEN public.has_active_rental(NEW.forklift_id) THEN 1 ELSE 0 END;

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
