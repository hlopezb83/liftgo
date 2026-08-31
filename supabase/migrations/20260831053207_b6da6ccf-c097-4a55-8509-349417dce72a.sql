-- A4B-04: OTs archivadas no deben contar como abiertas
CREATE OR REPLACE FUNCTION public.audit_fleet_status_consistency()
 RETURNS TABLE(forklift_id uuid, forklift_name text, status_actual text, status_esperado text, motivo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    has_role((select auth.uid()), 'admin'::app_role)
    OR has_role((select auth.uid()), 'auditor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH calc AS (
    SELECT
      f.id,
      f.name,
      f.status,
      EXISTS (
        SELECT 1 FROM public.maintenance_logs ml
         WHERE ml.forklift_id = f.id
           AND ml.deleted_at IS NULL
           AND ml.work_status IN ('pending', 'in_progress')
      ) AS has_open_ot,
      EXISTS (
        SELECT 1 FROM public.damage_records dr
         WHERE dr.forklift_id = f.id
           AND dr.deleted_at IS NULL
           AND dr.status IN ('reported', 'in_repair')
      ) AS has_open_damage,
      EXISTS (
        SELECT 1 FROM public.bookings b
         WHERE b.forklift_id = f.id
           AND b.status = 'confirmed'
           AND public.today_mty() BETWEEN b.start_date AND b.end_date
      ) AS has_active_booking
    FROM public.forklifts f
    WHERE f.deleted_at IS NULL
  ),
  evaluada AS (
    SELECT
      c.*,
      CASE
        WHEN c.has_open_ot OR c.has_open_damage THEN 'maintenance'
        WHEN c.has_active_booking THEN 'rented'
        ELSE 'available'
      END AS esperado,
      concat_ws('; ',
        CASE WHEN c.has_open_ot THEN 'tiene OT abierta (pending/in_progress)' END,
        CASE WHEN c.has_open_damage THEN 'tiene daño abierto (reported/in_repair)' END,
        CASE WHEN c.has_active_booking THEN 'tiene reserva confirmada activa hoy' END,
        CASE WHEN NOT c.has_open_ot AND NOT c.has_open_damage AND NOT c.has_active_booking
             THEN 'sin OT, daño ni reserva activa' END
      ) AS motivo
    FROM calc c
  )
  SELECT
    e.id,
    e.name,
    e.status,
    e.esperado,
    e.motivo
  FROM evaluada e
  WHERE e.status IN ('available', 'rented', 'maintenance')
    AND e.status IS DISTINCT FROM e.esperado
  ORDER BY e.name;
END;
$function$;

-- A4B-04 (2/2): el guard trataba OTs archivadas como bitácora abierta
CREATE OR REPLACE FUNCTION public.guard_forklift_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_confirmed int;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF current_setting('app.forklift_rpc', true) = 'on' THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_confirmed
    FROM public.bookings WHERE forklift_id = NEW.id AND status = 'confirmed';

  IF OLD.status = 'rented'
     AND NEW.status IN ('maintenance','available','sold','retired','out_of_service')
     AND public.has_open_rental(NEW.id) THEN
    RAISE EXCEPTION 'La unidad tiene una renta activa; completa la devolución antes de venderla o darla de baja'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'rented' AND OLD.status IS DISTINCT FROM 'rented' AND v_confirmed = 0 THEN
    RAISE EXCEPTION 'No se puede marcar rentado sin una renta activa' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('maintenance','sold','retired') AND OLD.status IS DISTINCT FROM NEW.status
     AND current_setting('app.forklift_rpc', true) IS DISTINCT FROM 'on'
     AND NOT EXISTS (
       SELECT 1 FROM public.maintenance_logs
        WHERE forklift_id = NEW.id
          AND deleted_at IS NULL
          AND work_status NOT IN ('completed','cancelled','closed','done')
     ) THEN
    RAISE EXCEPTION 'Cambio a % solo via change_forklift_status (con razon) o con bitacora de mantenimiento abierta', NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- A4B-06: no permitir reservar un montacargas archivado
CREATE OR REPLACE FUNCTION public.create_booking(p_forklift_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_contact text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_recurring_billing boolean DEFAULT false, p_quote_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id uuid; v_booking_number text; v_current_status text; v_starts_today boolean;
  v_quote_status text; v_deleted_at timestamptz;
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
  SELECT status, deleted_at INTO v_current_status, v_deleted_at
    FROM forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_current_status IS NULL THEN RAISE EXCEPTION 'Montacargas no encontrado'; END IF;
  -- A4B-06: una unidad archivada no puede recibir reservas nuevas.
  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'El montacargas está archivado; restáuralo antes de reservarlo'
      USING ERRCODE = 'check_violation';
  END IF;
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
  -- R6-17: reset de los bypass al salir (camino feliz).
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RETURN v_booking_id;
EXCEPTION WHEN OTHERS THEN
  -- R6-17: reset de los bypass en excepcion.
  PERFORM set_config('app.booking_rpc', 'off', true);
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

-- A3B-02: cerrar/archivar una OT de una unidad con renta activa la dejaba en 'maintenance'
CREATE OR REPLACE FUNCTION public.sync_forklift_status_on_maintenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_forklift_status  text;
  v_active_bookings  int;
  v_open_damages     int;
  v_open_work_orders int;
  v_effective_status text;
  v_archived         boolean := false;
  v_verb             text;
  v_target           text;
BEGIN
  IF NEW.forklift_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- A6-1: archivar una OT abierta debe liberar la unidad igual que cancelarla.
  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL THEN
    v_archived := true;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NOT v_archived
     AND OLD.work_status IS NOT DISTINCT FROM NEW.work_status THEN
    RETURN NEW;
  END IF;

  -- Una OT ya archivada no debe seguir moviendo el estatus de la unidad.
  IF NOT v_archived AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_effective_status := CASE WHEN v_archived THEN 'cancelled' ELSE NEW.work_status END;

  SELECT status INTO v_forklift_status
    FROM public.forklifts WHERE id = NEW.forklift_id FOR UPDATE;

  IF v_forklift_status IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_active_bookings
    FROM public.bookings
   WHERE forklift_id = NEW.forklift_id
     AND status = 'confirmed'
     AND public.today_mty() BETWEEN start_date AND end_date;

  IF v_effective_status = 'in_progress'
     AND v_forklift_status = 'available' THEN
    UPDATE public.forklifts SET status = 'maintenance', updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' en progreso');
  ELSIF v_effective_status IN ('completed', 'cancelled')
     AND v_forklift_status = 'maintenance' THEN
    v_verb := CASE
                WHEN v_archived THEN 'archivada'
                WHEN NEW.work_status = 'completed' THEN 'completada'
                ELSE 'cancelada'
              END;

    SELECT COUNT(*) INTO v_open_damages
      FROM public.damage_records
     WHERE forklift_id = NEW.forklift_id
       AND deleted_at IS NULL
       AND status IN ('reported', 'in_repair');
    IF v_open_damages > 0 THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
              'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb ||
              ': la unidad permanece en mantenimiento por ' || v_open_damages ||
              ' daño(s) abierto(s) (reported/in_repair)');
      RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_open_work_orders
      FROM public.maintenance_logs ml
     WHERE ml.forklift_id = NEW.forklift_id
       AND ml.deleted_at IS NULL
       AND ml.id <> NEW.id
       AND ml.work_status IN ('pending', 'in_progress');
    IF v_open_work_orders > 0 THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (NEW.forklift_id, v_forklift_status, 'maintenance',
              'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb ||
              ': la unidad permanece en mantenimiento por ' || v_open_work_orders ||
              ' OT(s) abierta(s) (pending/in_progress)');
      RETURN NEW;
    END IF;

    -- A3B-02: si la unidad sigue rentada hoy, regresa a 'rented', no a 'available'.
    v_target := CASE WHEN v_active_bookings > 0 THEN 'rented' ELSE 'available' END;

    UPDATE public.forklifts SET status = v_target, updated_at = now()
     WHERE id = NEW.forklift_id;
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (NEW.forklift_id, v_forklift_status, v_target,
            'OT ' || COALESCE(NEW.service_type, 'servicio') || ' ' || v_verb ||
            CASE WHEN v_active_bookings > 0
                 THEN ': la unidad regresa a renta activa'
                 ELSE '' END);
  END IF;

  RETURN NEW;
