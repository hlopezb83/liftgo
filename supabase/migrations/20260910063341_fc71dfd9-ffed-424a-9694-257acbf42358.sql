CREATE OR REPLACE FUNCTION public.complete_return_inspection(p_booking_id uuid, p_forklift_id uuid, p_condition text DEFAULT 'good'::text, p_damage_notes text DEFAULT NULL::text, p_damage_cost numeric DEFAULT 0, p_hours_used numeric DEFAULT NULL::numeric, p_fuel_level text DEFAULT NULL::text, p_inspected_by text DEFAULT NULL::text, p_inspected_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
    OR public.has_role((select auth.uid()), 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
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
       AND type = 'delivery'
       AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'No hay una entrega completada para esta reserva; completa primero la entrega al cliente.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_inspected_at::date < v_booking_start THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser anterior al inicio de la reserva (%).', v_booking_start
      USING ERRCODE = 'P0001';
  END IF;
  IF p_inspected_at > now() THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser futura.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Bloque 3A: reconciliación del horómetro. Cuando existen lecturas válidas y
  -- completadas de entrega y recolección, el consumo se calcula con ellas
  -- (última lectura por fecha completada/programada, desempate por created_at, id).
  SELECT d.hours_reading INTO v_delivery_hours
    FROM public.deliveries d
   WHERE d.booking_id = p_booking_id
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
     AND COALESCE(c.status, '') <> 'cancelled'
   ORDER BY c.created_at DESC
   LIMIT 1;

  IF p_hours_used IS NOT NULL
     AND COALESCE(v_max_hours, 0) > 0
     AND COALESCE(v_extra_rate, 0) > 0 THEN
    v_span_end := COALESCE(v_booking_end, p_inspected_at::date);
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

  IF v_booking_end IS NOT NULL AND p_inspected_at::date > v_booking_end THEN
    v_late_days := (p_inspected_at::date - v_booking_end)::numeric;
    SELECT b.daily_rate, b.monthly_rate
      INTO v_daily_rate, v_monthly_rate
      FROM public.bookings b
     WHERE b.id = p_booking_id;
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
   FOR UPDATE;
  SELECT customer_id INTO v_customer_id
    FROM public.bookings
   WHERE id = p_booking_id;
  IF p_fuel_level IS NULL OR btrim(p_fuel_level) = '' THEN
    RAISE EXCEPTION 'El nivel de combustible es obligatorio en la inspección de devolución'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.return_inspections (
    booking_id, forklift_id, condition, damage_notes, damage_cost,
    hours_used, fuel_level, inspected_by, inspected_at,
    extra_hours, suggested_extra_hour_charge, late_days, suggested_late_charge
  ) VALUES (
    p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost,
    p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at,
    v_extra_hours, v_extra_charge, v_late_days, v_late_charge
  )
  RETURNING id INTO v_inspection_id;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
     SET return_status = 'returned', status = 'completed', updated_at = now()
   WHERE id = p_booking_id;

  IF v_is_damaged_condition THEN
    INSERT INTO public.damage_records (
      inspection_id, forklift_id, booking_id, customer_id, description,
      estimated_cost, status, previous_forklift_status
    ) VALUES (
      v_inspection_id, p_forklift_id, p_booking_id, v_customer_id,
      COALESCE(NULLIF(btrim(p_damage_notes), ''), 'Daño reportado en devolución'),
      COALESCE(p_damage_cost, 0), 'reported', v_old_status
    );
  END IF;

  IF NOT v_sends_to_maintenance THEN
    SELECT count(*) INTO v_open_damages
      FROM public.damage_records
     WHERE forklift_id = p_forklift_id
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
         WHERE b.forklift_id = p_forklift_id
           AND b.id <> p_booking_id
           AND b.status = 'confirmed'
           AND NOT public.booking_is_returned(b.id)
      ) THEN 'rented'
      ELSE 'available'
    END;
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE public.forklifts
       SET status = v_new_status, updated_at = now()
     WHERE id = p_forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (
      p_forklift_id, v_old_status, v_new_status,
      'Returned — condition: ' || p_condition
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

-- Bloque 3B: apagar la facturación recurrente también al completar la reserva.
CREATE OR REPLACE FUNCTION public.clear_recurring_billing_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'completed')
     AND COALESCE(OLD.status, '') NOT IN ('cancelled', 'completed') THEN
    NEW.recurring_billing := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_clear_recurring_on_cancel ON public.bookings;
CREATE TRIGGER trg_bookings_clear_recurring_on_cancel
BEFORE UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.clear_recurring_billing_on_cancel();