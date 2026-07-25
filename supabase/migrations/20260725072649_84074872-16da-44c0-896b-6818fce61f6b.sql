
-- R14-B
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

  UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = p_booking_id;

  UPDATE deliveries SET status = 'cancelled', updated_at = now()
   WHERE booking_id = p_booking_id AND status IN ('pending','scheduled');

  UPDATE forklifts
     SET status = 'available', updated_at = now()
   WHERE id = v_forklift AND status = 'rented'
     AND NOT EXISTS (
       SELECT 1 FROM bookings
       WHERE forklift_id = v_forklift AND id <> p_booking_id
         AND status = 'confirmed'
         AND start_date <= CURRENT_DATE
         AND end_date   >= CURRENT_DATE
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

-- Saneamiento retroactivo fila por fila; omite equipos con datos históricos
-- que fallan CHECK al re-tocar la fila. Zombie residuales no afectan la UI
-- porque v7.227.1 reformuló el KPI de rentados.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT f.id FROM forklifts f
     WHERE f.status = 'rented'
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.forklift_id = f.id
           AND b.status = 'confirmed'
           AND b.start_date <= CURRENT_DATE
           AND b.end_date   >= CURRENT_DATE
       )
  LOOP
    BEGIN
      UPDATE forklifts SET status = 'available', updated_at = now() WHERE id = r.id;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
END $$;

-- R14-F
CREATE OR REPLACE FUNCTION public.revert_audit_log(p_audit_log_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_log RECORD;
  v_allowed_tables text[] := ARRAY['forklifts','customers','contracts','deliveries','maintenance_logs','damage_records','quotes','return_inspections'];
  v_financial_tables text[] := ARRAY['bookings','invoices','payments'];
  v_key text; v_sets text := ''; v_first boolean := true; v_revert_id uuid;
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

-- R14-D + R14-E
DROP POLICY IF EXISTS "Customers create own payment intents" ON public.customer_payment_intents;
CREATE POLICY "Customers create own payment intents"
ON public.customer_payment_intents FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'customer'::app_role)
  AND customer_id = public.get_customer_id_for_user(auth.uid())
  AND status = 'pending_review'
  AND invoice_id IN (
    SELECT id FROM public.invoices
    WHERE customer_id = public.get_customer_id_for_user(auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.approve_payment_intent(
  p_intent_id uuid,
  p_payment_form_sat text DEFAULT '03',
  p_review_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_intent public.customer_payment_intents%ROWTYPE;
  v_payment_id uuid; v_invoice_customer uuid; v_invoice_currency text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.customer_payment_intents
     SET status = 'approved'::payment_intent_status,
         review_notes = p_review_notes,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   WHERE id = p_intent_id
     AND status = 'pending_review'::payment_intent_status
   RETURNING * INTO v_intent;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'intent_not_pending' USING ERRCODE = 'P0001';
  END IF;

  SELECT customer_id, COALESCE(moneda, 'MXN')
    INTO v_invoice_customer, v_invoice_currency
  FROM public.invoices WHERE id = v_intent.invoice_id;

  IF v_invoice_customer IS NULL THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_invoice_customer <> v_intent.customer_id THEN
    RAISE EXCEPTION 'La factura del reporte no pertenece al cliente que lo envió'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.payments(
    invoice_id, amount, payment_date, payment_method, payment_form_sat,
    reference_number, notes, currency
  ) VALUES (
    v_intent.invoice_id, v_intent.amount, v_intent.transfer_date,
    'transfer', COALESCE(p_payment_form_sat, '03'),
    v_intent.tracking_key,
    'Aprobado desde portal (intent ' || v_intent.id::text || ')',
    v_invoice_currency
  ) RETURNING id INTO v_payment_id;

  UPDATE public.customer_payment_intents SET payment_id = v_payment_id WHERE id = v_intent.id;

  RETURN v_payment_id;
END;
$$;

-- R14-J
CREATE OR REPLACE FUNCTION public.create_booking(
  p_forklift_id uuid, p_customer_id uuid DEFAULT NULL::uuid,
  p_customer_name text DEFAULT NULL::text, p_customer_contact text DEFAULT NULL::text,
  p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date,
  p_recurring_billing boolean DEFAULT false, p_quote_id uuid DEFAULT NULL::uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking_id uuid; v_booking_number text; v_current_status text; v_starts_today boolean;
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    NULL;
  ELSIF has_role(auth.uid(), 'administrativo'::app_role)
     OR has_role(auth.uid(), 'dispatcher'::app_role)
     OR has_role(auth.uid(), 'ventas'::app_role) THEN
    IF p_quote_id IS NULL THEN
      RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM quotes WHERE id = p_quote_id) THEN
      RAISE EXCEPTION 'Cotización no encontrada';
    END IF;
  ELSE
    RAISE EXCEPTION 'Forbidden';
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

  SELECT status INTO v_current_status FROM forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Montacargas no encontrado';
  END IF;
  IF v_current_status IN ('maintenance', 'out_of_service') THEN
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE forklift_id = p_forklift_id
      AND status = 'confirmed'
      AND daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'El montacargas ya está reservado en ese rango de fechas'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bookings.booking_number'));
  v_booking_number := next_booking_number();

  INSERT INTO bookings (forklift_id, customer_id, customer_name, customer_contact, start_date, end_date, recurring_billing, status, booking_number, quote_id)
  VALUES (p_forklift_id, p_customer_id, p_customer_name, p_customer_contact, p_start_date, p_end_date, p_recurring_billing, 'confirmed', v_booking_number, p_quote_id)
  RETURNING id INTO v_booking_id;

  v_starts_today := p_start_date <= CURRENT_DATE;
  IF v_starts_today AND v_current_status = 'available' THEN
    UPDATE forklifts SET status = 'rented', updated_at = now() WHERE id = p_forklift_id;
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (p_forklift_id, 'available', 'rented', 'Reserva ' || v_booking_number || ' creada');
  END IF;

  RETURN v_booking_id;
END;
$$;
