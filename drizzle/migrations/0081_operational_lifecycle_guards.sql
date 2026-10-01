-- O-01 / D-01..03: narrow operational checks, without granting fleet or
-- maintenance editing to logistics roles. No existing business rows change.

-- Boolean predicate only: never exposes OT identities, descriptions or costs.
CREATE FUNCTION public.forklift_has_maintenance_block(p_org uuid, p_forklift uuid, p_start date, p_end date)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org IS DISTINCT FROM public.current_internal_organization_id()
       OR NOT public.is_internal_member(auth.uid())
       OR NOT public.has_permission('Flota', 'read') THEN
      RAISE EXCEPTION 'No autorizado para consultar disponibilidad.' USING ERRCODE = '42501';
    END IF;
  ELSIF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
        AND current_setting('role', true) NOT IN ('none', 'postgres', 'service_role') THEN
    RAISE EXCEPTION 'No autorizado para consultar disponibilidad.' USING ERRCODE = '42501';
  END IF;
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'Organización requerida.' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.maintenance_logs ml
     WHERE ml.organization_id = p_org AND ml.forklift_id = p_forklift
       AND ml.deleted_at IS NULL AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
  ) OR EXISTS (
    SELECT 1 FROM (
      SELECT ml.next_service_date FROM public.maintenance_logs ml
       WHERE ml.organization_id = p_org AND ml.forklift_id = p_forklift
         AND ml.next_service_date IS NOT NULL AND ml.deleted_at IS NULL
         AND ml.work_status NOT IN ('scheduled', 'cancelled')
       ORDER BY ml.performed_at DESC, ml.created_at DESC, ml.id DESC LIMIT 1
    ) latest
    CROSS JOIN LATERAL (
      SELECT COALESCE((SELECT cs.maintenance_buffer_days FROM public.company_settings cs
                       WHERE cs.organization_id = p_org LIMIT 1), 3) AS days
    ) buffer
    WHERE latest.next_service_date - buffer.days <= p_end
      AND latest.next_service_date + buffer.days >= p_start
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.forklift_has_maintenance_block(uuid, uuid, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forklift_has_maintenance_block(uuid, uuid, date, date)
  TO authenticated, service_role;

CREATE FUNCTION public.guard_booking_operational_window()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND (NEW.organization_id IS DISTINCT FROM public.current_internal_organization_id()
      OR NOT public.is_internal_member(auth.uid())) THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     AND current_setting('role', true) NOT IN ('none', 'postgres', 'service_role') THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status AND NEW.forklift_id IS NOT DISTINCT FROM OLD.forklift_id
     AND NEW.start_date IS NOT DISTINCT FROM OLD.start_date
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date THEN RETURN NEW; END IF;
  -- Lock the same unit as create_booking; maintenance blocking is evaluated
  -- by the server owner and cannot disappear behind the caller's RLS.
  PERFORM 1 FROM public.forklifts f WHERE f.id = NEW.forklift_id
    AND f.organization_id = NEW.organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Montacargas inexistente o no autorizado.' USING ERRCODE = 'P0002';
  END IF;
  IF public.forklift_has_maintenance_block(NEW.organization_id, NEW.forklift_id, NEW.start_date, NEW.end_date) THEN
    RAISE EXCEPTION 'La reserva invade una orden activa o la ventana de mantenimiento del montacargas.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_booking_operational_window() FROM PUBLIC, anon, authenticated;
-- Runs after the organization context/default has been checked and populated.
CREATE TRIGGER trg_zz_booking_operational_window
  BEFORE INSERT OR UPDATE OF forklift_id, start_date, end_date, status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_operational_window();

CREATE OR REPLACE FUNCTION public.get_available_forklifts(p_start_date date, p_end_date date)
RETURNS SETOF public.forklifts LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE v_org uuid := public.current_internal_organization_id();
BEGIN
  IF v_org IS NULL OR NOT public.is_internal_member(auth.uid())
     OR NOT public.has_permission('Flota', 'read') THEN
    RAISE EXCEPTION 'No autorizado para consultar disponibilidad.' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Rango de fechas inválido.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT f.* FROM public.forklifts f
   WHERE f.organization_id = v_org AND f.status IN ('available', 'rented')
     AND f.deleted_at IS NULL AND COALESCE(f.is_e2e, false) = false
     AND NOT EXISTS (
       SELECT 1 FROM public.bookings b WHERE b.organization_id = v_org AND b.forklift_id = f.id
         AND b.status NOT IN ('completed', 'cancelled')
         AND daterange(b.start_date, b.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.bookings b WHERE b.organization_id = v_org AND b.forklift_id = f.id
         AND b.status = 'confirmed' AND b.start_date <= public.today_mty() AND b.end_date < public.today_mty()
         AND NOT public.booking_is_returned(b.id)
     )
     AND NOT public.forklift_has_maintenance_block(v_org, f.id, p_start_date, p_end_date)
   ORDER BY f.name, f.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_available_forklifts(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_forklifts(date, date) TO authenticated;


CREATE OR REPLACE FUNCTION public.validate_delivery_booking_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_org uuid;
  v_delivery_at timestamptz;
  v_forklift_status text;
  v_forklift_deleted_at timestamptz;
  v_is_completion boolean;
BEGIN
  v_org := public.current_internal_organization_id();
  IF auth.uid() IS NOT NULL THEN
    IF v_org IS NULL OR (NEW.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM v_org)
       OR NOT public.has_permission('Entregas', 'full') THEN
      RAISE EXCEPTION 'No autorizado para operar este transporte.' USING ERRCODE = '42501';
    END IF;
    NEW.organization_id := v_org;
  ELSE
    IF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
       AND current_setting('role', true) NOT IN ('none', 'postgres', 'service_role') THEN
      RAISE EXCEPTION 'No autorizado para operar este transporte.' USING ERRCODE = '42501';
    END IF;
    -- Service/database setup still passes the row's explicit organization.
    v_org := COALESCE(NEW.organization_id, NULLIF(current_setting('app.organization_id', true), '')::uuid);
    NEW.organization_id := v_org;
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organización del transporte requerida.' USING ERRCODE = '42501';
  END IF;
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

  IF v_is_completion AND NEW.scheduled_date > public.today_mty() THEN
    RAISE EXCEPTION 'No se puede completar un transporte con fecha programada futura.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.booking_id IS NULL THEN
    IF v_is_completion THEN
      RAISE EXCEPTION 'Una entrega al cliente debe estar ligada a una reserva antes de completarse.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_booking
    FROM public.bookings
   WHERE id = NEW.booking_id AND organization_id = v_org
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

  SELECT min(d.completed_at) INTO v_delivery_at
    FROM public.deliveries d
   WHERE d.booking_id = v_booking.id AND d.forklift_id = v_booking.forklift_id
     AND d.organization_id = v_org AND d.type = 'delivery' AND d.status = 'completed';

  IF v_is_completion AND NEW.type = 'delivery' AND public.today_mty() < v_booking.start_date THEN
    RAISE EXCEPTION 'No se puede completar una entrega antes del inicio de la reserva.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_is_completion AND NEW.type = 'pickup' AND NOT EXISTS (
    SELECT 1 FROM public.deliveries d
     WHERE d.booking_id = v_booking.id AND d.forklift_id = v_booking.forklift_id
       AND d.organization_id = v_org AND d.type = 'delivery' AND d.status = 'completed'
       AND (d.completed_at <= now() OR (d.completed_at IS NULL AND v_booking.start_date <= public.today_mty()))
  ) THEN
    RAISE EXCEPTION 'No se puede completar una recolección sin entrega completada de esta reserva.'
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

  IF NEW.type = 'pickup' AND NEW.scheduled_date < v_booking.start_date
     AND (v_delivery_at IS NULL OR NEW.scheduled_date < (v_delivery_at AT TIME ZONE 'America/Monterrey')::date) THEN
    RAISE EXCEPTION 'La recolección (%) no puede ser anterior al inicio de la renta (%).',
      NEW.scheduled_date, v_booking.start_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_is_completion AND NEW.type = 'delivery' THEN
    SELECT f.status, f.deleted_at
      INTO v_forklift_status, v_forklift_deleted_at
      FROM public.forklifts f
     WHERE f.id = NEW.forklift_id AND f.organization_id = v_org
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
       WHERE ml.forklift_id = NEW.forklift_id AND ml.organization_id = v_org
         AND ml.deleted_at IS NULL
         AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
    ) THEN
      RAISE EXCEPTION 'El montacargas tiene una orden de mantenimiento activa; no puede entregarse.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.damage_records dr
       WHERE dr.forklift_id = NEW.forklift_id AND dr.organization_id = v_org
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

CREATE OR REPLACE FUNCTION public.complete_delivery(
  p_delivery_id uuid,
  p_signature_base64 text DEFAULT NULL,
  p_hours_reading numeric DEFAULT NULL,
  p_completed_no_evidence_reason text DEFAULT NULL
)
RETURNS public.deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_booking_id uuid;
  v_org uuid := public.current_internal_organization_id();
  v_booking public.bookings%ROWTYPE;
  v_delivery public.deliveries%ROWTYPE;
  v_forklift_status text;
BEGIN
  IF v_org IS NULL OR NOT public.is_internal_member(auth.uid())
     OR NOT public.has_permission('Entregas', 'full')
     OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'administrativo')
             OR public.has_role(auth.uid(), 'dispatcher')) THEN
    RAISE EXCEPTION 'No autorizado para completar transportes.' USING ERRCODE = '42501';
  END IF;

  IF p_hours_reading IS NOT NULL AND p_hours_reading < 0 THEN
    RAISE EXCEPTION 'El horómetro debe ser mayor o igual a cero.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT d.booking_id INTO v_booking_id
    FROM public.deliveries d
   WHERE d.id = p_delivery_id AND d.organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'La entrega debe estar ligada a una reserva antes de completarse.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_booking
    FROM public.bookings b
   WHERE b.id = v_booking_id AND b.organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_delivery
    FROM public.deliveries d
   WHERE d.id = p_delivery_id AND d.organization_id = v_org
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
   WHERE f.id = v_delivery.forklift_id AND f.organization_id = v_org
     AND f.deleted_at IS NULL
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
         completed_at = now(),
         signature_base64 = COALESCE(p_signature_base64, signature_base64),
         hours_reading = COALESCE(p_hours_reading, hours_reading),
         completed_no_evidence_reason = COALESCE(
           NULLIF(btrim(p_completed_no_evidence_reason), ''),
           completed_no_evidence_reason
         ),
         updated_at = now()
   WHERE id = p_delivery_id AND organization_id = v_org
   RETURNING * INTO v_delivery;
  PERFORM set_config('app.delivery_completion_rpc', 'off', true);

  RETURN v_delivery;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.delivery_completion_rpc', 'off', true);
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_return_inspection(p_booking_id uuid, p_forklift_id uuid, p_condition text DEFAULT 'good'::text, p_damage_notes text DEFAULT NULL::text, p_damage_cost numeric DEFAULT 0, p_hours_used numeric DEFAULT NULL::numeric, p_fuel_level text DEFAULT NULL::text, p_inspected_by text DEFAULT NULL::text, p_inspected_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_inspection_id uuid;
  v_old_status text;
  v_new_status text;
  v_customer_id uuid;
  v_is_damaged_condition boolean;
  v_sends_to_maintenance boolean;
  v_booking_start date;
  v_existing_id uuid;
  v_booking_forklift_id uuid;
  v_booking_status text;
  v_open_damages integer;
  v_booking_end date;
  v_max_hours numeric;
  v_extra_rate numeric;
  v_months numeric;
  v_allowed numeric;
  v_extra_hours numeric;
  v_extra_charge numeric;
  v_span_end date;
  v_full_months integer;
  v_anchor date;
  v_rem_days integer;
  v_days_in_month integer;
  v_late_days numeric;
  v_late_charge numeric;
  v_daily_rate numeric;
  v_monthly_rate numeric;
  v_delivery_hours numeric;
  v_pickup_hours numeric;
  v_meter_hours numeric;
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
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Reserva inexistente o no autorizada.'
      USING ERRCODE = 'P0002';
  END IF;

  -- El montacargas también debe ser de la organización actual: una mezcla A/B
  -- falla antes de cualquier escritura.
  IF p_forklift_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.forklifts f
     WHERE f.id = p_forklift_id AND f.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Montacargas inexistente o no autorizado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(p_condition, 'good') NOT IN ('good', 'minor_damage', 'major_damage', 'needs_repair') THEN
    RAISE EXCEPTION 'Condición de devolución no válida (%). Valores permitidos: good, minor_damage, major_damage, needs_repair.', p_condition
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_fuel_level IS NOT NULL AND btrim(p_fuel_level) <> ''
     AND btrim(p_fuel_level) NOT IN ('Full', '3/4', '1/2', '1/4', 'Empty') THEN
    RAISE EXCEPTION 'Nivel de combustible no válido (%). Valores permitidos: Full, 3/4, 1/2, 1/4, Empty.', p_fuel_level
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(p_damage_cost, 0) < 0 THEN
    RAISE EXCEPTION 'El costo de daño no puede ser negativo.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_hours_used IS NOT NULL AND p_hours_used < 0 THEN
    RAISE EXCEPTION 'Las horas usadas no pueden ser negativas (%)', p_hours_used
      USING ERRCODE = 'check_violation';
  END IF;

  v_is_damaged_condition := p_condition IN ('minor_damage', 'major_damage', 'needs_repair');
  v_sends_to_maintenance := v_is_damaged_condition;
  IF v_is_damaged_condition
     AND COALESCE(p_damage_cost, 0) <= 0
     AND (p_damage_notes IS NULL OR btrim(p_damage_notes) = '') THEN
    RAISE EXCEPTION 'La devolución marcada como % requiere costo estimado (>0) o una descripción del daño.', p_condition
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_existing_id
    FROM public.return_inspections
   WHERE booking_id = p_booking_id
     AND organization_id = v_org
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_is_damaged_condition
       OR COALESCE(p_damage_cost, 0) > 0
       OR (p_damage_notes IS NOT NULL AND btrim(p_damage_notes) <> '') THEN
      RAISE EXCEPTION 'La reserva ya tiene inspeccion de devolucion (%). Para reportar un daño adicional usa el registro de daños, no una re-inspeccion.', v_existing_id
        USING ERRCODE = 'check_violation';
    END IF;
    RAISE NOTICE 'La reserva % ya tenia inspeccion (%); se devuelve la existente.', p_booking_id, v_existing_id;
    RETURN v_existing_id;
  END IF;

  SELECT start_date, end_date, forklift_id, status
    INTO v_booking_start, v_booking_end, v_booking_forklift_id, v_booking_status
    FROM public.bookings
   WHERE id = p_booking_id
     AND organization_id = v_org
   FOR UPDATE;
  IF v_booking_start IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0001';
  END IF;
  IF v_booking_forklift_id IS DISTINCT FROM p_forklift_id THEN
    RAISE EXCEPTION 'La reserva % no corresponde al montacargas % (la reserva es de la unidad %). Verifica la unidad antes de completar la devolucion.',
      p_booking_id, p_forklift_id, v_booking_forklift_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_booking_status <> 'confirmed' THEN
    RAISE EXCEPTION 'Solo se puede registrar la devolución de una reserva confirmada (estado actual: %).', v_booking_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.deliveries
     WHERE booking_id = p_booking_id
       AND organization_id = v_org
       AND type = 'delivery'
       AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'No hay una entrega completada para esta reserva; completa primero la entrega al cliente.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- A historic early delivery is physical custody, even before the commercial
  -- period. Its actual Monterrey day is the minimum date in the date-only UI.
  IF NOT EXISTS (
    SELECT 1 FROM public.deliveries d
     WHERE d.booking_id = p_booking_id AND d.forklift_id = p_forklift_id
       AND d.organization_id = v_org AND d.type = 'delivery' AND d.status = 'completed'
       AND ((d.completed_at <= now() AND (d.completed_at AT TIME ZONE 'America/Monterrey')::date
               <= (p_inspected_at AT TIME ZONE 'America/Monterrey')::date) OR
            (d.completed_at IS NULL AND (p_inspected_at AT TIME ZONE 'America/Monterrey')::date >= v_booking_start))
  ) THEN
    RAISE EXCEPTION 'La inspección no puede ser anterior a la entrega real del equipo.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_inspected_at > now() THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser futura.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Bloque 3A: reconciliación del horómetro.
  SELECT d.hours_reading INTO v_delivery_hours
    FROM public.deliveries d
   WHERE d.booking_id = p_booking_id
     AND d.organization_id = v_org
     AND d.type = 'delivery'
     AND d.status = 'completed'
     AND d.hours_reading IS NOT NULL
     AND d.hours_reading >= 0
   ORDER BY COALESCE(d.completed_at, d.scheduled_date::timestamptz) DESC NULLS LAST,
            d.created_at DESC, d.id DESC
   LIMIT 1;
  SELECT d.hours_reading INTO v_pickup_hours
    FROM public.deliveries d
   WHERE d.booking_id = p_booking_id
     AND d.organization_id = v_org
     AND d.type = 'pickup'
     AND d.status = 'completed'
     AND d.hours_reading IS NOT NULL
     AND d.hours_reading >= 0
   ORDER BY COALESCE(d.completed_at, d.scheduled_date::timestamptz) DESC NULLS LAST,
            d.created_at DESC, d.id DESC
   LIMIT 1;
  IF v_delivery_hours IS NOT NULL AND v_pickup_hours IS NOT NULL THEN
    IF v_pickup_hours < v_delivery_hours THEN
      RAISE EXCEPTION 'Lecturas de horómetro inconsistentes: la recolección (%) es menor que la entrega (%). Corrige las lecturas antes de cerrar la devolución.',
        v_pickup_hours, v_delivery_hours
        USING ERRCODE = 'check_violation';
    END IF;
    v_meter_hours := ROUND(v_pickup_hours - v_delivery_hours, 2);
    IF p_hours_used IS NOT NULL AND ROUND(p_hours_used, 2) <> v_meter_hours THEN
      RAISE NOTICE 'Horas capturadas (%) reconciliadas con el horómetro (% - % = %).',
        p_hours_used, v_pickup_hours, v_delivery_hours, v_meter_hours;
    END IF;
    p_hours_used := v_meter_hours;
  END IF;

  SELECT c.max_hours_per_month, c.extra_hour_rate
    INTO v_max_hours, v_extra_rate
    FROM public.contracts c
   WHERE c.booking_id = p_booking_id
     AND c.organization_id = v_org
     AND COALESCE(c.status, '') <> 'cancelled'
   ORDER BY c.created_at DESC
   LIMIT 1;

  IF p_hours_used IS NOT NULL
     AND COALESCE(v_max_hours, 0) > 0
     AND COALESCE(v_extra_rate, 0) > 0 THEN
    v_span_end := COALESCE(v_booking_end, (p_inspected_at AT TIME ZONE 'America/Monterrey')::date);
    v_full_months := EXTRACT(YEAR FROM age(v_span_end, v_booking_start))::integer * 12
                   + EXTRACT(MONTH FROM age(v_span_end, v_booking_start))::integer;
    v_anchor := (v_booking_start + make_interval(months => v_full_months))::date;
    IF v_anchor > v_span_end THEN
      v_full_months := GREATEST(v_full_months - 1, 0);
      v_anchor := (v_booking_start + make_interval(months => v_full_months))::date;
    END IF;
    v_days_in_month := EXTRACT(DAY FROM (
      date_trunc('month', v_anchor) + interval '1 month - 1 day'
    )::date)::integer;
    v_rem_days := GREATEST(v_span_end - v_anchor + 1, 0);
    v_months := GREATEST(1, v_full_months + v_rem_days::numeric / v_days_in_month);
    v_allowed := v_max_hours * v_months;
    IF p_hours_used > v_allowed THEN
      v_extra_hours := ROUND(p_hours_used - v_allowed, 2);
      v_extra_charge := ROUND(v_extra_hours * v_extra_rate, 2);
    END IF;
  END IF;

  IF v_booking_end IS NOT NULL AND (p_inspected_at AT TIME ZONE 'America/Monterrey')::date > v_booking_end THEN
    v_late_days := ((p_inspected_at AT TIME ZONE 'America/Monterrey')::date - v_booking_end)::numeric;
    SELECT b.daily_rate, b.monthly_rate
      INTO v_daily_rate, v_monthly_rate
      FROM public.bookings b
     WHERE b.id = p_booking_id
       AND b.organization_id = v_org;
    IF COALESCE(v_daily_rate, 0) <= 0 AND COALESCE(v_monthly_rate, 0) > 0 THEN
      v_daily_rate := v_monthly_rate
        / EXTRACT(DAY FROM (
            date_trunc('month', v_booking_end) + interval '1 month - 1 day'
          )::date);
    END IF;
    IF COALESCE(v_daily_rate, 0) > 0 THEN
      v_late_charge := ROUND(v_late_days * v_daily_rate, 2);
    END IF;
  END IF;

  SELECT status INTO v_old_status
    FROM public.forklifts
   WHERE id = p_forklift_id
     AND organization_id = v_org
   FOR UPDATE;
  SELECT customer_id INTO v_customer_id
    FROM public.bookings
   WHERE id = p_booking_id
     AND organization_id = v_org;
  IF p_fuel_level IS NULL OR btrim(p_fuel_level) = '' THEN
    RAISE EXCEPTION 'El nivel de combustible es obligatorio en la inspección de devolución'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.return_inspections (
    booking_id, forklift_id, condition, damage_notes, damage_cost,
    hours_used, fuel_level, inspected_by, inspected_at,
    extra_hours, suggested_extra_hour_charge, late_days, suggested_late_charge,
    organization_id
  ) VALUES (
    p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost,
    p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at,
    v_extra_hours, v_extra_charge, v_late_days, v_late_charge,
    v_org
  )
  RETURNING id INTO v_inspection_id;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
     SET return_status = 'returned', status = 'completed', updated_at = now()
   WHERE id = p_booking_id
     AND organization_id = v_org;

  IF v_is_damaged_condition THEN
    INSERT INTO public.damage_records (
      inspection_id, forklift_id, booking_id, customer_id, description,
      estimated_cost, status, previous_forklift_status, organization_id
    ) VALUES (
      v_inspection_id, p_forklift_id, p_booking_id, v_customer_id,
      COALESCE(NULLIF(btrim(p_damage_notes), ''), 'Daño reportado en devolución'),
      COALESCE(p_damage_cost, 0), 'reported', v_old_status, v_org
    );
  END IF;

  IF NOT v_sends_to_maintenance THEN
    SELECT count(*) INTO v_open_damages
      FROM public.damage_records
     WHERE forklift_id = p_forklift_id
       AND organization_id = v_org
       AND deleted_at IS NULL
       AND (status IN ('reported', 'in_repair') OR repaired_at IS NULL);
    IF v_open_damages > 0 THEN
      v_sends_to_maintenance := true;
    END IF;
  END IF;
  IF NOT v_sends_to_maintenance AND EXISTS (
    SELECT 1
      FROM public.maintenance_logs ml
     WHERE ml.forklift_id = p_forklift_id
       AND ml.organization_id = v_org
       AND ml.deleted_at IS NULL
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
  ) THEN
    v_sends_to_maintenance := true;
  END IF;

  IF v_old_status = 'rented' THEN
    v_new_status := CASE
      WHEN v_sends_to_maintenance THEN 'maintenance'
      WHEN EXISTS (
        SELECT 1
          FROM public.bookings b
          JOIN public.deliveries d
            ON d.booking_id = b.id
           AND d.type = 'delivery'
           AND d.status = 'completed'
           AND d.organization_id = v_org
         WHERE b.forklift_id = p_forklift_id
           AND b.organization_id = v_org
           AND b.id <> p_booking_id
           AND b.status = 'confirmed'
           AND NOT public.booking_is_returned(b.id)
      ) THEN 'rented'
      ELSE 'available'
    END;
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE public.forklifts
       SET status = v_new_status, updated_at = now()
     WHERE id = p_forklift_id
       AND organization_id = v_org;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, organization_id)
    VALUES (
      p_forklift_id, v_old_status, v_new_status,
      'Returned — condition: ' || p_condition,
      v_org
    );
  END IF;

  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RETURN v_inspection_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;


REVOKE ALL ON FUNCTION public.validate_delivery_booking_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_delivery(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, text, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_return_inspection(uuid, uuid, text, text, numeric, numeric, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_return_inspection(uuid, uuid, text, text, numeric, numeric, text, text, timestamptz) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
