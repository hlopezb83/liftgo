-- N-18: revert_audit_log con verificación de cambios posteriores
CREATE OR REPLACE FUNCTION public.revert_audit_log(p_audit_log_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, user_id)
  VALUES (v_log.table_name, v_log.record_id, 'REVERT', v_log.new_data, v_log.old_data, auth.uid())
  RETURNING id INTO v_revert_id;

  RETURN v_revert_id;
END;
$$;
REVOKE ALL ON FUNCTION public.revert_audit_log(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_audit_log(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_audit_log(uuid) TO service_role;

-- N-31: desvincular la cuenta del portal al archivar un cliente
CREATE OR REPLACE FUNCTION public.trg_customer_archive_unlink_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    NEW.user_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_archive_unlink_user ON public.customers;
CREATE TRIGGER trg_customer_archive_unlink_user
  BEFORE UPDATE OF deleted_at ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.trg_customer_archive_unlink_user();

DROP POLICY IF EXISTS "Customers read own record" ON public.customers;
CREATE POLICY "Customers read own record"
ON public.customers FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND has_role((select auth.uid()), 'customer'::app_role)
  AND id = get_customer_id_for_user((select auth.uid()))
);

-- N-36: extend_booking ignora mantenimientos archivados / sin trabajo real
CREATE OR REPLACE FUNCTION public.extend_booking(p_booking_id uuid, p_new_end_date date, p_reason text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;
REVOKE ALL ON FUNCTION public.extend_booking(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_booking(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_booking(uuid, date, text) TO service_role;

-- N-40: monotonía del horómetro en entregas
CREATE OR REPLACE FUNCTION public.trg_deliveries_hours_reading_monotonic()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_last numeric;
BEGIN
  IF NEW.hours_reading IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT MAX(d.hours_reading) INTO v_last
  FROM public.deliveries d
  WHERE d.forklift_id = NEW.forklift_id
    AND d.status = 'completed'
    AND d.hours_reading IS NOT NULL
    AND d.id IS DISTINCT FROM NEW.id;

  IF v_last IS NOT NULL AND NEW.hours_reading < v_last THEN
    RAISE EXCEPTION
      'La lectura de horómetro (%) no puede ser menor a la última lectura registrada (%) para este montacargas.',
      NEW.hours_reading, v_last
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deliveries_hours_reading_monotonic ON public.deliveries;
CREATE TRIGGER trg_deliveries_hours_reading_monotonic
  BEFORE INSERT OR UPDATE OF hours_reading ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.trg_deliveries_hours_reading_monotonic();

-- N-45: has_role exige perfil activo
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT p.is_active FROM public.profiles p WHERE p.user_id = _user_id),
    true
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_user(_user_id)
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id AND role = _role
     )
$$;