CREATE OR REPLACE FUNCTION public.get_available_forklifts(p_start_date date, p_end_date date)
RETURNS SETOF public.forklifts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
       SELECT 1
         FROM public.bookings b
        WHERE b.forklift_id = f.id
          AND b.status NOT IN ('completed', 'cancelled')
          AND b.start_date <= p_end_date
          AND b.end_date >= p_start_date
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.bookings b
        WHERE b.forklift_id = f.id
          AND b.status = 'confirmed'
          AND b.start_date <= public.today_mty()
          AND b.end_date < public.today_mty()
          AND NOT public.booking_is_returned(b.id)
     )
     AND NOT EXISTS (
       SELECT 1
         FROM (
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
       SELECT 1
         FROM public.maintenance_logs ml
        WHERE ml.forklift_id = f.id
          AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
          AND ml.deleted_at IS NULL
     )
   ORDER BY f.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.extend_booking(
  p_booking_id uuid,
  p_new_end_date date,
  p_reason text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
    OR public.has_role((select auth.uid()), 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT forklift_id, start_date, end_date, status
    INTO v_forklift_id, v_start_date, v_current_end, v_status
    FROM public.bookings
   WHERE id = p_booking_id
   FOR UPDATE;
  IF v_forklift_id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;
  IF v_status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'No se puede extender una reserva %', v_status;
  END IF;
  IF p_new_end_date IS NULL OR p_new_end_date <= v_current_end THEN
    RAISE EXCEPTION 'La nueva fecha final debe ser posterior a la actual (%).', v_current_end;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.maintenance_logs ml
     WHERE ml.forklift_id = v_forklift_id
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
       AND ml.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene una orden de trabajo activa; no se puede extender la reserva'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT ml.next_service_date INTO v_next_service
    FROM public.maintenance_logs ml
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
    SELECT 1
      FROM public.bookings b
     WHERE b.forklift_id = v_forklift_id
       AND b.id <> p_booking_id
       AND b.status NOT IN ('cancelled', 'completed')
       AND daterange(b.start_date, b.end_date, '[]') && daterange(v_start_date, p_new_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'La extensión se traslapa con otra reserva del mismo montacargas.';
  END IF;

  UPDATE public.bookings
     SET end_date = p_new_end_date,
         updated_at = now()
   WHERE id = p_booking_id;
  INSERT INTO public.booking_extensions (booking_id, original_end_date, new_end_date, reason)
  VALUES (p_booking_id, v_current_end, p_new_end_date, p_reason)
  RETURNING id INTO v_ext_id;
  RETURN v_ext_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_return_inspection(
  p_booking_id uuid,
  p_forklift_id uuid,
  p_condition text DEFAULT 'good'::text,
  p_damage_notes text DEFAULT NULL::text,
  p_damage_cost numeric DEFAULT 0,
  p_hours_used numeric DEFAULT NULL::numeric,
  p_fuel_level text DEFAULT NULL::text,
  p_inspected_by text DEFAULT NULL::text,
  p_inspected_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  IF NOT (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
    OR public.has_role((select auth.uid()), 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF COALESCE(p_damage_cost, 0) < 0 THEN
    RAISE EXCEPTION 'El costo de daño no puede ser negativo.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_hours_used IS NOT NULL AND p_hours_used < 0 THEN
    RAISE EXCEPTION 'Las horas usadas no pueden ser negativas (%)', p_hours_used
      USING ERRCODE = 'check_violation';
  END IF;

  v_is_damaged_condition := p_condition IN ('damaged', 'minor_damage', 'major_damage', 'needs_repair');
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

NOTIFY pgrst, 'reload schema';