-- R10 Bloque 10.3: excluir montacargas archivados de las alertas de seguros.
CREATE OR REPLACE FUNCTION public.get_insurance_alerts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH base AS (
    SELECT id, name, insurance_expiry, insurance_provider,
      CASE WHEN insurance_expiry IS NOT NULL THEN (insurance_expiry - CURRENT_DATE)::int ELSE NULL END AS days_left
    FROM public.forklifts
    WHERE status NOT IN ('sold','retired')
      AND deleted_at IS NULL
  ),
  expiring AS (
    SELECT id, name, insurance_expiry, insurance_provider, days_left FROM base
    WHERE insurance_expiry IS NOT NULL AND days_left <= 30 ORDER BY days_left ASC
  ),
  no_ins AS (SELECT count(*)::int AS c FROM base WHERE insurance_expiry IS NULL)
  SELECT jsonb_build_object(
    'expiring', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'insurance_expiry', insurance_expiry,
      'insurance_provider', insurance_provider, 'days_left', days_left
    )) FROM expiring), '[]'::jsonb),
    'no_insurance_count', (SELECT c FROM no_ins)
  ) INTO result;
  RETURN result;
END;
$$;

-- R10 Bloque 12.9: create_booking valida que el cliente no esté archivado.
CREATE OR REPLACE FUNCTION public.create_booking(
  p_forklift_id uuid, p_customer_id uuid DEFAULT NULL::uuid,
  p_customer_name text DEFAULT NULL::text, p_customer_contact text DEFAULT NULL::text,
  p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date,
  p_recurring_billing boolean DEFAULT false, p_quote_id uuid DEFAULT NULL::uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking_id uuid;
  v_booking_number text;
  v_current_status text;
  v_starts_today boolean;
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    NULL;
  ELSIF has_role(auth.uid(), 'administrativo'::app_role)
     OR has_role(auth.uid(), 'dispatcher'::app_role)
     OR has_role(auth.uid(), 'ventas'::app_role) THEN
    IF p_quote_id IS NULL THEN
      RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM quotes WHERE id = p_quote_id) THEN
      RAISE EXCEPTION 'Cotización no encontrada';
    END IF;
  ELSE
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Fechas de reserva requeridas';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'La fecha final no puede ser anterior a la inicial';
  END IF;

  -- R10 Bloque 12.9: cliente no archivado (customer_id opcional para "Público en General").
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El cliente seleccionado está archivado o no existe';
  END IF;

  SELECT status INTO v_current_status FROM forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Montacargas no encontrado';
  END IF;
  IF v_current_status IN ('maintenance', 'out_of_service') THEN
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bookings.booking_number'));
  v_booking_number := next_booking_number();

  INSERT INTO bookings (forklift_id, customer_id, customer_name, customer_contact, start_date, end_date, recurring_billing, status, booking_number, quote_id)
  VALUES (p_forklift_id, p_customer_id, p_customer_name, p_customer_contact, p_start_date, p_end_date, p_recurring_billing, 'confirmed', v_booking_number, p_quote_id)
  RETURNING id INTO v_booking_id;

  v_starts_today := p_start_date <= CURRENT_DATE;
  IF v_starts_today AND v_current_status = 'available' THEN
    UPDATE forklifts SET status = 'rented', updated_at = now() WHERE id = p_forklift_id;
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (p_forklift_id, 'available', 'rented', 'Reserva ' || v_booking_number || ' creada');
  END IF;

  RETURN v_booking_id;
END;
$$;

-- R10 Bloque 9.2: al cancelar una reserva, cancelar entregas pending/scheduled.
-- Añadimos hook al RPC cancel_booking preservando su lógica actual.
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_forklift uuid;
  v_status text;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT forklift_id, status INTO v_forklift, v_status
  FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_forklift IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;
  IF v_status = 'cancelled' THEN RETURN; END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'No se puede cancelar una reserva completada';
  END IF;

  UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = p_booking_id;

  -- R10 Bloque 9.2: entregas asociadas aún no completadas → cancelled.
  UPDATE deliveries
     SET status = 'cancelled', updated_at = now()
   WHERE booking_id = p_booking_id
     AND status IN ('pending', 'scheduled');

  -- Devolver el equipo a 'available' si no hay otra renta activa hoy.
  IF NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE forklift_id = v_forklift
      AND id <> p_booking_id
      AND status = 'confirmed'
      AND start_date <= CURRENT_DATE
      AND end_date >= CURRENT_DATE
  ) THEN
    UPDATE forklifts
       SET status = 'available', updated_at = now()
     WHERE id = v_forklift AND status = 'rented';
  END IF;
END;
$$;
