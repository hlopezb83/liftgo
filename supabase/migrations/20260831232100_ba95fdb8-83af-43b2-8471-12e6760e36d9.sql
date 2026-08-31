-- R6 A3B-07: criterio unico de devolucion (booking_is_returned) en los 5
-- consumidores que aun usaban deliveries.type='return' (fila que la app nunca
-- genera; las devoluciones reales viven en return_inspections).

-- 1) sync_forklift_rental_status
CREATE OR REPLACE FUNCTION public.sync_forklift_rental_status()
 RETURNS TABLE(forklift_id uuid, previous_status text, new_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((select auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  RETURN QUERY
  WITH active AS (
    SELECT DISTINCT b.forklift_id AS fid
    FROM bookings b
    WHERE b.status = 'confirmed'
      AND b.start_date <= public.today_mty()
      AND (
        b.end_date >= public.today_mty()
        OR NOT public.booking_is_returned(b.id)
      )
  ),
  blocked AS (
    SELECT DISTINCT dr.forklift_id AS fid
      FROM public.damage_records dr
     WHERE dr.deleted_at IS NULL
       AND dr.status IN ('reported', 'in_repair')
    UNION
    SELECT DISTINCT ml.forklift_id
      FROM public.maintenance_logs ml
     WHERE ml.deleted_at IS NULL
       AND ml.work_status IN ('pending', 'in_progress')
  ),
  promote AS (
    UPDATE forklifts f
    SET status = 'rented', updated_at = now()
    FROM active a
    WHERE f.id = a.fid AND f.status = 'available'
    RETURNING f.id, 'available'::text AS prev, 'rented'::text AS newv
  ),
  demote AS (
    UPDATE forklifts f
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
  SELECT m.id, m.prev, m.newv FROM moved m
   WHERE (SELECT count(*) FROM logged) >= 0;

  PERFORM set_config('app.forklift_rpc', 'off', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

-- 2) cancel_booking
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_forklift uuid; v_status text; v_note text; v_released int := 0;
BEGIN
  IF NOT (
    has_role((select auth.uid()), 'admin'::app_role) OR
    has_role((select auth.uid()), 'administrativo'::app_role) OR
    has_role((select auth.uid()), 'dispatcher'::app_role)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT forklift_id, status INTO v_forklift, v_status
  FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_forklift IS NULL THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF v_status = 'cancelled' THEN RETURN; END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'No se puede cancelar una reserva completada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.deliveries
    WHERE booking_id = p_booking_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'La reserva tiene entregas completadas: la unidad está con el cliente. Registra la devolución (inspección de retorno) en lugar de cancelar la reserva.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices i
     WHERE (
       i.booking_id = p_booking_id
       OR EXISTS (
         SELECT 1 FROM public.invoice_bookings ib
          WHERE ib.invoice_id = i.id AND ib.booking_id = p_booking_id
       )
     )
       AND i.status NOT IN ('draft', 'cancelled')
       AND COALESCE(i.cancellation_status, '') <> 'accepted'
  ) THEN
    RAISE EXCEPTION 'La reserva tiene facturas emitidas vigentes. Cancela primero la factura (y su CFDI ante el SAT) antes de cancelar la reserva.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = p_booking_id;

  UPDATE deliveries SET status = 'cancelled', updated_at = now()
   WHERE booking_id = p_booking_id AND status IN ('pending','scheduled');

  PERFORM set_config('app.forklift_rpc', 'on', true);

  UPDATE forklifts
     SET status = 'available', updated_at = now()
   WHERE id = v_forklift AND status = 'rented'
     AND NOT EXISTS (
       SELECT 1 FROM bookings b
       WHERE b.forklift_id = v_forklift AND b.id <> p_booking_id
         AND b.status = 'confirmed'
         AND b.start_date <= public.today_mty()
         AND (
           b.end_date >= public.today_mty()
           OR NOT public.booking_is_returned(b.id)
         )
     );
  GET DIAGNOSTICS v_released = ROW_COUNT;

  PERFORM set_config('app.forklift_rpc', 'off', true);

  v_note := 'Reserva cancelada' ||
            CASE WHEN p_reason IS NOT NULL AND btrim(p_reason) <> ''
                 THEN ': ' || btrim(p_reason) ELSE '' END;

  IF v_released > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (v_forklift, 'rented', 'available', v_note, (select auth.uid()));
  END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

-- 3) v_booking_occupancy
CREATE OR REPLACE VIEW public.v_booking_occupancy AS
 SELECT id AS booking_id,
    forklift_id,
    status,
    is_e2e,
    GREATEST(start_date, COALESCE(( SELECT (min(d.completed_at))::date AS min
           FROM deliveries d
          WHERE ((d.booking_id = b.id) AND (d.type = 'delivery'::text) AND (d.status = 'completed'::text) AND (d.completed_at IS NOT NULL))), start_date)) AS occ_start,
    LEAST(today_mty(), COALESCE(( SELECT (max(ri.inspected_at))::date AS max
           FROM return_inspections ri
          WHERE (ri.booking_id = b.id)),
        CASE
            WHEN (b.return_status = 'returned'::text) THEN LEAST(end_date, today_mty())
            WHEN (status = 'completed'::text) THEN end_date
            ELSE today_mty()
        END)) AS occ_end
   FROM bookings b
  WHERE (status = ANY (ARRAY['confirmed'::text, 'completed'::text]));

-- 4a) create_booking (guard N-6)
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
  IF has_role((select auth.uid()), 'admin'::app_role) THEN NULL;
  ELSIF has_role((select auth.uid()), 'administrativo'::app_role) OR has_role((select auth.uid()), 'dispatcher'::app_role)
     OR has_role((select auth.uid()), 'ventas'::app_role) THEN
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
  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'El montacargas está archivado; restáuralo antes de reservarlo'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_current_status IN ('maintenance', 'out_of_service', 'retired', 'sold') THEN
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status USING ERRCODE = 'check_violation';
  END IF;
  -- N-6 (R6 A3B-07): criterio unico de devolucion.
  IF EXISTS (
    SELECT 1 FROM bookings b
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
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RETURN v_booking_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

-- 4b) get_available_forklifts (guard N-6)
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
    -- N-6 (R6 A3B-07): criterio unico de devolucion.
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.forklift_id = f.id
        AND b.status = 'confirmed'
        AND b.start_date <= public.today_mty()
        AND b.end_date < public.today_mty()
        AND NOT public.booking_is_returned(b.id)
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

-- 5) validate_transition (guard N-42, salida de 'rented')
CREATE OR REPLACE FUNCTION public.validate_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed text[];
  v_initial text[];
  v_due date;
  v_jwt_role text;
  v_has_payments boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_initial := CASE TG_TABLE_NAME
      WHEN 'invoices'       THEN ARRAY['draft','sent']
      WHEN 'quotes'         THEN ARRAY['draft','sent']
      WHEN 'bookings'       THEN ARRAY['confirmed']
      WHEN 'supplier_bills' THEN ARRAY['draft','pending']
      WHEN 'forklifts'      THEN ARRAY['available']
      ELSE ARRAY[]::text[]
    END;

    IF TG_TABLE_NAME = 'supplier_bills' AND NEW.status::text = 'overdue' THEN
      v_due := NULLIF(to_jsonb(NEW) ->> 'due_date', '')::date;
      IF v_due IS NOT NULL AND v_due < public.today_mty() THEN
        RETURN NEW;
      END IF;
    END IF;

    IF NOT (NEW.status::text = ANY(v_initial)) THEN
      RAISE EXCEPTION 'Estado inicial no permitido en %: %. Usa el flujo/RPC correspondiente.',
        TG_TABLE_NAME, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.audit_revert', true) = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  v_allowed := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','cancelled']
      WHEN 'sent'     THEN ARRAY['overdue','paid','cancelled']
      WHEN 'overdue'  THEN ARRAY['paid','cancelled']
      WHEN 'partial'  THEN ARRAY['overdue','paid','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'quotes' THEN CASE OLD.status::text
      WHEN 'draft'     THEN ARRAY['sent','rejected','expired']
      WHEN 'sent'      THEN ARRAY['accepted','rejected','expired']
      WHEN 'expired'   THEN ARRAY['draft']
      WHEN 'accepted'  THEN ARRAY['cancelled','converted']
      WHEN 'converted' THEN ARRAY['cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'bookings' THEN CASE OLD.status::text
      WHEN 'confirmed' THEN ARRAY['completed','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'supplier_bills' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['pending','cancelled']
      WHEN 'pending'  THEN ARRAY['partial','paid','overdue','cancelled']
      WHEN 'overdue'  THEN ARRAY['pending','partial','paid','cancelled']
      WHEN 'partial'  THEN ARRAY['pending','paid','overdue','cancelled']
      WHEN 'paid'     THEN ARRAY['pending','partial','overdue','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'forklifts' THEN CASE OLD.status::text
      WHEN 'available'      THEN ARRAY['rented','maintenance','out_of_service','retired','sold']
      WHEN 'rented'         THEN ARRAY['available','maintenance','out_of_service','retired','sold']
      WHEN 'maintenance'    THEN ARRAY['available','rented','out_of_service','retired','sold']
      WHEN 'out_of_service' THEN ARRAY['available','maintenance','retired','sold']
      WHEN 'retired'        THEN ARRAY['available']
      ELSE ARRAY[]::text[] END
    ELSE ARRAY[]::text[]
  END;

  IF TG_TABLE_NAME = 'supplier_bills'
     AND current_setting('app.cxp_recalc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'supplier_bills' AND OLD.status::text = 'paid' THEN
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
      SELECT EXISTS (SELECT 1 FROM public.supplier_payments sp WHERE sp.bill_id = OLD.id)
        INTO v_has_payments;
      IF v_has_payments THEN
        RAISE EXCEPTION 'La cuenta tiene pagos registrados; elimina o reversa los pagos primero.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- Fix 4.4 + N-42 (R6 A3B-07): criterio unico de devolucion.
  IF TG_TABLE_NAME = 'forklifts'
     AND OLD.status::text = 'rented'
     AND NEW.status::text IS DISTINCT FROM 'rented'
     AND current_setting('app.forklift_rpc', true) IS DISTINCT FROM 'on' THEN
    IF EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.deliveries d
        ON d.booking_id = b.id AND d.type = 'delivery' AND d.status = 'completed'
      WHERE b.forklift_id = OLD.id
        AND b.status = 'confirmed'
        AND NOT public.booking_is_returned(b.id)
    ) THEN
      RAISE EXCEPTION 'La unidad tiene una renta entregada sin devolución; completa la devolución antes de cambiar su estado'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'invoices'
     AND current_setting('app.payment_sync', true) = 'on'
     AND pg_trigger_depth() > 1
     AND OLD.status::text IN ('sent','partial','overdue','paid')
     AND NEW.status::text IN ('sent','partial','overdue','paid') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'invoices'
     AND OLD.status::text = 'paid'
     AND NEW.status::text = 'cancelled' THEN
    IF v_jwt_role = 'service_role'
       OR current_setting('app.sat_flow', true) IS NOT DISTINCT FROM 'on' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'forklifts'
     AND current_setting('app.forklift_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'quotes'
     AND OLD.status::text = 'converted'
     AND NEW.status::text = 'accepted'
     AND current_setting('app.quote_rebound', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida en %: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- 6) dominio explicito de deliveries.type. 'return' se conserva por datos
-- historicos pero YA NO es el mecanismo de devolucion (ver booking_is_returned).
ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_type_dominio;
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_type_dominio
  CHECK (type IN ('delivery','pickup','return'));

COMMENT ON COLUMN public.deliveries.type IS
  'delivery | pickup | return. type=return es legado: la devolucion real se determina con public.booking_is_returned(booking_id).';