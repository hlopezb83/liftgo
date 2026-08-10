-- H11: create_booking valida ventana de mantenimiento (next_service_date ±3 días)
-- y OT en curso, con la MISMA regla que get_available_forklifts / extend_booking.
-- Basado en la versión vigente (20260730135422). Se agrega public.today_mty()
-- en vez de CURRENT_DATE para v_starts_today (paridad con el resto de RPCs).
CREATE OR REPLACE FUNCTION public.create_booking(p_forklift_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_contact text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_recurring_billing boolean DEFAULT false, p_quote_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id uuid; v_booking_number text; v_current_status text; v_starts_today boolean;
  v_quote_status text;
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN NULL;
  ELSIF has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)
     OR has_role(auth.uid(), 'ventas'::app_role) THEN
    IF p_quote_id IS NULL THEN
      RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
    END IF;
  ELSE RAISE EXCEPTION 'Forbidden';
  END IF;
  -- GUI-DB-02: si la reserva viene de una cotización, esta debe estar aceptada
  -- por el cliente (mismo criterio que convert_quote_to_bookings).
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
  SELECT status INTO v_current_status FROM forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_current_status IS NULL THEN RAISE EXCEPTION 'Montacargas no encontrado'; END IF;
  IF v_current_status IN ('maintenance', 'out_of_service', 'retired', 'sold') THEN
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM bookings WHERE forklift_id = p_forklift_id
      AND status NOT IN ('cancelled','completed')
      AND daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'El montacargas ya está reservado en ese rango de fechas' USING ERRCODE = 'check_violation';
  END IF;
  -- H11: mantenimiento programado que traslapa la ventana solicitada
  -- (buffer de 3 días alrededor del next_service_date) — misma regla que
  -- get_available_forklifts (20260723060102).
  IF EXISTS (
    SELECT 1 FROM (
      SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
      FROM maintenance_logs ml
      WHERE ml.next_service_date IS NOT NULL
      ORDER BY ml.forklift_id, ml.performed_at DESC
    ) latest
    WHERE latest.forklift_id = p_forklift_id
      AND latest.next_service_date - INTERVAL '3 days' <= p_end_date
      AND latest.next_service_date + INTERVAL '3 days' >= p_start_date
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene mantenimiento programado dentro de la ventana solicitada (buffer de 3 días alrededor del próximo servicio)'
      USING ERRCODE = 'check_violation';
  END IF;
  -- H11: una OT en curso bloquea nuevas reservas — misma regla que
  -- get_available_forklifts / extend_booking.
  IF EXISTS (
    SELECT 1 FROM maintenance_logs ml
    WHERE ml.forklift_id = p_forklift_id AND ml.work_status = 'in_progress'
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
  RETURN v_booking_id;
END;
$function$;
