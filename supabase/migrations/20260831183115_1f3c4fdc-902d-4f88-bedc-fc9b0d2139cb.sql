-- A6R2-7: el buffer de 3 dias alrededor del proximo servicio estaba
-- hardcodeado en create_booking, extend_booking y get_available_forklifts.
-- Se vuelve configurable en company_settings con una funcion helper.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS maintenance_buffer_days integer NOT NULL DEFAULT 3;

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_maintenance_buffer_days_check;
ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_maintenance_buffer_days_check
  CHECK (maintenance_buffer_days >= 0 AND maintenance_buffer_days <= 30);

CREATE OR REPLACE FUNCTION public.maintenance_buffer_days()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT cs.maintenance_buffer_days FROM public.company_settings cs LIMIT 1),
    3
  );
$$;

REVOKE ALL ON FUNCTION public.maintenance_buffer_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maintenance_buffer_days() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_booking(p_forklift_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_contact text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_recurring_billing boolean DEFAULT false, p_quote_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id uuid; v_booking_number text; v_current_status text; v_starts_today boolean;
  v_quote_status text; v_deleted_at timestamptz;
  v_buffer interval := make_interval(days => public.maintenance_buffer_days());
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN NULL;
  ELSIF has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)
     OR has_role(auth.uid(), 'ventas'::app_role) THEN
    IF p_quote_id IS NULL THEN
      RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
    END IF;
  ELSE RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_quote_id IS NOT NULL THEN
    SELECT status INTO v_quote_status FROM quotes WHERE id = p_quote_id;
    IF v_quote_status IS NULL THEN
      RAISE EXCEPTION 'Cotización no encontrada';
    END IF;
    IF v_quote_status <> 'accepted' THEN
      RAISE EXCEPTION 'La cotización debe estar aceptada por el cliente para crear la reserva (estado actual: %).', v_quote_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN RAISE EXCEPTION 'Fechas de reserva requeridas'; END IF;
  IF p_end_date < p_start_date THEN RAISE EXCEPTION 'La fecha final no puede ser anterior a la inicial'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'El cliente seleccionado está archivado o no existe'; END IF;
  SELECT status, deleted_at INTO v_current_status, v_deleted_at
    FROM forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_current_status IS NULL THEN RAISE EXCEPTION 'Montacargas no encontrado'; END IF;
  -- A4B-06: una unidad archivada no puede recibir reservas nuevas.
  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'El montacargas está archivado; restáuralo antes de reservarlo'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_current_status IN ('maintenance', 'out_of_service', 'retired', 'sold') THEN
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status USING ERRCODE = 'check_violation';
  END IF;
  -- N-6: renta vencida sin devolucion registrada bloquea nuevas reservas.
  IF EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.forklift_id = p_forklift_id
      AND b.status = 'confirmed'
      AND b.start_date <= public.today_mty()
      AND b.end_date < public.today_mty()
      AND b.return_status IS DISTINCT FROM 'returned'
      AND NOT EXISTS (
        SELECT 1 FROM public.deliveries r
        WHERE r.booking_id = b.id AND r.type = 'return' AND r.status = 'completed'
      )
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene una renta vencida sin devolución registrada; registra la inspección de retorno antes de reservar'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM bookings WHERE forklift_id = p_forklift_id
      AND status NOT IN ('cancelled','completed')
      AND daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'El montacargas ya está reservado en ese rango de fechas' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
      FROM maintenance_logs ml
      WHERE ml.next_service_date IS NOT NULL
        AND ml.deleted_at IS NULL
        AND ml.work_status NOT IN ('scheduled', 'cancelled')
      ORDER BY ml.forklift_id, ml.performed_at DESC
    ) latest
    WHERE latest.forklift_id = p_forklift_id
      AND latest.next_service_date - v_buffer <= p_end_date
      AND latest.next_service_date + v_buffer >= p_start_date
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene mantenimiento programado dentro de la ventana solicitada (buffer de % días alrededor del próximo servicio)', public.maintenance_buffer_days()
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM maintenance_logs ml
    WHERE ml.forklift_id = p_forklift_id AND ml.work_status = 'in_progress'
      AND ml.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene una orden de trabajo en curso; no se puede reservar'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bookings.booking_number'));
  v_booking_number := next_booking_number();
  PERFORM set_config('app.booking_rpc', 'on', true);
  INSERT INTO bookings (forklift_id, customer_id, customer_name, customer_contact, start_date, end_date, recurring_billing, status, booking_number, quote_id)
  VALUES (p_forklift_id, p_customer_id, p_customer_name, p_customer_contact, p_start_date, p_end_date, p_recurring_billing, 'confirmed', v_booking_number, p_quote_id)
  RETURNING id INTO v_booking_id;
  v_starts_today := p_start_date <= public.today_mty();
  IF v_starts_today AND v_current_status = 'available' THEN
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE forklifts SET status = 'rented', updated_at = now() WHERE id = p_forklift_id;
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (p_forklift_id, 'available', 'rented', 'Reserva ' || v_booking_number || ' creada');
  END IF;
  -- R6-17: reset de los bypass al salir (camino feliz).
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RETURN v_booking_id;
EXCEPTION WHEN OTHERS THEN
  -- R6-17: reset de los bypass en excepcion.
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.extend_booking(p_booking_id uuid, p_new_end_date date, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_forklift_id uuid;
  v_start_date date;
  v_current_end date;
  v_status text;
  v_next_service date;
  v_ext_id uuid;
  v_buffer_days integer := public.maintenance_buffer_days();
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT forklift_id, start_date, end_date, status
    INTO v_forklift_id, v_start_date, v_current_end, v_status
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_forklift_id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_status IN ('cancelled','completed') THEN
    RAISE EXCEPTION 'No se puede extender una reserva %', v_status;
  END IF;

  IF p_new_end_date IS NULL OR p_new_end_date <= v_current_end THEN
    RAISE EXCEPTION 'La nueva fecha final debe ser posterior a la actual (%).', v_current_end;
  END IF;

  -- R4-18: mismo chequeo de OT en curso que create_booking.
  IF EXISTS (
    SELECT 1 FROM maintenance_logs ml
    WHERE ml.forklift_id = v_forklift_id
      AND ml.work_status = 'in_progress'
      AND ml.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene una orden de trabajo en curso; no se puede extender la reserva'
      USING ERRCODE = 'check_violation';
  END IF;

  -- BL-A6 + N-36: mismos filtros que create_booking.
  SELECT ml.next_service_date INTO v_next_service
  FROM maintenance_logs ml
  WHERE ml.forklift_id = v_forklift_id
    AND ml.next_service_date IS NOT NULL
    AND ml.deleted_at IS NULL
    AND ml.work_status NOT IN ('scheduled', 'cancelled')
  ORDER BY ml.performed_at DESC
  LIMIT 1;

  IF v_next_service IS NOT NULL
     AND v_next_service <= (p_new_end_date + make_interval(days => v_buffer_days))::date
     AND v_next_service >= v_start_date THEN
    RAISE EXCEPTION 'La extensión invade la ventana de mantenimiento programado el % (buffer % días).', v_next_service, v_buffer_days;
  END IF;

  IF EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.forklift_id = v_forklift_id
      AND b.id <> p_booking_id
      AND b.status NOT IN ('cancelled','completed')
      AND daterange(b.start_date, b.end_date, '[]') && daterange(v_start_date, p_new_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'La extensión se traslapa con otra reserva del mismo montacargas.';
  END IF;

  UPDATE bookings
     SET end_date = p_new_end_date,
         updated_at = now()
   WHERE id = p_booking_id;

  INSERT INTO booking_extensions (booking_id, original_end_date, new_end_date, reason)
  VALUES (p_booking_id, v_current_end, p_new_end_date, p_reason)
  RETURNING id INTO v_ext_id;

  RETURN v_ext_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_available_forklifts(p_start_date date, p_end_date date)
 RETURNS SETOF forklifts
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_buffer interval := make_interval(days => public.maintenance_buffer_days());
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'auditor'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT f.*
  FROM public.forklifts f
  WHERE f.status IN ('available', 'rented')
    AND f.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.forklift_id = f.id
        AND b.status NOT IN ('completed', 'cancelled')
        AND b.start_date <= p_end_date
        AND b.end_date >= p_start_date
    )
    -- N-6: ocultar unidades con renta vencida sin devolucion registrada.
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.forklift_id = f.id
        AND b.status = 'confirmed'
        AND b.start_date <= public.today_mty()
        AND b.end_date < public.today_mty()
        AND b.return_status IS DISTINCT FROM 'returned'
        AND NOT EXISTS (
          SELECT 1 FROM public.deliveries r
          WHERE r.booking_id = b.id AND r.type = 'return' AND r.status = 'completed'
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
        FROM public.maintenance_logs ml
        WHERE ml.next_service_date IS NOT NULL
          AND ml.deleted_at IS NULL
          AND ml.work_status NOT IN ('scheduled', 'cancelled')
        ORDER BY ml.forklift_id, ml.performed_at DESC
      ) latest
      WHERE latest.forklift_id = f.id
        AND latest.next_service_date - v_buffer <= p_end_date
        AND latest.next_service_date + v_buffer >= p_start_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.maintenance_logs ml
      WHERE ml.forklift_id = f.id AND ml.work_status = 'in_progress'
        AND ml.deleted_at IS NULL
    )
  ORDER BY f.name;
END;
$function$;