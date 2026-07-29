-- DB-14 aritmetica de facturas
CREATE OR REPLACE FUNCTION public.validate_invoice_totals()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.subtotal   := round(COALESCE(NEW.subtotal, 0), 2);
  NEW.tax_amount := round(COALESCE(NEW.tax_amount, 0), 2);
  NEW.total      := round(COALESCE(NEW.total, 0), 2);
  IF NEW.subtotal < 0 OR NEW.tax_amount < 0 OR NEW.total < 0 THEN
    RAISE EXCEPTION 'Los montos de la factura no pueden ser negativos (subtotal=%, tax_amount=%, total=%)',
      NEW.subtotal, NEW.tax_amount, NEW.total USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.subtotal + NEW.tax_amount <> NEW.total THEN
    RAISE EXCEPTION 'La factura no cuadra: subtotal (%) + tax_amount (%) <> total (%)',
      NEW.subtotal, NEW.tax_amount, NEW.total USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_invoice_totals ON public.invoices;
CREATE TRIGGER trg_validate_invoice_totals BEFORE INSERT OR UPDATE OF subtotal, tax_amount, total ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_totals();

CREATE OR REPLACE FUNCTION public.validate_invoice_line_items_signs()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE item jsonb; qty numeric; price numeric; amount numeric; discount numeric;
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
  END LOOP;
  RETURN NEW;
END; $$;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_total_no_negativo;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_total_no_negativo CHECK (total >= 0) NOT VALID;
ALTER TABLE public.invoices VALIDATE CONSTRAINT invoices_total_no_negativo;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_subtotal_no_negativo;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_subtotal_no_negativo CHECK (subtotal >= 0) NOT VALID;
ALTER TABLE public.invoices VALIDATE CONSTRAINT invoices_subtotal_no_negativo;

-- DB-15 vista de vencidas (v_invoices_with_balance ya filtra NC timbradas)
CREATE OR REPLACE VIEW public.v_overdue_invoices
WITH (security_invoker = true) AS
SELECT i.id, i.invoice_number, i.customer_id, i.customer_name, i.due_date, i.total,
  COALESCE(v.balance, i.total) AS balance,
  COALESCE(v.balance_mxn, ROUND(i.total * COALESCE(NULLIF(i.tipo_cambio, 0), 1), 2)) AS balance_mxn,
  CURRENT_DATE - i.due_date AS days_overdue,
  CASE
    WHEN (CURRENT_DATE - i.due_date) <= 30 THEN '0-30'
    WHEN (CURRENT_DATE - i.due_date) <= 60 THEN '31-60'
    WHEN (CURRENT_DATE - i.due_date) <= 90 THEN '61-90'
    ELSE '90+'
  END AS bucket
FROM public.invoices i
LEFT JOIN public.v_invoices_with_balance v ON v.id = i.id
WHERE i.status IN ('sent', 'partial', 'overdue')
  AND COALESCE(i.cancellation_status, 'none') <> 'accepted'
  AND i.due_date IS NOT NULL
  AND i.due_date < CURRENT_DATE
  AND COALESCE(v.balance, i.total) > 0;

