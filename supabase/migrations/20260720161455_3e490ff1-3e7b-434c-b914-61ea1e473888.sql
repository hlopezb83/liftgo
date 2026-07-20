-- BL-A3 (v7.120.0): create_booking ya no exige status='available' ni marca la
-- unidad como 'rented' cuando la reserva es futura. La exclusion constraint
-- `no_overlapping_bookings` cubre el traslape; el status del montacargas es un
-- estado operativo derivado de "hay reserva activa hoy" y solo se actualiza en
-- eventos reales (entrega/devolución/mantenimiento). Reservar la próxima
-- semana una unidad rentada hoy queda permitido; unidades en mantenimiento u
-- out_of_service siguen bloqueadas.
CREATE OR REPLACE FUNCTION public.create_booking(
  p_forklift_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_contact text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_recurring_billing boolean DEFAULT false,
  p_quote_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Lock de la fila del montacargas: cierra la ventana entre check y update.
  SELECT status INTO v_current_status
  FROM forklifts
  WHERE id = p_forklift_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Montacargas no encontrado';
  END IF;

  -- Solo bloqueamos estados operativos incompatibles. La disponibilidad por
  -- fechas la garantiza la exclusion constraint `no_overlapping_bookings`.
  IF v_current_status IN ('maintenance', 'out_of_service') THEN
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bookings.booking_number'));
  v_booking_number := next_booking_number();

  -- Si el rango solapa, la exclusion constraint dispara `exclusion_violation`
  -- (SQLSTATE 23P01) y se propaga como error controlado al cliente.
  INSERT INTO bookings (forklift_id, customer_id, customer_name, customer_contact, start_date, end_date, recurring_billing, status, booking_number, quote_id)
  VALUES (p_forklift_id, p_customer_id, p_customer_name, p_customer_contact, p_start_date, p_end_date, p_recurring_billing, 'confirmed', v_booking_number, p_quote_id)
  RETURNING id INTO v_booking_id;

  v_starts_today := p_start_date <= CURRENT_DATE;

  -- Solo actualiza el estado operativo cuando la reserva arranca hoy o antes.
  -- Las reservas futuras no bloquean la unidad hasta que se materialicen.
  IF v_starts_today AND v_current_status = 'available' THEN
    UPDATE forklifts SET status = 'rented', updated_at = now() WHERE id = p_forklift_id;
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (p_forklift_id, 'available', 'rented', 'Reserva ' || v_booking_number || ' creada');
  END IF;

  RETURN v_booking_id;
END;
$function$;

-- BL-M2 (v7.120.0): convert_quote_to_bookings deja de confiar en las tarifas
-- del payload cliente. Se resuelven server-side desde `quotes.rental_meta`
-- (RentalLineMeta[]) matcheando por `equipment_model_id` del forklift. Si el
-- meta no está disponible (cotización legacy), cae al valor del payload como
-- fallback compatible.
CREATE OR REPLACE FUNCTION public.convert_quote_to_bookings(p_quote_id uuid, p_assignments jsonb, p_recurring boolean DEFAULT false)
 RETURNS TABLE(booking_id uuid, forklift_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote quotes%ROWTYPE;
  v_assignment jsonb;
  v_forklift_id uuid;
  v_model_id uuid;
  v_daily numeric;
  v_weekly numeric;
  v_monthly numeric;
  v_booking_id uuid;
  v_meta jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;

  IF v_quote.status = 'accepted' THEN
    RAISE EXCEPTION 'La cotización ya fue convertida';
  END IF;

  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cotización vencida: actualiza precios y vigencia antes de convertir';
  END IF;

  IF jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignación';
  END IF;

  FOR v_assignment IN SELECT jsonb_array_elements(p_assignments)
  LOOP
    v_forklift_id := (v_assignment->>'forklift_id')::uuid;

    SELECT equipment_model_id INTO v_model_id
      FROM forklifts WHERE id = v_forklift_id;

    -- Resolver tarifas desde rental_meta (fuente de verdad) matcheando por modelId.
    v_meta := NULL;
    IF v_model_id IS NOT NULL AND jsonb_typeof(v_quote.rental_meta) = 'array' THEN
      SELECT elem INTO v_meta
      FROM jsonb_array_elements(v_quote.rental_meta) AS elem
      WHERE (elem->>'modelId')::uuid = v_model_id
      LIMIT 1;
    END IF;

    IF v_meta IS NOT NULL THEN
      v_daily   := COALESCE((v_meta->>'dailyRate')::numeric, 0);
      v_weekly  := COALESCE((v_meta->>'weeklyRate')::numeric, 0);
      v_monthly := COALESCE((v_meta->>'monthlyRate')::numeric, 0);
    ELSE
      -- Fallback para cotizaciones legacy sin rental_meta.
      v_daily   := COALESCE((v_assignment->>'daily_rate')::numeric, 0);
      v_weekly  := COALESCE((v_assignment->>'weekly_rate')::numeric, 0);
      v_monthly := COALESCE((v_assignment->>'monthly_rate')::numeric, 0);
    END IF;

    v_booking_id := public.create_booking(
      v_forklift_id,
      v_quote.customer_id,
      v_quote.customer_name,
      NULL,
      v_quote.start_date,
      v_quote.end_date,
      p_recurring,
      p_quote_id
    );

    UPDATE bookings
       SET daily_rate   = NULLIF(v_daily,   0),
           weekly_rate  = NULLIF(v_weekly,  0),
           monthly_rate = NULLIF(v_monthly, 0)
     WHERE id = v_booking_id;

    booking_id := v_booking_id;
    forklift_id := v_forklift_id;
    RETURN NEXT;
  END LOOP;

  UPDATE quotes SET status = 'accepted' WHERE id = p_quote_id;
END;
$function$;