-- A3B-03: la inspección de devolución no puede registrarse con fecha futura.
-- Residual (b): create_recurring_invoice ya no aplica el default 'G03'.
-- Se reescriben ambas funciones completas (prohibido pg_get_functiondef+replace).

CREATE OR REPLACE FUNCTION public.complete_return_inspection(p_booking_id uuid, p_forklift_id uuid, p_condition text DEFAULT 'good'::text, p_damage_notes text DEFAULT NULL::text, p_damage_cost numeric DEFAULT 0, p_hours_used numeric DEFAULT NULL::numeric, p_fuel_level text DEFAULT NULL::text, p_inspected_by text DEFAULT NULL::text, p_inspected_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inspection_id uuid; v_old_status text; v_new_status text;
  v_customer_id uuid; v_is_damaged_condition boolean; v_sends_to_maintenance boolean;
  v_booking_start date; v_existing_id uuid; v_booking_forklift_id uuid;
  v_booking_status text;
  v_open_damages int;
  v_booking_end date;
  v_max_hours numeric; v_extra_rate numeric;
  v_months numeric; v_allowed numeric;
  v_extra_hours numeric; v_extra_charge numeric;
  v_span_end date; v_full_months int; v_anchor date;
  v_rem_days int; v_days_in_month int;
  v_late_days numeric; v_late_charge numeric;
  v_daily_rate numeric; v_monthly_rate numeric;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)
       OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'mechanic'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF COALESCE(p_damage_cost, 0) < 0 THEN
    RAISE EXCEPTION 'El costo de daño no puede ser negativo.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_hours_used IS NOT NULL AND p_hours_used < 0 THEN
    RAISE EXCEPTION 'Las horas usadas no pueden ser negativas (%)', p_hours_used
      USING ERRCODE = 'check_violation';
  END IF;
  v_is_damaged_condition := p_condition IN ('damaged', 'minor_damage', 'major_damage', 'needs_repair');
  v_sends_to_maintenance := v_is_damaged_condition;
  IF v_is_damaged_condition AND COALESCE(p_damage_cost, 0) <= 0
     AND (p_damage_notes IS NULL OR btrim(p_damage_notes) = '') THEN
    RAISE EXCEPTION 'La devolución marcada como % requiere costo estimado (>0) o una descripción del daño.', p_condition
      USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO v_existing_id FROM return_inspections WHERE booking_id = p_booking_id LIMIT 1;
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
    FROM bookings WHERE id = p_booking_id
    FOR UPDATE;
  IF v_booking_start IS NULL THEN RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0001'; END IF;
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
    SELECT 1 FROM public.deliveries
    WHERE booking_id = p_booking_id AND type = 'delivery' AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'No hay una entrega completada para esta reserva; completa primero la entrega al cliente.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_inspected_at::date < v_booking_start THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser anterior al inicio de la reserva (%).', v_booking_start
      USING ERRCODE = 'P0001';
  END IF;
  -- A3B-03: una devolución sólo puede registrarse cuando ya ocurrió. Antes se
  -- aceptaban fechas hasta 30 días en el futuro (mismo criterio que el form).
  IF p_inspected_at > now() THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser futura.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.max_hours_per_month, c.extra_hour_rate
    INTO v_max_hours, v_extra_rate
    FROM public.contracts c
   WHERE c.booking_id = p_booking_id
     AND COALESCE(c.status, '') <> 'cancelled'
   ORDER BY c.created_at DESC
   LIMIT 1;

  IF p_hours_used IS NOT NULL AND COALESCE(v_max_hours, 0) > 0 AND COALESCE(v_extra_rate, 0) > 0 THEN
    -- N-12: meses calendario anclados al día de inicio + remanente
    -- fraccionario prorrateado sobre los días reales del mes ancla.
    v_span_end := COALESCE(v_booking_end, p_inspected_at::date);
    v_full_months := EXTRACT(YEAR FROM age(v_span_end, v_booking_start))::int * 12
                   + EXTRACT(MONTH FROM age(v_span_end, v_booking_start))::int;
    v_anchor := (v_booking_start + make_interval(months => v_full_months))::date;
    IF v_anchor > v_span_end THEN
      v_full_months := GREATEST(v_full_months - 1, 0);
      v_anchor := (v_booking_start + make_interval(months => v_full_months))::date;
    END IF;
    v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', v_anchor) + interval '1 month - 1 day')::date)::int;
    v_rem_days := GREATEST(v_span_end - v_anchor + 1, 0);
    v_months := GREATEST(1, v_full_months + v_rem_days::numeric / v_days_in_month);
    v_allowed := v_max_hours * v_months;
    IF p_hours_used > v_allowed THEN
      v_extra_hours := ROUND(p_hours_used - v_allowed, 2);
      v_extra_charge := ROUND(v_extra_hours * v_extra_rate, 2);
    END IF;
  END IF;

  -- N-13: devolución tardía (mismo patrón informativo que extra_hours).
  IF v_booking_end IS NOT NULL AND p_inspected_at::date > v_booking_end THEN
    v_late_days := (p_inspected_at::date - v_booking_end)::numeric;
    SELECT b.daily_rate, b.monthly_rate
      INTO v_daily_rate, v_monthly_rate
      FROM public.bookings b
     WHERE b.id = p_booking_id;
    IF COALESCE(v_daily_rate, 0) <= 0 AND COALESCE(v_monthly_rate, 0) > 0 THEN
      v_daily_rate := v_monthly_rate
        / EXTRACT(DAY FROM (date_trunc('month', v_booking_end) + interval '1 month - 1 day')::date);
    END IF;
    IF COALESCE(v_daily_rate, 0) > 0 THEN
      v_late_charge := ROUND(v_late_days * v_daily_rate, 2);
    END IF;
  END IF;

  SELECT status INTO v_old_status FROM forklifts WHERE id = p_forklift_id FOR UPDATE;
  SELECT customer_id INTO v_customer_id FROM bookings WHERE id = p_booking_id;
  IF p_fuel_level IS NULL OR btrim(p_fuel_level) = '' THEN
    RAISE EXCEPTION 'El nivel de combustible es obligatorio en la inspección de devolución'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO return_inspections (booking_id, forklift_id, condition, damage_notes, damage_cost, hours_used, fuel_level, inspected_by, inspected_at, extra_hours, suggested_extra_hour_charge, late_days, suggested_late_charge)
  VALUES (p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost, p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at, v_extra_hours, v_extra_charge, v_late_days, v_late_charge)
  RETURNING id INTO v_inspection_id;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE bookings SET return_status = 'returned', status = 'completed', updated_at = now() WHERE id = p_booking_id;
  IF v_is_damaged_condition THEN
    INSERT INTO damage_records (inspection_id, forklift_id, booking_id, customer_id, description, estimated_cost, status, previous_forklift_status)
    VALUES (v_inspection_id, p_forklift_id, p_booking_id, v_customer_id,
      COALESCE(NULLIF(btrim(p_damage_notes), ''), 'Daño reportado en devolución'),
      COALESCE(p_damage_cost, 0), 'reported', v_old_status);
  END IF;
  IF NOT v_sends_to_maintenance THEN
    SELECT COUNT(*) INTO v_open_damages
      FROM public.damage_records
     WHERE forklift_id = p_forklift_id
       AND deleted_at IS NULL
       AND status IN ('reported', 'in_repair');
    IF v_open_damages > 0 THEN
      v_sends_to_maintenance := true;
    END IF;
  END IF;
  IF v_old_status = 'rented' THEN
    v_new_status := CASE
      WHEN v_sends_to_maintenance THEN 'maintenance'
      WHEN EXISTS (
        SELECT 1 FROM bookings b
         WHERE b.forklift_id = p_forklift_id
           AND b.id <> p_booking_id
           AND b.status = 'confirmed'
           AND b.start_date <= public.today_mty()
           AND (b.end_date IS NULL OR b.end_date >= public.today_mty())
      ) THEN 'rented'
      ELSE 'available' END;
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE forklifts SET status = v_new_status, updated_at = now() WHERE id = p_forklift_id;
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (p_forklift_id, v_old_status, v_new_status, 'Returned — condition: ' || p_condition);
  END IF;
  -- R6-17: reset de los bypass al salir (camino feliz).
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RETURN v_inspection_id;
EXCEPTION WHEN OTHERS THEN
  -- R6-17: reset de los bypass en excepcion.
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_recurring_invoice(p_booking_ids uuid[], p_customer_id uuid, p_customer_name text, p_line_items jsonb, p_subtotal numeric, p_tax_rate numeric, p_tax_amount numeric, p_total numeric, p_billing_period_start date, p_billing_period_end date, p_receptor_rfc text, p_receptor_razon_social text, p_receptor_regimen_fiscal text, p_receptor_domicilio_fiscal_cp text, p_uso_cfdi text, p_moneda text DEFAULT 'MXN'::text, p_tipo_cambio numeric DEFAULT 1)
 RETURNS TABLE(invoice_id uuid, invoice_number text, already_existed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_existing_id uuid;
  v_existing_number text;
  v_lock_key bigint;
  v_bid uuid;
  v_is_single boolean := array_length(p_booking_ids, 1) = 1;
  v_moneda text := COALESCE(NULLIF(upper(btrim(p_moneda)), ''), 'MXN');
  v_tipo_cambio numeric;
  v_uso_cfdi text := NULLIF(btrim(p_uso_cfdi), '');
BEGIN
  -- FIX C-1: solo admin/administrativo via JWT de usuario. service_role
  -- (cron generate-recurring-invoices) sigue permitido.
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo')) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_booking_ids requerido';
  END IF;

  -- Residual (b): el default 'G03' emitia CFDI con uso incompatible con
  -- ciertos regimenes (p. ej. 616). El uso de CFDI debe venir del cliente.
  IF v_uso_cfdi IS NULL THEN
    RAISE EXCEPTION 'El cliente no tiene uso de CFDI capturado; captúralo antes de generar la factura recurrente.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A1-1: MXN siempre 1; divisa exige TC > 0 (nada de 1:1 silencioso).
  IF v_moneda = 'MXN' THEN
    v_tipo_cambio := 1;
  ELSE
    v_tipo_cambio := NULLIF(p_tipo_cambio, 0);
    IF v_tipo_cambio IS NULL OR v_tipo_cambio <= 0 THEN
      RAISE EXCEPTION 'Tipo de cambio requerido para facturar en % (moneda distinta de MXN)', v_moneda
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  FOR v_bid IN
    SELECT unnest(p_booking_ids) ORDER BY 1
  LOOP
    v_lock_key := ('x' || substr(md5(v_bid::text), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  SELECT i.id, i.invoice_number
    INTO v_existing_id, v_existing_number
  FROM public.invoice_bookings ib
  JOIN public.invoices i ON i.id = ib.invoice_id
  WHERE ib.booking_id = ANY(p_booking_ids)
    AND i.billing_period_start = p_billing_period_start
    AND i.billing_period_end = p_billing_period_end
    AND i.status <> 'cancelled'
    AND (i.cfdi_status IS NULL OR i.cfdi_status <> 'cancelled')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.bookings
       SET last_billed_date = p_billing_period_end
     WHERE id = ANY(p_booking_ids);
    invoice_id := v_existing_id;
    invoice_number := v_existing_number;
    already_existed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT public.next_draft_invoice_number() INTO v_invoice_number;
  IF v_invoice_number IS NULL THEN
    v_invoice_number := 'FAC-AUTO-' || extract(epoch FROM now())::bigint::text;
  END IF;

  BEGIN
    INSERT INTO public.invoices (
      invoice_number, booking_id, customer_id, customer_name, line_items,
      subtotal, tax_rate, tax_amount, total, status, due_date,
      billing_period_start, billing_period_end,
      receptor_rfc, receptor_razon_social, receptor_regimen_fiscal,
      receptor_domicilio_fiscal_cp, uso_cfdi,
      forma_pago, metodo_pago, moneda, tipo_cambio
    ) VALUES (
      v_invoice_number,
      CASE WHEN v_is_single THEN p_booking_ids[1] ELSE NULL END,
      p_customer_id, p_customer_name, p_line_items,
      p_subtotal, p_tax_rate, p_tax_amount, p_total, 'draft', p_billing_period_end,
      p_billing_period_start, p_billing_period_end,
      p_receptor_rfc, p_receptor_razon_social, p_receptor_regimen_fiscal,
      p_receptor_domicilio_fiscal_cp, v_uso_cfdi,
      '99', 'PPD', v_moneda, v_tipo_cambio
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_bookings (invoice_id, booking_id)
    SELECT v_invoice_id, unnest(p_booking_ids);
  EXCEPTION WHEN unique_violation THEN
    SELECT i.id, i.invoice_number
      INTO v_existing_id, v_existing_number
    FROM public.invoice_bookings ib
    JOIN public.invoices i ON i.id = ib.invoice_id
    WHERE ib.booking_id = ANY(p_booking_ids)
      AND i.billing_period_start = p_billing_period_start
      AND i.billing_period_end = p_billing_period_end
      AND i.status <> 'cancelled'
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      SELECT i.id, i.invoice_number
        INTO v_existing_id, v_existing_number
      FROM public.invoices i
      WHERE i.booking_id = ANY(p_booking_ids)
        AND i.billing_period_start = p_billing_period_start
        AND i.billing_period_end = p_billing_period_end
        AND i.status <> 'cancelled'
      LIMIT 1;
    END IF;

    IF v_existing_id IS NULL THEN
      RAISE;
    END IF;

    UPDATE public.bookings
       SET last_billed_date = p_billing_period_end
     WHERE id = ANY(p_booking_ids);

    invoice_id := v_existing_id;
    invoice_number := v_existing_number;
    already_existed := true;
    RETURN NEXT;
    RETURN;
  END;

  UPDATE public.bookings
     SET last_billed_date = p_billing_period_end
   WHERE id = ANY(p_booking_ids);

  invoice_id := v_invoice_id;
  invoice_number := v_invoice_number;
  already_existed := false;
  RETURN NEXT;
END;
$function$;