-- DB-16 matcher bancario con igualdad de moneda
CREATE OR REPLACE FUNCTION public.match_bank_statement_lines(p_import_id uuid)
RETURNS TABLE (matched_count integer, suggested_count integer, unmatched_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_matched int := 0; v_suggested int := 0; v_unmatched int := 0;
  v_line record; v_best record; v_score int; v_line_currency text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_line IN SELECT * FROM public.bank_statement_lines WHERE import_id = p_import_id AND status = 'unmatched' LOOP
    v_best := NULL; v_score := 0;
    SELECT currency INTO v_line_currency FROM public.bank_accounts WHERE id = v_line.bank_account_id;

    IF v_line.signed_amount < 0 THEN
      SELECT sp.id AS pid,
             60 + GREATEST(0, 25 - ABS(sp.payment_date - v_line.posted_date) * 8)
             + CASE WHEN v_line.reference IS NOT NULL AND sp.reference IS NOT NULL
                      AND position(lower(sp.reference) IN lower(coalesce(v_line.description,'') || ' ' || coalesce(v_line.reference,''))) > 0
                    THEN 15 ELSE 0 END AS score,
             count(*) OVER () AS total
        INTO v_best
        FROM public.supplier_payments sp
        JOIN public.supplier_bills sb ON sb.id = sp.bill_id
        WHERE abs(sp.amount - abs(v_line.signed_amount)) < 0.01
          AND abs(sp.payment_date - v_line.posted_date) <= 3
          AND sb.currency = v_line_currency
          AND NOT EXISTS (SELECT 1 FROM public.bank_statement_lines bsl WHERE bsl.matched_supplier_payment_id = sp.id)
        ORDER BY ABS(sp.payment_date - v_line.posted_date) ASC LIMIT 1;

      IF v_best.pid IS NOT NULL THEN
        IF v_best.total = 1 THEN
          UPDATE public.bank_statement_lines SET status = 'matched', matched_supplier_payment_id = v_best.pid,
            match_score = v_best.score, matched_at = now(), matched_by = auth.uid() WHERE id = v_line.id;
          v_matched := v_matched + 1;
        ELSE
          UPDATE public.bank_statement_lines SET status = 'suggested', suggested_supplier_payment_id = v_best.pid,
            match_score = v_best.score WHERE id = v_line.id;
          v_suggested := v_suggested + 1;
        END IF;
      ELSE
        v_unmatched := v_unmatched + 1;
      END IF;
    ELSE
      SELECT p.id AS pid,
             60 + GREATEST(0, 25 - ABS(p.payment_date - v_line.posted_date) * 8)
             + CASE WHEN v_line.reference IS NOT NULL AND p.reference_number IS NOT NULL
                      AND position(lower(p.reference_number) IN lower(coalesce(v_line.description,'') || ' ' || coalesce(v_line.reference,''))) > 0
                    THEN 15 ELSE 0 END AS score,
             count(*) OVER () AS total
        INTO v_best
        FROM public.payments p
        WHERE abs(p.amount - v_line.signed_amount) < 0.01
          AND abs(p.payment_date - v_line.posted_date) <= 3
          AND p.currency = v_line_currency
          AND NOT EXISTS (SELECT 1 FROM public.bank_statement_lines bsl WHERE bsl.matched_payment_id = p.id)
        ORDER BY ABS(p.payment_date - v_line.posted_date) ASC LIMIT 1;

      IF v_best.pid IS NOT NULL THEN
        IF v_best.total = 1 THEN
          UPDATE public.bank_statement_lines SET status = 'matched', matched_payment_id = v_best.pid,
            match_score = v_best.score, matched_at = now(), matched_by = auth.uid() WHERE id = v_line.id;
          v_matched := v_matched + 1;
        ELSE
          UPDATE public.bank_statement_lines SET status = 'suggested', suggested_payment_id = v_best.pid,
            match_score = v_best.score WHERE id = v_line.id;
          v_suggested := v_suggested + 1;
        END IF;
      ELSE
        v_unmatched := v_unmatched + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_matched, v_suggested, v_unmatched;
END; $$;

-- DB-17 folios unicos por mundo (prod / e2e)
DROP INDEX IF EXISTS public.invoices_invoice_number_unique_idx;
CREATE UNIQUE INDEX invoices_invoice_number_unique_idx ON public.invoices (invoice_number, COALESCE(is_e2e, false));
DROP INDEX IF EXISTS public.quotes_quote_number_unique;
CREATE UNIQUE INDEX quotes_quote_number_unique ON public.quotes (quote_number, COALESCE(is_e2e, false));

-- DB-18 conversion de cotizaciones
CREATE OR REPLACE FUNCTION public.convert_quote_to_bookings(p_quote_id uuid, p_assignments jsonb, p_recurring boolean DEFAULT false)
 RETURNS TABLE(booking_id uuid, forklift_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_quote quotes%ROWTYPE; v_assignment jsonb; v_forklift_id uuid; v_model_id uuid;
  v_daily numeric; v_weekly numeric; v_monthly numeric; v_booking_id uuid; v_meta jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'ventas'::app_role)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;

  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Solo se pueden convertir cotizaciones aceptadas (estado actual: %)', v_quote.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.bookings WHERE quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'La cotización ya fue convertida';
  END IF;

  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cotización vencida: actualiza precios y vigencia antes de convertir';
  END IF;

  IF jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignación';
  END IF;

  FOR v_assignment IN SELECT jsonb_array_elements(p_assignments) LOOP
    v_forklift_id := (v_assignment->>'forklift_id')::uuid;
    SELECT equipment_model_id INTO v_model_id FROM forklifts WHERE id = v_forklift_id;

    v_meta := NULL;
    IF v_model_id IS NOT NULL AND jsonb_typeof(v_quote.rental_meta) = 'array' THEN
      SELECT elem INTO v_meta FROM jsonb_array_elements(v_quote.rental_meta) AS elem
      WHERE (elem->>'modelId')::uuid = v_model_id LIMIT 1;
    END IF;

    IF v_meta IS NOT NULL THEN
      v_daily := COALESCE((v_meta->>'dailyRate')::numeric, 0);
      v_weekly := COALESCE((v_meta->>'weeklyRate')::numeric, 0);
      v_monthly := COALESCE((v_meta->>'monthlyRate')::numeric, 0);
    ELSE
      v_daily := COALESCE((v_assignment->>'daily_rate')::numeric, 0);
      v_weekly := COALESCE((v_assignment->>'weekly_rate')::numeric, 0);
      v_monthly := COALESCE((v_assignment->>'monthly_rate')::numeric, 0);
    END IF;

    v_booking_id := public.create_booking(
      v_forklift_id, v_quote.customer_id, v_quote.customer_name, NULL,
      v_quote.start_date, v_quote.end_date, p_recurring, p_quote_id
    );

    UPDATE public.bookings
       SET daily_rate = v_daily, weekly_rate = v_weekly, monthly_rate = v_monthly,
           currency = COALESCE(v_quote.currency, 'MXN'), tipo_cambio = COALESCE(v_quote.tipo_cambio, 1)
     WHERE id = v_booking_id;

    RETURN QUERY SELECT v_booking_id, v_forklift_id;
  END LOOP;
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
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM bookings WHERE forklift_id = p_forklift_id
      AND status NOT IN ('cancelled','completed')
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

-- DB-19 fechas coherentes
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_fechas_validas;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_fechas_validas CHECK (end_date >= start_date) NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_fechas_validas;
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_fechas_validas;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_fechas_validas CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date) NOT VALID;
ALTER TABLE public.quotes VALIDATE CONSTRAINT quotes_fechas_validas;
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_fechas_validas;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_fechas_validas CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date) NOT VALID;
ALTER TABLE public.contracts VALIDATE CONSTRAINT contracts_fechas_validas;

