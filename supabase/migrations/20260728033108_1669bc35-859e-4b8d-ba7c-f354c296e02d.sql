
-- R19-C: aceptar bills 'not_required' en el lote de pagos
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
    -- R19-C: las bills que no requieren aprobación también son pagables en lote
    -- (la UI ya las ofrece; sin esto una not_required aborta TODO el lote).
    IF v_bill.approval_status NOT IN ('approved', 'not_required') THEN
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

-- C-5: validar horas de uso no negativas en return inspection
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
  -- C-5: simétrico al guard de costo — horas usadas no pueden ser negativas.
  IF p_hours_used IS NOT NULL AND p_hours_used < 0 THEN
    RAISE EXCEPTION 'Las horas usadas no pueden ser negativas (%)', p_hours_used
      USING ERRCODE = 'check_violation';
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

-- R19-2: índice único de contract_number (mismo patrón que quotes R17-D).
-- Dedupe defensivo primero para no romper si ya hay duplicados históricos.
DELETE FROM public.contracts a
USING public.contracts b
WHERE a.contract_number = b.contract_number
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_contract_number_key
  ON public.contracts (contract_number);
