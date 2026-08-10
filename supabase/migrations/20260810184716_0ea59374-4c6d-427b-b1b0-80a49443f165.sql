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
  -- GUI-DB-02: si la reserva viene de una cotización, esta debe estar aceptada.
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
  -- H11: mantenimiento programado que traslapa la ventana solicitada.
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
  -- H11: una OT en curso bloquea nuevas reservas.
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

CREATE OR REPLACE FUNCTION public.convert_quote_to_bookings(p_quote_id uuid, p_assignments jsonb, p_recurring boolean DEFAULT false)
 RETURNS TABLE(booking_id uuid, forklift_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_quote quotes%ROWTYPE; v_assignment jsonb; v_forklift_id uuid; v_model_id uuid;
  v_daily numeric; v_weekly numeric; v_monthly numeric; v_booking_id uuid; v_meta jsonb;
  v_slots jsonb; v_idx int;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'ventas'::app_role)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Solo se pueden convertir cotizaciones aceptadas (estado actual: %)', v_quote.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'La cotización ya fue convertida';
  END IF;
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < public.today_mty() THEN
    RAISE EXCEPTION 'Cotización vencida: actualiza precios y vigencia antes de convertir';
  END IF;
  IF jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignación';
  END IF;
  -- M7: expandir rental_meta a slots por unidad preservando el orden.
  SELECT COALESCE(jsonb_agg(elem ORDER BY ord, n), '[]'::jsonb)
    INTO v_slots
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(v_quote.rental_meta) = 'array'
              THEN v_quote.rental_meta ELSE '[]'::jsonb END
       ) WITH ORDINALITY AS t(elem, ord)
  CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE((t.elem->>'quantity')::int, 1), 1)) AS g(n);
  FOR v_assignment IN SELECT jsonb_array_elements(p_assignments) LOOP
    v_forklift_id := (v_assignment->>'forklift_id')::uuid;
    SELECT equipment_model_id INTO v_model_id FROM forklifts WHERE id = v_forklift_id;
    v_meta := NULL;
    IF v_model_id IS NOT NULL THEN
      SELECT s.elem, s.ord - 1 INTO v_meta, v_idx
        FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS s(elem, ord)
       WHERE (s.elem->>'modelId')::uuid = v_model_id
       ORDER BY s.ord
       LIMIT 1;
      IF v_meta IS NOT NULL THEN
        v_slots := v_slots - v_idx;
      END IF;
    END IF;
    IF v_meta IS NOT NULL THEN
      v_daily := COALESCE((v_meta->>'dailyRate')::numeric, 0);
      v_weekly := COALESCE((v_meta->>'weeklyRate')::numeric, 0);
      v_monthly := COALESCE((v_meta->>'monthlyRate')::numeric, 0);
    ELSE
      v_daily := COALESCE((v_assignment->>'daily_rate')::numeric, 0);
      v_weekly := COALESCE((v_assignment->>'weekly_rate')::numeric, 0);
      v_monthly := COALESCE((v_assignment->>'monthly_rate')::numeric, 0);
    END IF;
    v_booking_id := public.create_booking(
      v_forklift_id, v_quote.customer_id, v_quote.customer_name, NULL,
      v_quote.start_date, v_quote.end_date, p_recurring, p_quote_id
    );
    UPDATE public.bookings
       SET daily_rate = v_daily, weekly_rate = v_weekly, monthly_rate = v_monthly,
           currency = COALESCE(v_quote.currency, 'MXN'), tipo_cambio = COALESCE(v_quote.tipo_cambio, 1)
     WHERE id = v_booking_id;
    RETURN QUERY SELECT v_booking_id, v_forklift_id;
  END LOOP;
END;
$function$;