END;
$function$;

-- A3B-06: el sync degradaba a 'available' ignorando daños/OTs abiertas y sin bitácora
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

  -- R4-17: bypass interno del guard N-42 durante el sync.
  PERFORM set_config('app.forklift_rpc', 'on', true);

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
  blocked AS (
    -- A3B-06: unidades con daño u OT abierta no se liberan a 'available'.
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

  -- R4-17: reset del bypass al salir.
  PERFORM set_config('app.forklift_rpc', 'off', true);
EXCEPTION WHEN OTHERS THEN
  -- R6-17: no dejar el bypass activo si la funcion falla a mitad de camino.
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;

-- A3B-01/A3B-05: el guard de cancelación no cubría cotizaciones ya convertidas
CREATE OR REPLACE FUNCTION public.guard_quote_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IN ('accepted', 'converted') AND NEW.status = 'cancelled' THEN
    IF current_setting('app.e2e_teardown', true) = 'on'
       AND OLD.is_e2e IS TRUE
       AND OLD.e2e_scope IS NOT NULL THEN
      RETURN NEW;
    END IF;
    IF NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    ) THEN
      RAISE EXCEPTION 'Solo un administrador o administrativo puede cancelar una cotizacion aceptada o convertida.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.bookings WHERE quote_id = OLD.id AND status = 'confirmed') THEN
      RAISE EXCEPTION 'No se puede cancelar la cotizacion: tiene reservas confirmadas. Cancela primero las reservas.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.quote_assigned_forklifts qaf
      JOIN public.forklifts f ON f.id = qaf.forklift_id
      WHERE qaf.quote_id = OLD.id AND f.status = 'sold'
    ) THEN
      IF EXISTS (
        SELECT 1 FROM public.invoices i WHERE i.quote_id = OLD.id AND i.status <> 'cancelled'
      ) THEN
        RAISE EXCEPTION 'No se puede cancelar la cotizacion: la venta ya esta facturada. Cancela primero la factura.'
          USING ERRCODE = 'check_violation';
      END IF;
      PERFORM set_config('app.forklift_rpc', 'on', true);
      UPDATE public.forklifts f
         SET status = 'available', updated_at = now()
        FROM public.quote_assigned_forklifts qaf
       WHERE qaf.quote_id = OLD.id AND f.id = qaf.forklift_id AND f.status = 'sold';
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      SELECT qaf.forklift_id, 'sold', 'available', 'Venta cancelada: cotizacion ' || OLD.id::text
        FROM public.quote_assigned_forklifts qaf WHERE qaf.quote_id = OLD.id;
      PERFORM set_config('app.forklift_rpc', 'off', true);
      DELETE FROM public.quote_assigned_forklifts WHERE quote_id = OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

-- A3B-04: cancelar la reserva con facturas emitidas vigentes
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

  -- A3B-04: no cancelar si hay facturas emitidas (no borrador) vigentes.
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

  -- R4-26: bypass del guard N-42 para la liberacion legitima de la unidad.
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

  -- R4-26: reset del bypass.
  PERFORM set_config('app.forklift_rpc', 'off', true);

  v_note := 'Reserva cancelada' ||
            CASE WHEN p_reason IS NOT NULL AND btrim(p_reason) <> ''
                 THEN ': ' || btrim(p_reason) ELSE '' END;

  IF v_released > 0 THEN
    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note, changed_by)
    VALUES (v_forklift, 'rented', 'available', v_note, auth.uid());
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- R6-17: no dejar el bypass app.forklift_rpc activo ante cualquier error.
  PERFORM set_config('app.forklift_rpc', 'off', true);
  RAISE;
END;
$function$;