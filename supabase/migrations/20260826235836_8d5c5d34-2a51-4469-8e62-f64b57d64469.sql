CREATE OR REPLACE FUNCTION public.sync_forklift_rental_status()
 RETURNS TABLE(forklift_id uuid, previous_status text, new_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
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

  -- R4-17: reset del bypass al salir.
  PERFORM set_config('app.forklift_rpc', 'off', true);
END;
$function$;

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
END;
$function$;

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

  -- R4-19: revert_audit_log fija app.audit_revert='on' para restaurar old_data
  -- (incluye 'status') sin ser rechazado por el guard de transiciones.
  IF current_setting('app.audit_revert', true) = 'on' THEN
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

CREATE OR REPLACE FUNCTION public.guard_delivery_completed_terminal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
BEGIN
  -- R4-19: bypass durante la reversion administrativa de bitacora.
  IF current_setting('app.audit_revert', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Una entrega completada no puede reabrirse ni cambiar de estado.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revert_audit_log(p_audit_log_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_log RECORD;
  v_allowed_tables text[] := ARRAY['forklifts','customers','contracts','deliveries','maintenance_logs','damage_records','quotes','return_inspections'];
  v_financial_tables text[] := ARRAY['bookings','invoices','payments'];
  v_key text; v_sets text := ''; v_first boolean := true; v_revert_id uuid;
  v_current jsonb;
  v_mismatch text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins can revert audit logs';
  END IF;

  SELECT * INTO v_log FROM audit_logs WHERE id = p_audit_log_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit log not found'; END IF;

  IF v_log.table_name = ANY(v_financial_tables) THEN
    RAISE EXCEPTION 'Las operaciones financieras (%) se reversan por sus flujos de negocio (cancelación SAT, notas de crédito, eliminación de pago con re-sync), no por la bitácora.', v_log.table_name;
  END IF;

  IF NOT (v_log.table_name = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % is not allowed for revert', v_log.table_name;
  END IF;

  -- R4-19: bypass de los guards de transicion/terminal durante la restauracion.
  PERFORM set_config('app.audit_revert', 'on', true);

  CASE v_log.action
    WHEN 'INSERT' THEN
      EXECUTE format('DELETE FROM %I WHERE id = %L', v_log.table_name, v_log.record_id);
    WHEN 'UPDATE' THEN
      -- N-18: bloqueo optimista antes de restaurar old_data.
      EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = %L', v_log.table_name, v_log.record_id)
        INTO v_current;
      IF v_current IS NULL THEN
        RAISE EXCEPTION 'No se puede revertir: el registro % de % ya no existe (fue eliminado despues del cambio registrado).',
          v_log.record_id, v_log.table_name;
      END IF;
      IF v_log.new_data ? 'updated_at' AND v_current ? 'updated_at' THEN
        IF v_current->>'updated_at' IS DISTINCT FROM v_log.new_data->>'updated_at' THEN
          RAISE EXCEPTION 'No se puede revertir: el registro % de % fue modificado despues del cambio registrado. Revierta primero los cambios posteriores.',
            v_log.record_id, v_log.table_name;
        END IF;
      ELSE
        v_mismatch := NULL;
        FOR v_key IN SELECT jsonb_object_keys(v_log.new_data) LOOP
          IF v_current->v_key IS DISTINCT FROM v_log.new_data->v_key THEN
            v_mismatch := v_key;
            EXIT;
          END IF;
        END LOOP;
        IF v_mismatch IS NOT NULL THEN
          RAISE EXCEPTION 'No se puede revertir: el registro % de % fue modificado despues del cambio registrado (el campo "%" ya no coincide). Revierta primero los cambios posteriores.',
            v_log.record_id, v_log.table_name, v_mismatch;
        END IF;
      END IF;
      FOR v_key IN SELECT jsonb_object_keys(v_log.old_data) LOOP
        IF NOT v_first THEN v_sets := v_sets || ', '; END IF;
        v_sets := v_sets || format('%I = %L', v_key, v_log.old_data->>v_key);
        v_first := false;
      END LOOP;
      IF v_sets <> '' THEN
        EXECUTE format('UPDATE %I SET %s WHERE id = %L', v_log.table_name, v_sets, v_log.record_id);
      END IF;
    WHEN 'DELETE' THEN
      RAISE EXCEPTION 'Cannot revert DELETE operations automatically';
  END CASE;

  -- R4-19: reset del bypass al terminar la restauracion.
  PERFORM set_config('app.audit_revert', 'off', true);

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, user_id)
  VALUES (v_log.table_name, v_log.record_id, 'REVERT', v_log.new_data, v_log.old_data, auth.uid())
  RETURNING id INTO v_revert_id;

  RETURN v_revert_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.extend_booking(p_booking_id uuid, p_new_end_date date, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_forklift_id uuid;
  v_start_date date;
  v_current_end date;
  v_status text;
  v_next_service date;
  v_ext_id uuid;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT forklift_id, start_date, end_date, status
    INTO v_forklift_id, v_start_date, v_current_end, v_status
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_forklift_id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_status IN ('cancelled','completed') THEN
    RAISE EXCEPTION 'No se puede extender una reserva %', v_status;
  END IF;

  IF p_new_end_date IS NULL OR p_new_end_date <= v_current_end THEN
    RAISE EXCEPTION 'La nueva fecha final debe ser posterior a la actual (%).', v_current_end;
  END IF;

  -- R4-18: mismo chequeo de OT en curso que create_booking.
  IF EXISTS (
    SELECT 1 FROM maintenance_logs ml
    WHERE ml.forklift_id = v_forklift_id
      AND ml.work_status = 'in_progress'
      AND ml.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene una orden de trabajo en curso; no se puede extender la reserva'
      USING ERRCODE = 'check_violation';
  END IF;

  -- BL-A6 + N-36: mismos filtros que create_booking.
  SELECT ml.next_service_date INTO v_next_service
  FROM maintenance_logs ml
  WHERE ml.forklift_id = v_forklift_id
    AND ml.next_service_date IS NOT NULL
    AND ml.deleted_at IS NULL
    AND ml.work_status NOT IN ('scheduled', 'cancelled')
  ORDER BY ml.performed_at DESC
  LIMIT 1;

  IF v_next_service IS NOT NULL
     AND v_next_service <= (p_new_end_date + INTERVAL '3 days')::date
     AND v_next_service >= v_start_date THEN
    RAISE EXCEPTION 'La extensión invade la ventana de mantenimiento programado el % (buffer 3 días).', v_next_service;
  END IF;

  IF EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.forklift_id = v_forklift_id
      AND b.id <> p_booking_id
      AND b.status NOT IN ('cancelled','completed')
      AND daterange(b.start_date, b.end_date, '[]') && daterange(v_start_date, p_new_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'La extensión se traslapa con otra reserva del mismo montacargas.';
  END IF;

  UPDATE bookings
     SET end_date = p_new_end_date,
         updated_at = now()
   WHERE id = p_booking_id;

  INSERT INTO booking_extensions (booking_id, original_end_date, new_end_date, reason)
  VALUES (p_booking_id, v_current_end, p_new_end_date, p_reason)
  RETURNING id INTO v_ext_id;

  RETURN v_ext_id;
END;
$function$;

-- R4-27: la vista de saldos no debe ser legible por el rol anonimo.
REVOKE ALL ON public.v_invoices_with_balance FROM anon;
GRANT SELECT ON public.v_invoices_with_balance TO authenticated;
GRANT SELECT ON public.v_invoices_with_balance TO service_role;