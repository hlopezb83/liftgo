-- FIX N-6: renta vencida sin devolucion registrada bloquea/oculta la unidad.
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
  -- N-6: renta vencida sin devolucion registrada bloquea nuevas reservas.
  IF EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.forklift_id = p_forklift_id
      AND b.status = 'confirmed'
      AND b.start_date <= public.today_mty()
      AND b.end_date < public.today_mty()
      AND b.return_status IS DISTINCT FROM 'returned'
      AND NOT EXISTS (
        SELECT 1 FROM public.deliveries r
        WHERE r.booking_id = b.id AND r.type = 'return' AND r.status = 'completed'
      )
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
      AND latest.next_service_date - INTERVAL '3 days' <= p_end_date
      AND latest.next_service_date + INTERVAL '3 days' >= p_start_date
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene mantenimiento programado dentro de la ventana solicitada (buffer de 3 días alrededor del próximo servicio)'
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
  RETURN v_booking_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_available_forklifts(p_start_date date, p_end_date date)
RETURNS SETOF forklifts
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
    -- N-6: ocultar unidades con renta vencida sin devolucion registrada.
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.forklift_id = f.id
        AND b.status = 'confirmed'
        AND b.start_date <= public.today_mty()
        AND b.end_date < public.today_mty()
        AND b.return_status IS DISTINCT FROM 'returned'
        AND NOT EXISTS (
          SELECT 1 FROM public.deliveries r
          WHERE r.booking_id = b.id AND r.type = 'return' AND r.status = 'completed'
        )
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
        AND latest.next_service_date - INTERVAL '3 days' <= p_end_date
        AND latest.next_service_date + INTERVAL '3 days' >= p_start_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.maintenance_logs ml
      WHERE ml.forklift_id = f.id AND ml.work_status = 'in_progress'
        AND ml.deleted_at IS NULL
    )
  ORDER BY f.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_available_forklifts(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_forklifts(date, date) TO authenticated, service_role;

-- FIX N-41: "renta fisicamente activa" incluye vencidas sin devolucion.
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_forklift uuid; v_status text; v_note text; v_released int := 0;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role)
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

  UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = p_booking_id;

  UPDATE deliveries SET status = 'cancelled', updated_at = now()
   WHERE booking_id = p_booking_id AND status IN ('pending','scheduled');

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
           OR (
             -- N-41: renta vencida sin devolucion registrada sigue activa.
             b.return_status IS DISTINCT FROM 'returned'
             AND NOT EXISTS (
               SELECT 1 FROM public.deliveries r
               WHERE r.booking_id = b.id AND r.type = 'return' AND r.status = 'completed'
             )
           )
         )
     );
  GET DIAGNOSTICS v_released = ROW_COUNT;

  v_note := 'Reserva cancelada' ||
            CASE WHEN p_reason IS NOT NULL AND btrim(p_reason) <> ''
                 THEN ': ' || btrim(p_reason) ELSE '' END;

  IF v_released > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (v_forklift, 'rented', 'available', v_note, auth.uid());
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_forklift_on_booking_exit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_forklift uuid;
  v_released int := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
      v_forklift := OLD.forklift_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' THEN
      v_forklift := OLD.forklift_id;
    END IF;
  END IF;

  IF v_forklift IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  UPDATE public.forklifts
     SET status = 'available', updated_at = now()
   WHERE id = v_forklift
     AND status = 'rented'
     AND NOT EXISTS (
       SELECT 1 FROM public.bookings b
       WHERE b.forklift_id = v_forklift
         AND b.id IS DISTINCT FROM OLD.id
         AND b.status = 'confirmed'
         AND b.start_date <= public.today_mty()
         AND (
           b.end_date >= public.today_mty()
           OR (
             -- N-41: renta vencida sin devolucion registrada sigue activa.
             b.return_status IS DISTINCT FROM 'returned'
             AND NOT EXISTS (
               SELECT 1 FROM public.deliveries r
               WHERE r.booking_id = b.id AND r.type = 'return' AND r.status = 'completed'
             )
           )
         )
     );
  GET DIAGNOSTICS v_released = ROW_COUNT;

  IF v_released > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (v_forklift, 'rented', 'available',
            'Reserva ' || COALESCE(OLD.booking_number, OLD.id::text) ||
            CASE WHEN TG_OP = 'DELETE' THEN ' eliminada' ELSE ' cancelada' END ||
            ': unidad liberada',
            auth.uid());
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_forklift_rental_status()
RETURNS TABLE(forklift_id uuid, previous_status text, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH active AS (
    -- N-41: incluye rentas vencidas sin devolucion: no degradar a 'available'.
    SELECT DISTINCT b.forklift_id AS fid
    FROM bookings b
    WHERE b.status = 'confirmed'
      AND b.start_date <= public.today_mty()
      AND (
        b.end_date >= public.today_mty()
        OR (
          b.return_status IS DISTINCT FROM 'returned'
          AND NOT EXISTS (
            SELECT 1 FROM public.deliveries r
            WHERE r.booking_id = b.id AND r.type = 'return' AND r.status = 'completed'
          )
        )
      )
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
    RETURNING f.id, 'rented'::text AS prev, 'available'::text AS newv
  )
  SELECT id, prev, newv FROM promote
  UNION ALL
  SELECT id, prev, newv FROM demote;
END;
$function$;

-- FIX N-42: cualquier salida de 'rented' requiere devolucion registrada.
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

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  v_allowed := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','cancelled']
      WHEN 'sent'     THEN ARRAY['overdue','paid','cancelled']
      WHEN 'overdue'  THEN ARRAY['paid','cancelled']
      WHEN 'partial'  THEN ARRAY['overdue','cancelled']
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

  -- FIX N-3: recalc_supplier_bill fija app.cxp_recalc='on' para poder mover
  -- la bill (p.ej. salir de 'paid') al borrar/reversar pagos.
  IF TG_TABLE_NAME = 'supplier_bills'
     AND current_setting('app.cxp_recalc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Fix 4.3: salir de 'paid' en CxP requiere service_role o cero pagos ligados.
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

  -- Fix 4.4 + N-42: NINGUNA salida de 'rented' es valida si hay renta
  -- entregada sin devolucion. El flujo interno (app.forklift_rpc = 'on')
  -- queda exento para permitir la liberacion legitima tras la inspeccion.
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
        AND NOT EXISTS (
          SELECT 1 FROM public.deliveries r
          WHERE r.booking_id = b.id AND r.type = 'return' AND r.status = 'completed'
        )
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

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida en %: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- FIX N-38: devolucion serializada; liberar solo si sigue 'rented'.
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
  v_updated int := 0;
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
    FROM bookings WHERE id = p_booking_id;
  IF v_booking_start IS NULL THEN RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0001'; END IF;
  IF v_booking_forklift_id IS DISTINCT FROM p_forklift_id THEN
    RAISE EXCEPTION 'La reserva % no corresponde al montacargas % (la reserva es de la unidad %). Verifica la unidad antes de completar la devolucion.',
      p_booking_id, p_forklift_id, v_booking_forklift_id
      USING ERRCODE = 'check_violation';
  END IF;
  -- Baja-11a: solo se devuelve una reserva vigente.
  IF v_booking_status <> 'confirmed' THEN
    RAISE EXCEPTION 'Solo se puede registrar la devolución de una reserva confirmada (estado actual: %).', v_booking_status
      USING ERRCODE = 'check_violation';
  END IF;
  -- Baja-11b: no se puede devolver una unidad que nunca se entregó.
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
  IF p_inspected_at > (now() + interval '30 days') THEN
    RAISE EXCEPTION 'La fecha de inspección no puede estar más de 30 días en el futuro.' USING ERRCODE = 'P0001';
  END IF;

  -- Fix 8.5: cargo sugerido por horas extra según el contrato de la reserva.
  SELECT c.max_hours_per_month, c.extra_hour_rate
    INTO v_max_hours, v_extra_rate
    FROM public.contracts c
   WHERE c.booking_id = p_booking_id
     AND COALESCE(c.status, '') <> 'cancelled'
   ORDER BY c.created_at DESC
   LIMIT 1;

  IF p_hours_used IS NOT NULL AND COALESCE(v_max_hours, 0) > 0 AND COALESCE(v_extra_rate, 0) > 0 THEN
    v_months := GREATEST(
      1,
      CEIL(((COALESCE(v_booking_end, p_inspected_at::date) - v_booking_start) + 1)::numeric / 30)
    );
    v_allowed := v_max_hours * v_months;
    IF p_hours_used > v_allowed THEN
      v_extra_hours := ROUND(p_hours_used - v_allowed, 2);
      v_extra_charge := ROUND(v_extra_hours * v_extra_rate, 2);
    END IF;
  END IF;

  -- N-38: bloquear la fila del montacargas para serializar devoluciones.
  SELECT status INTO v_old_status FROM forklifts WHERE id = p_forklift_id FOR UPDATE;
  SELECT customer_id INTO v_customer_id FROM bookings WHERE id = p_booking_id;
  INSERT INTO return_inspections (booking_id, forklift_id, condition, damage_notes, damage_cost, hours_used, fuel_level, inspected_by, inspected_at, extra_hours, suggested_extra_hour_charge)
  VALUES (p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost, p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at, v_extra_hours, v_extra_charge)
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
  v_new_status := CASE WHEN v_sends_to_maintenance THEN 'maintenance' ELSE 'available' END;
  PERFORM set_config('app.forklift_rpc', 'on', true);
  -- N-38: solo liberar si la unidad sigue 'rented'; no pisar otros estados.
  UPDATE forklifts SET status = v_new_status, updated_at = now()
   WHERE id = p_forklift_id AND status = 'rented';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  -- N-38: status_log solo si el UPDATE realmente afecto filas.
  IF v_updated > 0 THEN
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (p_forklift_id, 'rented', v_new_status, 'Returned — condition: ' || p_condition);
  END IF;
  RETURN v_inspection_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_return_inspection(uuid, uuid, text, text, numeric, numeric, text, text, timestamptz) FROM anon;

-- FIX N-39: promover a 'rented' solo desde 'available'; log con estado real.
CREATE OR REPLACE FUNCTION public.apply_delivery_completed_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
  v_from_status text;
BEGIN
  IF NEW.status <> 'completed' OR NEW.type <> 'delivery' OR NEW.forklift_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);
  -- N-39: capturar el estado real antes de promover.
  SELECT status INTO v_from_status
  FROM public.forklifts
  WHERE id = NEW.forklift_id
  FOR UPDATE;

  -- N-39: solo promover desde 'available'.
  UPDATE public.forklifts
     SET status = 'rented'
   WHERE id = NEW.forklift_id
     AND status = 'available';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('app.forklift_rpc', 'off', true);

  IF v_rows > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, v_from_status, 'rented',
            'Entrega completada ' || COALESCE(NEW.delivery_number, NEW.id::text));
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_delivery_completed_effects() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_delivery_completed_effects ON public.deliveries;
CREATE TRIGGER trg_delivery_completed_effects
AFTER INSERT OR UPDATE OF status ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.apply_delivery_completed_effects();