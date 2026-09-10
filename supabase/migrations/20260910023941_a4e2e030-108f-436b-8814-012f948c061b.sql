DROP TRIGGER IF EXISTS trg_sync_forklift_on_booking_insert ON public.bookings;
DROP FUNCTION IF EXISTS public.sync_forklift_on_booking_insert();

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

NOTIFY pgrst, 'reload schema';