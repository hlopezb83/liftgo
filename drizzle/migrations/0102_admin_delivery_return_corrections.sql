CREATE OR REPLACE FUNCTION public.guard_delivery_completed_terminal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed text[];
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  -- Anulación administrativa auditada (void_completed_delivery).
  IF OLD.status = 'completed' AND NEW.status = 'cancelled'
     AND current_setting('app.delivery_void', true) = 'on' THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE OLD.status
    WHEN 'pending' THEN ARRAY['scheduled', 'completed', 'cancelled']
    WHEN 'scheduled' THEN ARRAY['completed', 'cancelled']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transición de entrega no permitida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'deliveries_status_transition';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_correction_guard()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid := public.current_internal_organization_id();
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR NOT public.is_internal_member(v_uid)
     OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede corregir registros capturados por error.'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_org;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_correction_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.correct_delivery_completed_at(
  p_delivery_id uuid, p_completed_at timestamptz, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.admin_correction_guard();
  v_d public.deliveries%ROWTYPE;
  v_new_date date;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'La corrección requiere un motivo.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_completed_at IS NULL OR p_completed_at > now() THEN
    RAISE EXCEPTION 'La fecha real no puede estar vacía ni ser futura.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_d FROM public.deliveries
   WHERE id = p_delivery_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_d.status <> 'completed' THEN
    RAISE EXCEPTION 'Solo se corrige la fecha de entregas completadas; las programadas se reprograman.'
      USING ERRCODE = 'check_violation';
  END IF;
  v_new_date := (p_completed_at AT TIME ZONE 'America/Monterrey')::date;

  PERFORM set_config('app.audit_revert', 'on', true);
  UPDATE public.deliveries
     SET completed_at = p_completed_at, scheduled_date = v_new_date, updated_at = now()
   WHERE id = p_delivery_id;
  PERFORM set_config('app.audit_revert', 'off', true);

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id, source, organization_id)
  VALUES ('deliveries', p_delivery_id, 'ADMIN_CORRECTION',
          jsonb_build_object('completed_at', v_d.completed_at, 'scheduled_date', v_d.scheduled_date),
          jsonb_build_object('completed_at', p_completed_at, 'scheduled_date', v_new_date, 'reason', btrim(p_reason)),
          (select auth.uid()), 'user', v_org);
  RETURN p_delivery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_completed_delivery(p_delivery_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.admin_correction_guard();
  v_d public.deliveries%ROWTYPE;
  v_fl text;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'La anulación requiere un motivo.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_d FROM public.deliveries
   WHERE id = p_delivery_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_d.status <> 'completed' THEN
    RAISE EXCEPTION 'Solo se anulan entregas completadas; las programadas se cancelan o eliminan.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_d.booking_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.return_inspections ri WHERE ri.booking_id = v_d.booking_id
  ) THEN
    RAISE EXCEPTION 'La reserva ya tiene devolución registrada; anula primero la devolución.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.delivery_void', 'on', true);
  UPDATE public.deliveries SET status = 'cancelled', updated_at = now() WHERE id = p_delivery_id;
  PERFORM set_config('app.delivery_void', 'off', true);

  -- Liberar la unidad si ya no queda ninguna entrega completada vigente.
  IF v_d.type = 'delivery' AND v_d.forklift_id IS NOT NULL THEN
    SELECT status INTO v_fl FROM public.forklifts
     WHERE id = v_d.forklift_id AND organization_id = v_org FOR UPDATE;
    IF v_fl = 'rented' AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
        JOIN public.deliveries d ON d.booking_id = b.id AND d.type = 'delivery' AND d.status = 'completed'
       WHERE b.forklift_id = v_d.forklift_id AND b.organization_id = v_org
         AND b.status = 'confirmed' AND NOT public.booking_is_returned(b.id)
    ) THEN
      PERFORM set_config('app.forklift_rpc', 'on', true);
      UPDATE public.forklifts SET status = 'available', updated_at = now() WHERE id = v_d.forklift_id;
      PERFORM set_config('app.forklift_rpc', 'off', true);
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by, organization_id)
      VALUES (v_d.forklift_id, 'rented', 'available',
              'Entrega anulada ' || COALESCE(v_d.delivery_number, '') || ': ' || btrim(p_reason),
              (select auth.uid()), v_org);
    END IF;
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id, source, organization_id)
  VALUES ('deliveries', p_delivery_id, 'ADMIN_VOID',
          jsonb_build_object('status', 'completed'),
          jsonb_build_object('status', 'cancelled', 'reason', btrim(p_reason)),
          (select auth.uid()), 'user', v_org);
  RETURN p_delivery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_return_inspection(p_inspection_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.admin_correction_guard();
  v_ins public.return_inspections%ROWTYPE;
  v_b public.bookings%ROWTYPE;
  v_fl text;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'La anulación requiere un motivo.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_ins FROM public.return_inspections
   WHERE id = p_inspection_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolución no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.damage_records dr WHERE dr.inspection_id = p_inspection_id) THEN
    RAISE EXCEPTION 'Esta devolución tiene daños registrados; resuélvelos o elimínalos antes de anularla.'
      USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_b FROM public.bookings
   WHERE id = v_ins.booking_id AND organization_id = v_org FOR UPDATE;
  IF v_b.status = 'cancelled' THEN
    RAISE EXCEPTION 'La reserva está cancelada; no se puede reabrir.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id, source, organization_id)
  VALUES ('return_inspections', p_inspection_id, 'ADMIN_VOID', to_jsonb(v_ins),
          jsonb_build_object('reason', btrim(p_reason), 'booking_reopened', v_b.booking_number),
          (select auth.uid()), 'user', v_org);

  DELETE FROM public.return_inspections WHERE id = p_inspection_id;

  PERFORM set_config('app.audit_revert', 'on', true);
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'confirmed', return_status = NULL, updated_at = now()
   WHERE id = v_b.id;
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.audit_revert', 'off', true);

  SELECT status INTO v_fl FROM public.forklifts
   WHERE id = v_ins.forklift_id AND organization_id = v_org FOR UPDATE;
  IF v_fl = 'available' AND EXISTS (
    SELECT 1 FROM public.deliveries d
     WHERE d.booking_id = v_b.id AND d.type = 'delivery' AND d.status = 'completed'
  ) THEN
    PERFORM set_config('app.forklift_rpc', 'on', true);
    PERFORM set_config('app.delivery_completed_effect', 'on', true);
    UPDATE public.forklifts SET status = 'rented', updated_at = now() WHERE id = v_ins.forklift_id;
    PERFORM set_config('app.delivery_completed_effect', 'off', true);
    PERFORM set_config('app.forklift_rpc', 'off', true);
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by, organization_id)
    VALUES (v_ins.forklift_id, 'available', 'rented',
            'Devolución anulada ' || COALESCE(v_ins.inspection_number, '') || ': ' || btrim(p_reason),
            (select auth.uid()), v_org);
  END IF;
  RETURN v_b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_delivery_completed_at(uuid, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_completed_delivery(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_return_inspection(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_delivery_completed_at(uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_completed_delivery(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_return_inspection(uuid, text) TO authenticated;