CREATE OR REPLACE FUNCTION public.validate_delivery_not_in_past()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.scheduled_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'La entrega no puede programarse en el pasado (%)', NEW.scheduled_date USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_delivery_not_in_past ON public.deliveries;
CREATE TRIGGER trg_delivery_not_in_past BEFORE INSERT ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_not_in_past();

-- DB-20 catalogos
ALTER TABLE public.equipment_models DROP CONSTRAINT IF EXISTS equipment_models_tarifas_no_negativas;
ALTER TABLE public.equipment_models ADD CONSTRAINT equipment_models_tarifas_no_negativas
  CHECK (COALESCE(default_daily_rate,0) >= 0 AND COALESCE(default_weekly_rate,0) >= 0
     AND COALESCE(default_monthly_rate,0) >= 0 AND COALESCE(default_capacity_kg,0) >= 0) NOT VALID;
ALTER TABLE public.equipment_models VALIDATE CONSTRAINT equipment_models_tarifas_no_negativas;

ALTER TABLE public.parts_inventory DROP CONSTRAINT IF EXISTS parts_inventory_costos_no_negativos;
ALTER TABLE public.parts_inventory ADD CONSTRAINT parts_inventory_costos_no_negativos
  CHECK (unit_cost >= 0 AND min_stock_level >= 0 AND stock_quantity >= 0) NOT VALID;
