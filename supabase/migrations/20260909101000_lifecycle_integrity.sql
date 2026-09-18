-- Integridad de ciclo de vida: reservas, entregas, contratos y mantenimiento.
-- La reserva compromete calendario; sólo una entrega completada materializa
-- `forklifts.status = 'rented'`.

-- El trigger histórico promovía la unidad sólo por insertar una reserva cuya
-- fecha ya había iniciado. La creación vía RPC hacía la misma promoción.
DROP TRIGGER IF EXISTS trg_sync_forklift_on_booking_insert ON public.bookings;
DROP FUNCTION IF EXISTS public.sync_forklift_on_booking_insert();

-- El job histórico ejecutaba la misma promoción por fecha una vez al día.
-- Se elimina cualquier alias que siga apuntando a la función, y la función
-- queda segura aun si un operador o integración antigua la invoca a mano.
DO $unschedule_started_bookings$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
      FROM cron.job
     WHERE jobname = 'mark-started-bookings-rented-daily'
        OR command ILIKE '%mark_started_bookings_rented%'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END
$unschedule_started_bookings$;

CREATE OR REPLACE FUNCTION public.mark_started_bookings_rented()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  PERFORM set_config('app.forklift_rpc', 'on', true);

  WITH delivered AS (
    SELECT DISTINCT ON (b.forklift_id)
           b.forklift_id,
           b.booking_number
      FROM public.bookings b
     WHERE b.status = 'confirmed'
       AND NOT public.booking_is_returned(b.id)
       AND EXISTS (
         SELECT 1
           FROM public.deliveries d
          WHERE d.booking_id = b.id
            AND d.type = 'delivery'
            AND d.status = 'completed'
       )
     ORDER BY b.forklift_id, b.created_at, b.id
  ),
  moved AS (
    UPDATE public.forklifts f
       SET status = 'rented', updated_at = now()
      FROM delivered d
     WHERE f.id = d.forklift_id
       AND f.status = 'available'
    RETURNING f.id, d.booking_number
  ),
  logged AS (
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    SELECT m.id, 'available', 'rented',
           'Entrega completada de reserva ' || m.booking_number,
           (select auth.uid())
      FROM moved m
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM moved;

  PERFORM set_config('app.forklift_rpc', 'off', true);
  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_started_bookings_rented() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_started_bookings_rented() TO service_role;

-- El segundo cron de conciliación puede cerrar reservas vencidas, pero decide
-- el estado físico sólo a partir de entregas completadas, nunca por fechas.
CREATE OR REPLACE FUNCTION public.reconcile_expired_bookings()
RETURNS TABLE(closed_bookings integer, freed_forklifts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_is_cron boolean := ((select auth.uid()) IS NULL);
  v_closed integer := 0;
  v_freed integer := 0;
BEGIN
  IF NOT v_is_cron
     AND NOT public.has_role((select auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  WITH closable AS (
    SELECT b.id
      FROM public.bookings b
     WHERE b.status IN ('confirmed', 'active')
       AND b.end_date < public.today_mty()
       AND public.booking_is_returned(b.id)
  ),
  updated AS (
    UPDATE public.bookings b
       SET status = 'completed',
           recurring_billing = false,
           updated_at = now()
      FROM closable c
     WHERE b.id = c.id
    RETURNING b.id
  )
  SELECT count(*)::integer INTO v_closed FROM updated;

  WITH active AS (
    SELECT DISTINCT b.forklift_id AS fid
      FROM public.bookings b
     WHERE b.status = 'confirmed'
       AND NOT public.booking_is_returned(b.id)
       AND EXISTS (
         SELECT 1
           FROM public.deliveries d
          WHERE d.booking_id = b.id
            AND d.type = 'delivery'
            AND d.status = 'completed'
       )
  ),
  moved AS (
    UPDATE public.forklifts f
       SET status = CASE
             WHEN EXISTS (
               SELECT 1 FROM public.damage_records dr
                WHERE dr.forklift_id = f.id
                  AND dr.deleted_at IS NULL
                  AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL)
             ) OR EXISTS (
               SELECT 1 FROM public.maintenance_logs ml
                WHERE ml.forklift_id = f.id
                  AND ml.deleted_at IS NULL
                  AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
             ) THEN 'maintenance'
             ELSE 'available'
           END,
           updated_at = now()
     WHERE f.status = 'rented'
       AND NOT EXISTS (SELECT 1 FROM active a WHERE a.fid = f.id)
    RETURNING f.id
  )
  SELECT count(*)::integer INTO v_freed FROM moved;

  PERFORM set_config('app.forklift_rpc', 'off', true);
  RETURN QUERY SELECT v_closed, v_freed;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_expired_bookings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_expired_bookings() TO authenticated, service_role;

-- Definiciones completas y deterministas: no se reconstruye SQL desde el
-- catálogo. La creación compromete fechas, pero no cambia el estado físico.
CREATE OR REPLACE FUNCTION public.create_booking(
  p_forklift_id uuid,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_customer_name text DEFAULT NULL::text,
  p_customer_contact text DEFAULT NULL::text,
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date,
  p_recurring_billing boolean DEFAULT false,
  p_quote_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking_id uuid;
  v_booking_number text;
  v_current_status text;
  v_quote_status text;
  v_deleted_at timestamptz;
  v_buffer interval := make_interval(days => public.maintenance_buffer_days());
BEGIN
  IF public.has_role((select auth.uid()), 'admin'::app_role) THEN
    NULL;
  ELSIF public.has_role((select auth.uid()), 'administrativo'::app_role)
     OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
     OR public.has_role((select auth.uid()), 'ventas'::app_role) THEN
    IF p_quote_id IS NULL THEN
      RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_quote_id IS NOT NULL THEN
    SELECT status INTO v_quote_status
      FROM public.quotes
     WHERE id = p_quote_id;
    IF v_quote_status IS NULL THEN
      RAISE EXCEPTION 'Cotización no encontrada';
    END IF;
    IF v_quote_status <> 'accepted' THEN
      RAISE EXCEPTION 'La cotización debe estar aceptada por el cliente para crear la reserva (estado actual: %).', v_quote_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Fechas de reserva requeridas';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'La fecha final no puede ser anterior a la inicial';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El cliente seleccionado está archivado o no existe';
  END IF;

  SELECT status, deleted_at
    INTO v_current_status, v_deleted_at
    FROM public.forklifts
   WHERE id = p_forklift_id
   FOR UPDATE;
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Montacargas no encontrado';
  END IF;
  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'El montacargas está archivado; restáuralo antes de reservarlo'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_current_status IN ('maintenance', 'out_of_service', 'retired', 'sold') THEN
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.bookings b
     WHERE b.forklift_id = p_forklift_id
       AND b.status = 'confirmed'
       AND b.start_date <= public.today_mty()
       AND b.end_date < public.today_mty()
       AND NOT public.booking_is_returned(b.id)
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene una renta vencida sin devolución registrada; registra la inspección de retorno antes de reservar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.bookings b
     WHERE b.forklift_id = p_forklift_id
       AND b.status NOT IN ('cancelled', 'completed')
       AND daterange(b.start_date, b.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'El montacargas ya está reservado en ese rango de fechas'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (
        SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
          FROM public.maintenance_logs ml
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
    SELECT 1
      FROM public.maintenance_logs ml
     WHERE ml.forklift_id = p_forklift_id
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
       AND ml.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene una orden de trabajo activa; no se puede reservar'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bookings.booking_number'));
  v_booking_number := public.next_booking_number();
  PERFORM set_config('app.booking_rpc', 'on', true);
  INSERT INTO public.bookings (
    forklift_id, customer_id, customer_name, customer_contact,
    start_date, end_date, recurring_billing, status, booking_number, quote_id
  ) VALUES (
    p_forklift_id, p_customer_id, p_customer_name, p_customer_contact,
    p_start_date, p_end_date, p_recurring_billing, 'confirmed', v_booking_number, p_quote_id
  )
  RETURNING id INTO v_booking_id;
  PERFORM set_config('app.booking_rpc', 'off', true);
  RETURN v_booking_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.booking_rpc', 'off', true);
  RAISE;
END;
$function$;

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

-- La devolución libera la unidad según rentas realmente entregadas. Se
-- excluye explícitamente la reserva que se está cerrando para que una lectura
-- estable nunca la conserve artificialmente como rented.
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

-- Cancelar o eliminar una reserva sólo libera una unidad si no queda otra
-- renta con entrega completada. Este trigger nunca promueve por calendario.
CREATE OR REPLACE FUNCTION public.sync_forklift_on_booking_exit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_forklift uuid;
  v_released integer := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
      v_forklift := OLD.forklift_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'confirmed' THEN
    v_forklift := OLD.forklift_id;
  END IF;

  IF v_forklift IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts f
     SET status = 'available', updated_at = now()
   WHERE f.id = v_forklift
     AND f.status = 'rented'
     AND NOT EXISTS (
       SELECT 1
         FROM public.bookings b
         JOIN public.deliveries d
           ON d.booking_id = b.id
          AND d.type = 'delivery'
          AND d.status = 'completed'
        WHERE b.forklift_id = v_forklift
          AND b.id IS DISTINCT FROM OLD.id
          AND b.status = 'confirmed'
          AND NOT public.booking_is_returned(b.id)
     );
  GET DIAGNOSTICS v_released = ROW_COUNT;
  PERFORM set_config('app.forklift_rpc', 'off', true);

  IF v_released > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (
      v_forklift,
      'rented',
      'available',
      'Reserva ' || COALESCE(OLD.booking_number, OLD.id::text)
        || CASE WHEN TG_OP = 'DELETE' THEN ' eliminada' ELSE ' cancelada' END
        || ': unidad liberada',
      (select auth.uid())
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_forklift_on_booking_exit() FROM PUBLIC, anon, authenticated;

-- La RPC de cancelación comparte el mismo criterio de liberación. Mantiene el
-- orden de locks reserva -> entregas -> unidad que usa complete_delivery().
CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_forklift uuid;
  v_status text;
  v_note text;
  v_released integer := 0;
BEGIN
  IF NOT (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT forklift_id, status
    INTO v_forklift, v_status
    FROM public.bookings
   WHERE id = p_booking_id
   FOR UPDATE;
  IF v_forklift IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'No se puede cancelar una reserva completada';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.deliveries
     WHERE booking_id = p_booking_id
       AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'La reserva tiene entregas completadas: la unidad está con el cliente. Registra la devolución (inspección de retorno) en lugar de cancelar la reserva.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.invoices i
     WHERE (
       i.booking_id = p_booking_id
       OR EXISTS (
         SELECT 1
           FROM public.invoice_bookings ib
          WHERE ib.invoice_id = i.id
            AND ib.booking_id = p_booking_id
       )
     )
       AND i.status NOT IN ('draft', 'cancelled')
       AND COALESCE(i.cancellation_status, '') <> 'accepted'
  ) THEN
    RAISE EXCEPTION 'La reserva tiene facturas emitidas vigentes. Cancela primero la factura (y su CFDI ante el SAT) antes de cancelar la reserva.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled', updated_at = now()
   WHERE id = p_booking_id;
  UPDATE public.deliveries
     SET status = 'cancelled', updated_at = now()
   WHERE booking_id = p_booking_id
     AND status IN ('pending', 'scheduled');

  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts f
     SET status = 'available', updated_at = now()
   WHERE f.id = v_forklift
     AND f.status = 'rented'
     AND NOT EXISTS (
       SELECT 1
         FROM public.bookings b
         JOIN public.deliveries d
           ON d.booking_id = b.id
          AND d.type = 'delivery'
          AND d.status = 'completed'
        WHERE b.forklift_id = v_forklift
          AND b.id <> p_booking_id
          AND b.status = 'confirmed'
          AND NOT public.booking_is_returned(b.id)
     );
  GET DIAGNOSTICS v_released = ROW_COUNT;
  PERFORM set_config('app.forklift_rpc', 'off', true);

  v_note := 'Reserva cancelada'
    || CASE
         WHEN p_reason IS NOT NULL AND btrim(p_reason) <> ''
         THEN ': ' || btrim(p_reason)
         ELSE ''
       END;
  IF v_released > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (v_forklift, 'rented', 'available', v_note, (select auth.uid()));
  END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

-- Defensa en profundidad: ninguna ruta (incluido change_forklift_status) puede
-- materializar rented sin una entrega completada y aún no devuelta.
CREATE OR REPLACE FUNCTION public.guard_forklift_rented_requires_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'rented'
     AND OLD.status IS DISTINCT FROM 'rented'
     AND current_setting('app.delivery_completed_effect', true) IS DISTINCT FROM 'on'
     AND NOT public.has_open_rental(NEW.id) THEN
    RAISE EXCEPTION 'Una unidad sólo puede marcarse rentada al completar su entrega al cliente.'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'forklift_rented_requires_completed_delivery';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_forklift_rented_requires_delivery() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_forklift_rented_requires_delivery ON public.forklifts;
CREATE TRIGGER trg_forklift_rented_requires_delivery
  BEFORE UPDATE OF status ON public.forklifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_forklift_rented_requires_delivery();

-- Una venta no puede consumir una unidad comprometida por ninguna reserva
-- confirmada pendiente de devolución, incluida una reserva futura.
CREATE OR REPLACE FUNCTION public.guard_forklift_sale_commitments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold'
     AND EXISTS (
       SELECT 1
         FROM public.bookings b
        WHERE b.forklift_id = NEW.id
          AND b.status = 'confirmed'
          AND NOT public.booking_is_returned(b.id)
     ) THEN
    RAISE EXCEPTION 'La unidad tiene una reserva confirmada pendiente; cancélala o completa su devolución antes de venderla.'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'forklift_sale_without_booking_commitments';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_forklift_sale_commitments() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_forklift_sale_commitments ON public.forklifts;
CREATE TRIGGER trg_forklift_sale_commitments
  BEFORE UPDATE OF status ON public.forklifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_forklift_sale_commitments();

-- Fuente canónica y paginada para la UI de asignación de ventas. Mantiene el
-- mismo compromiso que el trigger anterior: una reserva confirmed sin
-- devolución, aunque empiece en el futuro, excluye la unidad.
CREATE OR REPLACE FUNCTION public.get_sale_available_forklifts(
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.forklifts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
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

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'p_limit debe estar entre 1 y 500' USING ERRCODE = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'p_offset no puede ser negativo' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT f.*
    FROM public.forklifts f
   WHERE f.status = 'available'
     AND f.deleted_at IS NULL
     AND COALESCE(f.is_e2e, false) = false
     AND NOT EXISTS (
       SELECT 1
         FROM public.bookings b
        WHERE b.forklift_id = f.id
          AND b.status = 'confirmed'
          AND NOT public.booking_is_returned(b.id)
     )
   ORDER BY f.name, f.id
   LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sale_available_forklifts(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sale_available_forklifts(integer, integer) TO authenticated, service_role;

-- El sincronizador de reparación sólo reconcilia entregas reales; las fechas de
-- una reserva nunca promueven por sí solas una unidad a rented.
CREATE OR REPLACE FUNCTION public.sync_forklift_rental_status()
RETURNS TABLE(forklift_id uuid, previous_status text, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  RETURN QUERY
  WITH active AS (
    SELECT DISTINCT b.forklift_id AS fid
      FROM public.bookings b
     WHERE b.status = 'confirmed'
       AND NOT public.booking_is_returned(b.id)
       AND EXISTS (
         SELECT 1
           FROM public.deliveries d
          WHERE d.booking_id = b.id
            AND d.type = 'delivery'
            AND d.status = 'completed'
       )
  ),
  blocked AS (
    SELECT DISTINCT dr.forklift_id AS fid
      FROM public.damage_records dr
     WHERE dr.deleted_at IS NULL
       AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL)
    UNION
    SELECT DISTINCT ml.forklift_id
      FROM public.maintenance_logs ml
     WHERE ml.deleted_at IS NULL
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
  ),
  promote AS (
    UPDATE public.forklifts f
       SET status = 'rented', updated_at = now()
      FROM active a
     WHERE f.id = a.fid
       AND f.status = 'available'
    RETURNING f.id, 'available'::text AS prev, 'rented'::text AS newv
  ),
  demote AS (
    UPDATE public.forklifts f
       SET status = 'available', updated_at = now()
     WHERE f.status = 'rented'
       AND NOT EXISTS (SELECT 1 FROM active a WHERE a.fid = f.id)
       AND NOT EXISTS (SELECT 1 FROM blocked bl WHERE bl.fid = f.id)
    RETURNING f.id, 'rented'::text AS prev, 'available'::text AS newv
  ),
  moved AS (
    SELECT id, prev, newv FROM promote
    UNION ALL
    SELECT id, prev, newv FROM demote
  ),
  logged AS (
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    SELECT m.id, m.prev, m.newv, 'Sincronización de estatus de renta', (select auth.uid())
      FROM moved m
    RETURNING 1
  )
  SELECT m.id, m.prev, m.newv
    FROM moved m
   WHERE (SELECT count(*) FROM logged) >= 0;

  PERFORM set_config('app.forklift_rpc', 'off', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_forklift_rental_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_forklift_rental_status() TO authenticated, service_role;

-- Máquina terminal para entregas: una fila completed o cancelled no revive.
CREATE OR REPLACE FUNCTION public.guard_delivery_completed_terminal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_allowed text[];
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE OLD.status
    WHEN 'pending' THEN ARRAY['scheduled', 'completed', 'cancelled']
    WHEN 'scheduled' THEN ARRAY['completed', 'cancelled']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transición de entrega no permitida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'deliveries_status_transition';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_delivery_completed_terminal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_delivery_completed_terminal ON public.deliveries;
CREATE TRIGGER trg_guard_delivery_completed_terminal
  BEFORE UPDATE OF status ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_completed_terminal();

-- Valida la reserva y bloquea la unidad antes de aceptar la transición. Esto
-- protege también escrituras directas antiguas; la UI usa complete_delivery().
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

  -- Una recolección residual puede reprogramarse/completarse después de cerrar
  -- la reserva. La excepción no aplica a la entrega de salida.
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

-- Efecto único de una entrega completada. El UPDATE condicional ya no puede
-- terminar silenciosamente con cero filas.
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

-- Frontera transaccional usada por la UI. El orden reserva -> entrega -> unidad
-- coincide con cancel_booking y evita la carrera cancelar/completar.
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

-- Whitelist contractual efectiva también para administradores. El rol decide
-- quién puede ejecutar transiciones sensibles, no inventa nuevas aristas.
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

-- Al liberar una unidad después de reparar/archivar un daño, una reserva
-- confirmada sólo restaura `rented` si ya tuvo una entrega completada y sigue
-- sin devolución. Una OT abierta conserva precedencia sobre la renta.
CREATE OR REPLACE FUNCTION public.damage_restore_forklift_status(
  p_forklift_id uuid,
  p_previous text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.maintenance_logs ml
     WHERE ml.forklift_id = p_forklift_id
       AND ml.deleted_at IS NULL
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
  ) THEN
    RETURN 'maintenance';
  END IF;

  IF p_previous = 'rented' AND public.has_open_rental(p_forklift_id) THEN
    RETURN 'rented';
  END IF;

  RETURN 'available';
END;
$function$;

REVOKE ALL ON FUNCTION public.damage_restore_forklift_status(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.damage_restore_forklift_status(uuid, text)
  TO authenticated, service_role;

-- waiting_parts conserva el mismo bloqueo operativo que in_progress. Además,
-- una restauración vuelve a evaluar una OT abierta aunque work_status no cambie.
CREATE OR REPLACE FUNCTION public.sync_forklift_status_on_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_forklift_status text;
  v_has_open_rental boolean := false;
  v_open_damages integer;
  v_open_work_orders integer;
  v_effective_status text;
  v_archived boolean := false;
  v_restored boolean := false;
  v_verb text;
  v_target text;
BEGIN
  IF NEW.forklift_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL THEN
    v_archived := true;
  ELSIF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NOT NULL
     AND NEW.deleted_at IS NULL THEN
    v_restored := true;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NOT v_archived
     AND NOT v_restored
     AND OLD.work_status IS NOT DISTINCT FROM NEW.work_status THEN
    RETURN NEW;
  END IF;

  IF NOT v_archived AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Una OT restaurada vuelve a aplicar el mismo predicado canónico de OT
  -- abierta; sólo las cerradas/programadas se ignoran.
  IF v_restored AND NEW.work_status NOT IN ('pending', 'in_progress', 'waiting_parts') THEN
    RETURN NEW;
  END IF;

  v_effective_status := CASE WHEN v_archived THEN 'cancelled' ELSE NEW.work_status END;

  SELECT status INTO v_forklift_status
    FROM public.forklifts
   WHERE id = NEW.forklift_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_has_open_rental := public.has_open_rental(NEW.forklift_id);

  IF v_effective_status IN ('pending', 'in_progress', 'waiting_parts')
     AND (
       v_forklift_status = 'available'
       OR (v_forklift_status = 'rented' AND NOT v_has_open_rental)
     ) THEN
    UPDATE public.forklifts
       SET status = 'maintenance', updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (
      NEW.forklift_id,
      v_forklift_status,
      'maintenance',
      CASE WHEN v_restored
        THEN 'OT ' || COALESCE(NEW.service_type, 'servicio') || ' restaurada en ' || NEW.work_status
        ELSE 'OT ' || COALESCE(NEW.service_type, 'servicio') || ' en ' || NEW.work_status
      END,
      (select auth.uid())
    );
  ELSIF v_effective_status IN ('completed', 'cancelled')
     AND v_forklift_status = 'maintenance' THEN
    v_verb := CASE
      WHEN v_archived THEN 'archivada'
      WHEN NEW.work_status = 'completed' THEN 'completada'
      ELSE 'cancelada'
    END;

    SELECT count(*) INTO v_open_damages
      FROM public.damage_records dr
     WHERE dr.forklift_id = NEW.forklift_id
       AND dr.deleted_at IS NULL
       AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL);
    IF v_open_damages > 0 THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
      VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
              'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb ||
              ': la unidad permanece en mantenimiento por ' || v_open_damages || ' daño(s) abierto(s)',
              (select auth.uid()));
      RETURN NEW;
    END IF;

    SELECT count(*) INTO v_open_work_orders
      FROM public.maintenance_logs ml
     WHERE ml.forklift_id = NEW.forklift_id
       AND ml.deleted_at IS NULL
       AND ml.id <> NEW.id
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts');
    IF v_open_work_orders > 0 THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
      VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
              'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb ||
              ': la unidad permanece en mantenimiento por ' || v_open_work_orders || ' OT(s) abierta(s)',
              (select auth.uid()));
      RETURN NEW;
    END IF;

    v_target := CASE WHEN v_has_open_rental THEN 'rented' ELSE 'available' END;
    UPDATE public.forklifts
       SET status = v_target, updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (NEW.forklift_id, v_forklift_status, v_target,
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb,
            (select auth.uid()));
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_forklift_status_on_maintenance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_forklift_on_maintenance ON public.maintenance_logs;
CREATE TRIGGER trg_sync_forklift_on_maintenance
  AFTER INSERT OR UPDATE OF work_status, deleted_at ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_forklift_status_on_maintenance();

-- Reconciliación única para no dejar datos históricos fuera de las nuevas
-- invariantes al terminar la migración.
DO $reconcile_existing_lifecycle$
BEGIN
  PERFORM set_config('app.forklift_rpc', 'on', true);

  WITH moved AS (
    UPDATE public.forklifts f
       SET status = 'maintenance', updated_at = now()
     WHERE f.status = 'available'
       AND f.deleted_at IS NULL
       AND (
         EXISTS (
           SELECT 1
             FROM public.maintenance_logs ml
            WHERE ml.forklift_id = f.id
              AND ml.deleted_at IS NULL
              AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
         )
         OR EXISTS (
           SELECT 1
             FROM public.damage_records dr
            WHERE dr.forklift_id = f.id
              AND dr.deleted_at IS NULL
              AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL)
         )
       )
    RETURNING f.id
  )
  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
  SELECT id, 'available', 'maintenance',
         'Reconciliación: OT o daño físico pendiente'
    FROM moved;

  WITH targets AS (
    SELECT f.id,
           CASE
             WHEN EXISTS (
               SELECT 1
                 FROM public.damage_records dr
                WHERE dr.forklift_id = f.id
                  AND dr.deleted_at IS NULL
                  AND (dr.status IN ('reported', 'in_repair') OR dr.repaired_at IS NULL)
             ) OR EXISTS (
               SELECT 1
                 FROM public.maintenance_logs ml
                WHERE ml.forklift_id = f.id
                  AND ml.deleted_at IS NULL
                  AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
             ) THEN 'maintenance'
             ELSE 'available'
           END AS target_status
      FROM public.forklifts f
     WHERE f.status = 'rented'
       AND f.deleted_at IS NULL
       AND NOT public.has_open_rental(f.id)
  ),
  moved AS (
    UPDATE public.forklifts f
       SET status = t.target_status, updated_at = now()
      FROM targets t
     WHERE f.id = t.id
    RETURNING f.id, t.target_status
  )
  INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
  SELECT id, 'rented', target_status,
         'Reconciliación: no existe entrega completada pendiente de devolución'
    FROM moved;

  PERFORM set_config('app.forklift_rpc', 'off', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END
$reconcile_existing_lifecycle$;
