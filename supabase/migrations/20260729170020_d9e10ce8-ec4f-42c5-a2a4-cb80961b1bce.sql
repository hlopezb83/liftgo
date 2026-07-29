-- DB2-06: forklifts.status solo vía flujo controlado.
CREATE OR REPLACE FUNCTION public.change_forklift_status(p_forklift_id uuid, p_new_status text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_current text; v_active_bookings int;
BEGIN
  SELECT status INTO v_current FROM public.forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Montacargas no encontrado'; END IF;
  IF v_current = p_new_status THEN RETURN; END IF;
  IF p_new_status NOT IN ('available','rented','maintenance','retired','sold') THEN
    RAISE EXCEPTION 'Estado no válido: %', p_new_status;
  END IF;
  SELECT count(*) INTO v_active_bookings FROM public.bookings WHERE forklift_id = p_forklift_id AND status = 'confirmed';
  IF p_new_status = 'rented' AND v_active_bookings = 0 THEN
    RAISE EXCEPTION 'No se puede marcar rentado sin una renta activa';
  END IF;
  IF v_current = 'rented' AND p_new_status IN ('maintenance','available','sold','retired') AND v_active_bookings > 0 THEN
    RAISE EXCEPTION 'El montacargas tiene una renta activa: cierra la renta antes de cambiar su estado';
  END IF;
  IF p_new_status IN ('maintenance','sold','retired') AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'La razón es obligatoria para este cambio de estado';
  END IF;
  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts SET status = p_new_status WHERE id = p_forklift_id;
  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note) VALUES (p_forklift_id, v_current, p_new_status, p_reason);
END; $$;

REVOKE ALL ON FUNCTION public.change_forklift_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_forklift_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_forklift_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_active_bookings int;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF current_setting('app.forklift_rpc', true) = 'on' THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_active_bookings FROM public.bookings WHERE forklift_id = NEW.id AND status = 'confirmed';
  IF OLD.status = 'rented' AND NEW.status IN ('maintenance','available','sold','retired','out_of_service') AND v_active_bookings > 0 THEN
    RAISE EXCEPTION 'El montacargas tiene una renta activa: cierra la renta antes de cambiar su estado' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'rented' AND OLD.status IS DISTINCT FROM 'rented' AND v_active_bookings = 0 THEN
    RAISE EXCEPTION 'No se puede marcar rentado sin una renta activa' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IN ('maintenance','sold','retired') AND OLD.status IS DISTINCT FROM NEW.status
     AND current_setting('app.forklift_rpc', true) IS DISTINCT FROM 'on'
     AND NOT EXISTS (SELECT 1 FROM public.maintenance_logs WHERE forklift_id = NEW.id AND work_status NOT IN ('completed','cancelled','closed','done')) THEN
    RAISE EXCEPTION 'Cambio a % solo via change_forklift_status (con razon) o con bitacora de mantenimiento abierta', NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_forklift_status_change ON public.forklifts;
CREATE TRIGGER trg_guard_forklift_status_change BEFORE UPDATE OF status ON public.forklifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_forklift_status_change();

-- DB2-07: evasión de auditoría vía is_e2e bloqueada y siempre auditada.
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_old jsonb; v_new jsonb; v_changed text[]; v_key text;
  v_user_id uuid; v_email text; v_is_e2e_actor boolean := false;
  v_e2e_flag_changed boolean := false;
BEGIN
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF v_user_id IS NOT NULL THEN
    BEGIN
      SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
      IF v_email IS NOT NULL AND v_email ILIKE 'e2e-%@%' THEN v_is_e2e_actor := true; END IF;
    EXCEPTION WHEN OTHERS THEN v_is_e2e_actor := false; END;
  END IF;
  IF v_is_e2e_actor THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN
    IF (to_jsonb(NEW) ? 'is_e2e') AND ((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE) THEN RETURN NEW; END IF;
    v_new := to_jsonb(NEW) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id) VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_new, v_user_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) ? 'is_e2e') THEN
      v_e2e_flag_changed := ((to_jsonb(NEW)->>'is_e2e') IS DISTINCT FROM (to_jsonb(OLD)->>'is_e2e'))
        OR ((to_jsonb(NEW)->>'e2e_scope') IS DISTINCT FROM (to_jsonb(OLD)->>'e2e_scope'));
    END IF;
    IF NOT v_e2e_flag_changed AND (to_jsonb(NEW) ? 'is_e2e')
       AND (((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE) OR ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE)) THEN
      RETURN NEW;
    END IF;
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_changed := ARRAY[]::text[];
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key NOT IN ('updated_at', 'created_at') AND (v_old->v_key IS DISTINCT FROM v_new->v_key) THEN
        v_changed := v_changed || v_key;
      END IF;
    END LOOP;
    IF array_length(v_changed, 1) > 0 THEN
      v_old := v_old - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      v_new := v_new - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_fields, user_id) VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_old, v_new, v_changed, v_user_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF (to_jsonb(OLD) ? 'is_e2e') AND ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE) THEN RETURN OLD; END IF;
    v_old := to_jsonb(OLD) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, user_id) VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_old, v_user_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $function$;

CREATE OR REPLACE FUNCTION public.guard_is_e2e_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text; v_jwt_role text;
BEGIN
  IF NEW.is_e2e IS NOT DISTINCT FROM OLD.is_e2e AND NEW.e2e_scope IS NOT DISTINCT FROM OLD.e2e_scope THEN RETURN NEW; END IF;
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' THEN RETURN NEW; END IF;
  BEGIN SELECT email INTO v_email FROM auth.users WHERE id = auth.uid(); EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  IF v_email IS NOT NULL AND v_email ILIKE 'e2e-%@%' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Solo actores e2e o el service_role pueden modificar is_e2e/e2e_scope' USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.invoices;
CREATE TRIGGER trg_guard_is_e2e BEFORE UPDATE OF is_e2e, e2e_scope ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.quotes;
CREATE TRIGGER trg_guard_is_e2e BEFORE UPDATE OF is_e2e, e2e_scope ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.bookings;
CREATE TRIGGER trg_guard_is_e2e BEFORE UPDATE OF is_e2e, e2e_scope ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.payments;
CREATE TRIGGER trg_guard_is_e2e BEFORE UPDATE OF is_e2e, e2e_scope ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.customers;
CREATE TRIGGER trg_guard_is_e2e BEFORE UPDATE OF is_e2e, e2e_scope ON public.customers FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.forklifts;
CREATE TRIGGER trg_guard_is_e2e BEFORE UPDATE OF is_e2e, e2e_scope ON public.forklifts FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.equipment_models;
CREATE TRIGGER trg_guard_is_e2e BEFORE UPDATE OF is_e2e, e2e_scope ON public.equipment_models FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();