ALTER TABLE public.parts_inventory VALIDATE CONSTRAINT parts_inventory_costos_no_negativos;

CREATE UNIQUE INDEX IF NOT EXISTS parts_inventory_sku_unique ON public.parts_inventory (sku) WHERE sku IS NOT NULL;

ALTER TABLE public.bank_accounts DROP CONSTRAINT IF EXISTS bank_accounts_clabe_formato;
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_clabe_formato
  CHECK (clabe IS NULL OR btrim(clabe) = '' OR clabe ~ '^[0-9]{18}$') NOT VALID;
ALTER TABLE public.bank_accounts VALIDATE CONSTRAINT bank_accounts_clabe_formato;

CREATE UNIQUE INDEX IF NOT EXISTS company_settings_singleton ON public.company_settings ((true));

ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_umbrales_no_negativos;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_umbrales_no_negativos
  CHECK (cxp_approval_threshold_mxn >= 0 AND cash_initial_balance >= 0 AND cash_safety_buffer >= 0) NOT VALID;
ALTER TABLE public.company_settings VALIDATE CONSTRAINT company_settings_umbrales_no_negativos;

ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_facturapi_mode_valido;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_facturapi_mode_valido
  CHECK (facturapi_mode IS NULL OR facturapi_mode IN ('test','live')) NOT VALID;
ALTER TABLE public.company_settings VALIDATE CONSTRAINT company_settings_facturapi_mode_valido;

-- DB-21 prospects
ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_stage_dominio;
ALTER TABLE public.prospects ADD CONSTRAINT prospects_stage_dominio
  CHECK (stage IN ('nuevo_prospecto','contactado','cotizacion_enviada','negociacion','cerrado_ganado','cerrado_perdido')) NOT VALID;
ALTER TABLE public.prospects VALIDATE CONSTRAINT prospects_stage_dominio;

ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_deal_value_no_negativo;
ALTER TABLE public.prospects ADD CONSTRAINT prospects_deal_value_no_negativo CHECK (deal_value IS NULL OR deal_value >= 0) NOT VALID;
ALTER TABLE public.prospects VALIDATE CONSTRAINT prospects_deal_value_no_negativo;

CREATE OR REPLACE FUNCTION public.validate_prospect_stage_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN RETURN NEW; END IF;
  IF OLD.stage IN ('cerrado_ganado','cerrado_perdido') THEN
    RAISE EXCEPTION 'Un prospecto % no puede cambiar de etapa (transicion a % no permitida)', OLD.stage, NEW.stage
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.stage = 'cerrado_ganado' AND OLD.stage <> 'negociacion' THEN
    RAISE EXCEPTION 'Solo se puede cerrar como ganado un prospecto en negociacion (etapa actual: %)', OLD.stage
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_prospect_stage_transition ON public.prospects;
CREATE TRIGGER trg_prospect_stage_transition BEFORE UPDATE OF stage ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.validate_prospect_stage_transition();

-- DB-22 cotizacion aceptada inmutable en montos
CREATE OR REPLACE FUNCTION public.lock_accepted_quote_amounts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'accepted' AND (
       NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.line_items IS DISTINCT FROM OLD.line_items
  ) THEN
    RAISE EXCEPTION 'No se pueden modificar los montos de una cotizacion aceptada. Rechazala y crea una nueva version.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lock_accepted_quote_amounts ON public.quotes;
CREATE TRIGGER trg_lock_accepted_quote_amounts BEFORE UPDATE OF subtotal, tax_amount, tax_rate, total, line_items ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.lock_accepted_quote_amounts();