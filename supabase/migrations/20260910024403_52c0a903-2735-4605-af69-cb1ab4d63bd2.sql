CREATE OR REPLACE FUNCTION public.validate_delivery_booking_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_forklift_status text;
  v_forklift_deleted_at timestamptz;
  v_is_completion boolean;
BEGIN
  v_is_completion := NEW.status = 'completed'
    AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'completed'));

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF (to_jsonb(NEW) - 'status' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
      RAISE EXCEPTION 'Cancelar una entrega sólo puede modificar status y updated_at.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.booking_id IS NULL THEN
    IF v_is_completion AND NEW.type = 'delivery' THEN
      RAISE EXCEPTION 'Una entrega al cliente debe estar ligada a una reserva antes de completarse.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_booking
    FROM public.bookings
   WHERE id = NEW.booking_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La reserva % no existe', NEW.booking_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.forklift_id IS DISTINCT FROM v_booking.forklift_id THEN
    RAISE EXCEPTION 'El montacargas de la entrega (%) no corresponde al de la reserva (%).',
      NEW.forklift_id, v_booking.forklift_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.type = 'pickup' AND v_booking.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Solo se pueden programar o completar entregas de una reserva confirmada (estado actual: %).',
      v_booking.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.type = 'delivery'
     AND (NEW.scheduled_date < v_booking.start_date OR NEW.scheduled_date > v_booking.end_date) THEN
    RAISE EXCEPTION 'La entrega (%) debe caer dentro de la ventana de la renta (% → %).',
      NEW.scheduled_date, v_booking.start_date, v_booking.end_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.type = 'pickup' AND NEW.scheduled_date < v_booking.start_date THEN
    RAISE EXCEPTION 'La recolección (%) no puede ser anterior al inicio de la renta (%).',
      NEW.scheduled_date, v_booking.start_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_is_completion AND NEW.type = 'delivery' THEN
    SELECT f.status, f.deleted_at
      INTO v_forklift_status, v_forklift_deleted_at
      FROM public.forklifts f
     WHERE f.id = NEW.forklift_id
     FOR UPDATE;

    IF NOT FOUND OR v_forklift_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'El montacargas no existe o está archivado; no puede entregarse.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_forklift_status <> 'available' THEN
      RAISE EXCEPTION 'El montacargas no está operativo para entrega (estado: %).', v_forklift_status
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'delivery_requires_available_forklift';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.maintenance_logs ml
       WHERE ml.forklift_id = NEW.forklift_id
         AND ml.deleted_at IS NULL
         AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
    ) THEN
      RAISE EXCEPTION 'El montacargas tiene una orden de mantenimiento activa; no puede entregarse.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.damage_records dr
       WHERE dr.forklift_id = NEW.forklift_id
         AND dr.deleted_at IS NULL
         AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL)
    ) THEN
      RAISE EXCEPTION 'El montacargas tiene daños abiertos; no puede entregarse.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_delivery_booking_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_delivery_booking_integrity ON public.deliveries;
CREATE TRIGGER trg_delivery_booking_integrity
  BEFORE INSERT OR UPDATE OF booking_id, forklift_id, scheduled_date, type, status
  ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_booking_integrity();

CREATE OR REPLACE FUNCTION public.apply_delivery_completed_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rows integer;
  v_from_status text;
