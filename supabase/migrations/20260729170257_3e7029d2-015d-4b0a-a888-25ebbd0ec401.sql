-- DB2-12
ALTER TABLE public.damage_records
  ADD COLUMN IF NOT EXISTS previous_forklift_status text;

COMMENT ON COLUMN public.damage_records.previous_forklift_status IS
  'Estado del forklift antes de registrar el daño; se restaura al archivar el registro (DB2-12).';

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
    INSERT INTO damage_records (inspection_id, forklift_id, booking_id, customer_id, description, estimated_cost, status, previous_forklift_status)
    VALUES (v_inspection_id, p_forklift_id, p_booking_id, v_customer_id,
      COALESCE(NULLIF(btrim(p_damage_notes), ''), 'Daño reportado en devolución'),
      COALESCE(p_damage_cost, 0), 'reported', v_old_status);
  END IF;
  v_new_status := CASE WHEN v_sends_to_maintenance THEN 'maintenance' ELSE 'available' END;
  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE forklifts SET status = v_new_status, updated_at = now() WHERE id = p_forklift_id;
  INSERT INTO status_logs (forklift_id, from_status, to_status, note)
  VALUES (p_forklift_id, v_old_status, v_new_status, 'Returned — condition: ' || p_condition);
  RETURN v_inspection_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_damage_record(p_damage_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.damage_records%ROWTYPE;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_rec FROM public.damage_records
   WHERE id = p_damage_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro no encontrado o ya archivado';
  END IF;

  IF v_rec.invoice_id IS NULL AND v_rec.status NOT IN ('repaired') THEN
    RAISE EXCEPTION 'No se puede archivar el daño sin cargo: liga una factura (invoice_id) o marcalo como reparado (status=repaired) antes de archivarlo. Estado actual: %',
      v_rec.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE damage_records
     SET deleted_at = now(),
         deleted_by = auth.uid()
   WHERE id = p_damage_id;

  IF v_rec.previous_forklift_status IS NOT NULL
     AND v_rec.forklift_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.damage_records
        WHERE forklift_id = v_rec.forklift_id
          AND deleted_at IS NULL
          AND id <> p_damage_id
     ) THEN
    PERFORM set_config('app.forklift_rpc', 'on', true);
    UPDATE public.forklifts
       SET status = v_rec.previous_forklift_status, updated_at = now()
     WHERE id = v_rec.forklift_id
       AND status = 'maintenance';
    IF FOUND THEN
      INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
      VALUES (v_rec.forklift_id, 'maintenance', v_rec.previous_forklift_status,
              'Daño ' || p_damage_id::text || ' archivado: restauracion de estado');
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_damage_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_damage_record(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_damage_record_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.invoice_id IS NULL AND OLD.status NOT IN ('repaired') THEN
    RAISE EXCEPTION 'No se puede borrar el daño sin cargo: liga una factura o marcalo como reparado primero (status=%)', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_damage_record_delete ON public.damage_records;
CREATE TRIGGER trg_guard_damage_record_delete
  BEFORE DELETE ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_damage_record_delete();

-- DB2-13
CREATE OR REPLACE FUNCTION public.enforce_supplier_bill_total_covers_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paid numeric;
BEGIN
  IF NEW.total IS NOT DISTINCT FROM OLD.total THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.supplier_payments WHERE bill_id = OLD.id;
  IF round(NEW.total, 2) < round(v_paid, 2) THEN
    RAISE EXCEPTION 'El nuevo total (%) no puede ser menor a lo ya pagado (%). Elimina o reversa pagos primero.',
      NEW.total, v_paid USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_supplier_bill_total_covers_paid ON public.supplier_bills;
CREATE TRIGGER trg_supplier_bill_total_covers_paid
  BEFORE UPDATE OF total ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.enforce_supplier_bill_total_covers_paid();

-- DB2-14
CREATE OR REPLACE FUNCTION public.validate_invoice_line_items_signs()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  item jsonb; qty numeric; price numeric; amount numeric; discount numeric;
  v_sum numeric := 0;
BEGIN
  IF NEW.line_items IS NULL OR jsonb_typeof(NEW.line_items) <> 'array' THEN RETURN NEW; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(NEW.line_items) LOOP
    qty := COALESCE((item->>'quantity')::numeric, 1);
    price := COALESCE((item->>'unit_price')::numeric, 0);
    amount := COALESCE((item->>'amount')::numeric, qty * price);
    discount := COALESCE((item->>'discount')::numeric, 0);
    IF qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad debe ser mayor a cero (recibido: %). Descripcion: %', qty, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;
    IF price < 0 THEN
      RAISE EXCEPTION 'Precio unitario no puede ser negativo (recibido: %). Descripcion: %', price, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;
    IF amount < 0 THEN
      RAISE EXCEPTION 'El importe de la partida no puede ser negativo (recibido: %). Descripcion: %', amount, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;
    IF discount < 0 THEN
      RAISE EXCEPTION 'El descuento de la partida no puede ser negativo (recibido: %). Descripcion: %', discount, COALESCE(item->>'description', '(sin descripcion)') USING ERRCODE = 'check_violation';
    END IF;
    v_sum := v_sum + round(amount - discount, 2);
  END LOOP;

  IF jsonb_array_length(NEW.line_items) > 0
     AND NEW.subtotal IS NOT NULL
     AND abs(v_sum - round(NEW.subtotal, 2)) > 0.05 THEN
    RAISE EXCEPTION 'Las partidas no cuadran con el subtotal: suma de partidas (%) <> subtotal (%) (tolerancia 0.05).',
      v_sum, NEW.subtotal USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_invoice_line_items_signs ON public.invoices;
CREATE TRIGGER trg_validate_invoice_line_items_signs
  BEFORE INSERT OR UPDATE OF line_items, subtotal ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_line_items_signs();

-- DB2-15
CREATE OR REPLACE FUNCTION public.enforce_payment_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_invoice_total numeric(14,2);
  v_paid_after numeric(14,2);
  v_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoice_payment:' || NEW.invoice_id::text));
  SELECT total, status INTO v_invoice_total, v_status FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_invoice_total IS NULL THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'No se pueden registrar pagos en facturas canceladas'; END IF;
  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en facturas en borrador. Envia la factura primero.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_after FROM payments WHERE invoice_id = NEW.invoice_id;
  IF TG_OP = 'INSERT' THEN v_paid_after := v_paid_after + NEW.amount;
  ELSIF TG_OP = 'UPDATE' THEN v_paid_after := v_paid_after - OLD.amount + NEW.amount; END IF;
  IF round(v_paid_after, 2) > v_invoice_total THEN
    RAISE EXCEPTION 'El pago excede el saldo pendiente (total: %, pagado tras esta operacion: %)', v_invoice_total, v_paid_after;
  END IF;
  RETURN NEW;
END; $$;

-- DB2-16
ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_status_dominio;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_status_dominio
  CHECK (status IN ('scheduled','completed','cancelled')) NOT VALID;
ALTER TABLE public.deliveries VALIDATE CONSTRAINT deliveries_status_dominio;

-- DB2-17
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_tasas_no_negativas;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_tasas_no_negativas
  CHECK (COALESCE(daily_rate, 0) >= 0 AND COALESCE(weekly_rate, 0) >= 0
     AND COALESCE(monthly_rate, 0) >= 0 AND COALESCE(deposit_amount, 0) >= 0) NOT VALID;
ALTER TABLE public.contracts VALIDATE CONSTRAINT contracts_tasas_no_negativas;

CREATE OR REPLACE FUNCTION public.guard_contract_signable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('signed','active') AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF COALESCE(NEW.daily_rate, 0) < 0 OR COALESCE(NEW.weekly_rate, 0) < 0
       OR COALESCE(NEW.monthly_rate, 0) < 0 OR COALESCE(NEW.deposit_amount, 0) < 0 THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato con tasas o deposito negativos'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL AND NEW.end_date < NEW.start_date THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato con fecha final anterior a la inicial'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_contract_signable ON public.contracts;
CREATE TRIGGER trg_guard_contract_signable
  BEFORE INSERT OR UPDATE OF status, daily_rate, weekly_rate, monthly_rate, deposit_amount ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contract_signable();