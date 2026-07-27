
CREATE UNIQUE INDEX IF NOT EXISTS quotes_quote_number_unique
  ON public.quotes (quote_number)
  WHERE is_e2e IS NOT TRUE;

CREATE OR REPLACE FUNCTION public.create_supplier_payment_batch(p_items jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch_id uuid;
  v_total numeric(14,2) := 0;
  v_count integer := 0;
  v_user uuid := auth.uid();
  v_item jsonb;
  v_bill_id uuid;
  v_amount numeric;
  v_bill record;
  v_supplier record;
  v_bank record;
  v_reference text;
BEGIN
  IF NOT (public.has_role(v_user,'admin'::app_role) OR public.has_role(v_user,'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado para crear lotes de pago';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos una factura';
  END IF;
  INSERT INTO public.supplier_payment_batches(exported_by, total_amount, bill_count, notes)
  VALUES (v_user, 0, 0, p_notes) RETURNING id INTO v_batch_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bill_id := (v_item->>'bill_id')::uuid;
    v_amount := (v_item->>'amount')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Monto inválido para la factura %', v_bill_id;
    END IF;
    SELECT * INTO v_bill FROM public.supplier_bills WHERE id = v_bill_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Factura % no encontrada', v_bill_id; END IF;
    IF v_bill.approval_status <> 'approved' THEN
      RAISE EXCEPTION 'La factura % no está aprobada', v_bill.bill_number;
    END IF;
    IF v_bill.payment_in_progress_at IS NOT NULL THEN
      RAISE EXCEPTION 'La factura % ya está en un lote de pago en curso', v_bill.bill_number
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_bill.balance < v_amount - 0.01 THEN
      RAISE EXCEPTION 'Monto excede el saldo de la factura %', v_bill.bill_number;
    END IF;
    SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_bill.supplier_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor de la factura % no encontrado', v_bill.bill_number; END IF;
    SELECT * INTO v_bank FROM public.supplier_bank_accounts
     WHERE supplier_id = v_supplier.id
     ORDER BY is_primary DESC, created_at ASC LIMIT 1;
    IF NOT FOUND OR v_bank.clabe IS NULL OR length(trim(v_bank.clabe)) <> 18 THEN
      RAISE EXCEPTION 'Proveedor % no tiene cuenta bancaria con CLABE válida', v_supplier.name;
    END IF;
    v_reference := COALESCE(NULLIF(v_item->>'reference',''), 'LIFTGO-' || v_bill.bill_number);
    INSERT INTO public.supplier_payment_batch_items(
      batch_id, bill_id, supplier_id, supplier_name, supplier_rfc,
      bank_name, clabe, account_number, account_holder,
      bill_number, due_date, reference, concept, amount, currency
    ) VALUES (
      v_batch_id, v_bill.id, v_supplier.id, v_supplier.name, v_supplier.rfc,
      v_bank.bank_name, v_bank.clabe, v_bank.account_number, v_bank.account_holder,
      v_bill.bill_number, v_bill.due_date, v_reference,
      COALESCE(v_bill.description, v_bill.bill_number),
      v_amount, v_bill.currency);
    UPDATE public.supplier_bills SET payment_in_progress_at = now() WHERE id = v_bill.id;
    v_total := v_total + v_amount;
    v_count := v_count + 1;
  END LOOP;
  UPDATE public.supplier_payment_batches SET total_amount = v_total, bill_count = v_count WHERE id = v_batch_id;
  RETURN v_batch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_payment_intent(p_intent_id uuid, p_payment_form_sat text DEFAULT '03'::text, p_review_notes text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_intent public.customer_payment_intents%ROWTYPE;
  v_payment_id uuid; v_invoice_customer uuid; v_invoice_currency text;
  v_invoice_total numeric; v_invoice_exchange numeric;
  v_paid numeric; v_credited numeric; v_balance numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.customer_payment_intents
     SET status = 'approved'::payment_intent_status,
         review_notes = p_review_notes, reviewed_at = now(), reviewed_by = auth.uid()
   WHERE id = p_intent_id AND status = 'pending_review'::payment_intent_status
   RETURNING * INTO v_intent;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_pending' USING ERRCODE = 'P0001'; END IF;
  SELECT customer_id, COALESCE(moneda, 'MXN'), total, COALESCE(tipo_cambio, 1)
    INTO v_invoice_customer, v_invoice_currency, v_invoice_total, v_invoice_exchange
  FROM public.invoices WHERE id = v_intent.invoice_id;
  IF v_invoice_customer IS NULL THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0001'; END IF;
  IF v_invoice_customer <> v_intent.customer_id THEN
    RAISE EXCEPTION 'La factura del reporte no pertenece al cliente que lo envió' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.payments WHERE invoice_id = v_intent.invoice_id;
  SELECT COALESCE(SUM(total), 0) INTO v_credited FROM public.credit_notes
   WHERE invoice_id = v_intent.invoice_id AND cfdi_status = 'stamped' AND cancellation_status <> 'accepted';
  v_balance := v_invoice_total - v_paid - v_credited;
  IF v_intent.amount > v_balance + 0.01 THEN
    RAISE EXCEPTION 'El monto reportado (%) excede el saldo pendiente (%) de la factura', v_intent.amount, v_balance
      USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.payments(
    invoice_id, amount, payment_date, payment_method, payment_form_sat,
    reference_number, notes, currency, exchange_rate
  ) VALUES (
    v_intent.invoice_id, v_intent.amount, v_intent.transfer_date,
    'transfer', COALESCE(p_payment_form_sat, '03'), v_intent.tracking_key,
    'Aprobado desde portal (intent ' || v_intent.id::text || ')',
    v_invoice_currency, v_invoice_exchange
  ) RETURNING id INTO v_payment_id;
  UPDATE public.customer_payment_intents SET payment_id = v_payment_id WHERE id = v_intent.id;
  RETURN v_payment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_return_inspection(p_booking_id uuid, p_forklift_id uuid, p_condition text DEFAULT 'good'::text, p_damage_notes text DEFAULT NULL::text, p_damage_cost numeric DEFAULT 0, p_hours_used numeric DEFAULT NULL::numeric, p_fuel_level text DEFAULT NULL::text, p_inspected_by text DEFAULT NULL::text, p_inspected_at timestamp with time zone DEFAULT now())
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inspection_id uuid; v_old_status text; v_new_status text;
  v_customer_id uuid; v_is_damaged_condition boolean; v_sends_to_maintenance boolean;
  v_booking_start date; v_existing_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)
       OR has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'mechanic'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF COALESCE(p_damage_cost, 0) < 0 THEN
    RAISE EXCEPTION 'El costo de daño no puede ser negativo.' USING ERRCODE = 'check_violation';
  END IF;
  v_is_damaged_condition := p_condition IN ('damaged', 'minor_damage', 'major_damage', 'needs_repair');
  v_sends_to_maintenance := p_condition IN ('damaged', 'major_damage', 'needs_repair');
  IF v_is_damaged_condition AND COALESCE(p_damage_cost, 0) <= 0
     AND (p_damage_notes IS NULL OR btrim(p_damage_notes) = '') THEN
    RAISE EXCEPTION 'La devolución marcada como % requiere costo estimado (>0) o una descripción del daño.', p_condition
      USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO v_existing_id FROM return_inspections WHERE booking_id = p_booking_id LIMIT 1;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;
  SELECT start_date INTO v_booking_start FROM bookings WHERE id = p_booking_id;
  IF v_booking_start IS NULL THEN RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0001'; END IF;
  IF p_inspected_at::date < v_booking_start THEN
    RAISE EXCEPTION 'La fecha de inspección no puede ser anterior al inicio de la reserva (%).', v_booking_start
      USING ERRCODE = 'P0001';
  END IF;
  IF p_inspected_at > (now() + interval '30 days') THEN
    RAISE EXCEPTION 'La fecha de inspección no puede estar más de 30 días en el futuro.' USING ERRCODE = 'P0001';
  END IF;
  SELECT status INTO v_old_status FROM forklifts WHERE id = p_forklift_id;
  SELECT customer_id INTO v_customer_id FROM bookings WHERE id = p_booking_id;
  INSERT INTO return_inspections (booking_id, forklift_id, condition, damage_notes, damage_cost, hours_used, fuel_level, inspected_by, inspected_at)
  VALUES (p_booking_id, p_forklift_id, p_condition, p_damage_notes, p_damage_cost, p_hours_used, p_fuel_level, p_inspected_by, p_inspected_at)
  RETURNING id INTO v_inspection_id;
  UPDATE bookings SET return_status = 'returned', status = 'completed', updated_at = now() WHERE id = p_booking_id;
  IF v_is_damaged_condition THEN
    INSERT INTO damage_records (inspection_id, forklift_id, booking_id, customer_id, description, estimated_cost, status)
    VALUES (v_inspection_id, p_forklift_id, p_booking_id, v_customer_id,
      COALESCE(NULLIF(btrim(p_damage_notes), ''), 'Daño reportado en devolución'),
      COALESCE(p_damage_cost, 0), 'reported');
  END IF;
  v_new_status := CASE WHEN v_sends_to_maintenance THEN 'maintenance' ELSE 'available' END;
  UPDATE forklifts SET status = v_new_status, updated_at = now() WHERE id = p_forklift_id;
  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_old_status, v_new_status, 'Returned — condition: ' || p_condition);
  RETURN v_inspection_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_booking(p_forklift_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_contact text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_recurring_billing boolean DEFAULT false, p_quote_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id uuid; v_booking_number text; v_current_status text; v_starts_today boolean;
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN NULL;
  ELSIF has_role(auth.uid(), 'administrativo'::app_role) OR has_role(auth.uid(), 'dispatcher'::app_role)
     OR has_role(auth.uid(), 'ventas'::app_role) THEN
    IF p_quote_id IS NULL THEN
      RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM quotes WHERE id = p_quote_id) THEN
      RAISE EXCEPTION 'Cotización no encontrada';
    END IF;
  ELSE RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN RAISE EXCEPTION 'Fechas de reserva requeridas'; END IF;
  IF p_end_date < p_start_date THEN RAISE EXCEPTION 'La fecha final no puede ser anterior a la inicial'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'El cliente seleccionado está archivado o no existe'; END IF;
  SELECT status INTO v_current_status FROM forklifts WHERE id = p_forklift_id FOR UPDATE;
  IF v_current_status IS NULL THEN RAISE EXCEPTION 'Montacargas no encontrado'; END IF;
  IF v_current_status IN ('maintenance', 'out_of_service', 'retired', 'sold') THEN
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM bookings WHERE forklift_id = p_forklift_id AND status = 'confirmed'
      AND daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'El montacargas ya está reservado en ese rango de fechas' USING ERRCODE = 'check_violation';
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
$function$;