BEGIN
  IF NEW.status <> 'completed' OR NEW.type <> 'delivery' OR NEW.forklift_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_from_status
    FROM public.forklifts
   WHERE id = NEW.forklift_id
   FOR UPDATE;

  IF v_from_status <> 'available' THEN
    RAISE EXCEPTION 'No se pudo completar la entrega: la unidad cambió a estado %.',
      COALESCE(v_from_status, 'inexistente')
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);
  PERFORM set_config('app.delivery_completed_effect', 'on', true);
  UPDATE public.forklifts
     SET status = 'rented', updated_at = now()
   WHERE id = NEW.forklift_id
     AND status = 'available';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('app.delivery_completed_effect', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'No se pudo completar la entrega: la unidad dejó de estar disponible.'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
  VALUES (NEW.forklift_id, v_from_status, 'rented',
          'Entrega completada ' || COALESCE(NEW.delivery_number, NEW.id::text),
          (select auth.uid()));

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.delivery_completed_effect', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_delivery_completed_effects() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_delivery_completed_effects ON public.deliveries;
CREATE TRIGGER trg_delivery_completed_effects
  AFTER INSERT OR UPDATE OF status ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.apply_delivery_completed_effects();

CREATE OR REPLACE FUNCTION public.complete_delivery(
  p_delivery_id uuid,
  p_signature_base64 text DEFAULT NULL,
  p_hours_reading numeric DEFAULT NULL,
  p_completed_no_evidence_reason text DEFAULT NULL
)
RETURNS public.deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking_id uuid;
  v_booking public.bookings%ROWTYPE;
  v_delivery public.deliveries%ROWTYPE;
  v_forklift_status text;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND NOT (
       public.has_role((select auth.uid()), 'admin'::app_role)
       OR public.has_role((select auth.uid()), 'administrativo'::app_role)
       OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
     ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_hours_reading IS NOT NULL AND p_hours_reading < 0 THEN
    RAISE EXCEPTION 'El horómetro debe ser mayor o igual a cero.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT d.booking_id INTO v_booking_id
    FROM public.deliveries d
   WHERE d.id = p_delivery_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'La entrega debe estar ligada a una reserva antes de completarse.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_booking
    FROM public.bookings b
   WHERE b.id = v_booking_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_delivery
    FROM public.deliveries d
   WHERE d.id = p_delivery_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_delivery.booking_id IS DISTINCT FROM v_booking_id THEN
    RAISE EXCEPTION 'La entrega cambió de reserva; recarga antes de continuar.'
      USING ERRCODE = '40001';
  END IF;
  IF v_delivery.status NOT IN ('pending', 'scheduled') THEN
    RAISE EXCEPTION 'La entrega ya está %; recarga antes de continuar.', v_delivery.status
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'deliveries_status_transition';
  END IF;

  SELECT f.status INTO v_forklift_status
    FROM public.forklifts f
   WHERE f.id = v_delivery.forklift_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Montacargas no encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_delivery.type = 'delivery' THEN
    IF v_booking.status <> 'confirmed' THEN
      RAISE EXCEPTION 'La reserva ya está %; no se puede completar la entrega.', v_booking.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_forklift_status <> 'available' THEN
      RAISE EXCEPTION 'El montacargas no está operativo para entrega (estado: %).', v_forklift_status
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'delivery_requires_available_forklift';
    END IF;
  END IF;

  PERFORM set_config('app.delivery_completion_rpc', 'on', true);
  UPDATE public.deliveries
     SET status = 'completed',
         signature_base64 = COALESCE(p_signature_base64, signature_base64),
         hours_reading = COALESCE(p_hours_reading, hours_reading),
         completed_no_evidence_reason = COALESCE(
           NULLIF(btrim(p_completed_no_evidence_reason), ''),
           completed_no_evidence_reason
         ),
         updated_at = now()
   WHERE id = p_delivery_id
   RETURNING * INTO v_delivery;
  PERFORM set_config('app.delivery_completion_rpc', 'off', true);

  RETURN v_delivery;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.delivery_completion_rpc', 'off', true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_delivery(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, text, numeric, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_delivery(uuid, text, numeric, text) IS
  'Completa una entrega/recolección bajo locks de reserva, fila logística y unidad; rechaza estados obsoletos.';

CREATE OR REPLACE FUNCTION public.enforce_signed_contract_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_allowed text[];
  v_jwt_role text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_allowed := CASE OLD.status
      WHEN 'draft' THEN ARRAY['sent', 'signed', 'active', 'completed', 'cancelled']
      WHEN 'sent' THEN ARRAY['draft', 'signed', 'active', 'completed', 'cancelled']
      WHEN 'signed' THEN ARRAY['completed', 'cancelled']
      WHEN 'active' THEN ARRAY['completed', 'cancelled']
      ELSE ARRAY[]::text[]
    END;

    IF NOT (NEW.status = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'Transición de contrato no permitida: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'contracts_status_transition';
    END IF;

    IF OLD.status IN ('signed', 'active') THEN
      BEGIN
        v_jwt_role := auth.jwt() ->> 'role';
      EXCEPTION WHEN OTHERS THEN
        v_jwt_role := NULL;
      END;
      IF NOT public.has_role((select auth.uid()), 'admin'::app_role)
         AND v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Solo un administrador puede finalizar o cancelar un contrato firmado o activo.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF OLD.status IN ('signed', 'active', 'cancelled', 'completed')
     AND (
       NEW.daily_rate IS DISTINCT FROM OLD.daily_rate
       OR NEW.weekly_rate IS DISTINCT FROM OLD.weekly_rate
       OR NEW.monthly_rate IS DISTINCT FROM OLD.monthly_rate
       OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.terms_text IS DISTINCT FROM OLD.terms_text
       OR NEW.extra_hour_rate IS DISTINCT FROM OLD.extra_hour_rate
       OR NEW.max_hours_per_month IS DISTINCT FROM OLD.max_hours_per_month
     ) THEN
    RAISE EXCEPTION 'No se pueden editar los campos de un contrato firmado, activo, completado o cancelado.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_signed_contract_lock() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';