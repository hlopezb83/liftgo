-- ============================================================
-- Bloque 1 de auditoría: integridad de facturación, cotizaciones,
-- asignaciones y pagos. Sólo DDL; no modifica datos existentes.
-- ============================================================

-- ---------- 1) save_invoice_with_bookings (4 args) ----------
CREATE OR REPLACE FUNCTION public.save_invoice_with_bookings(
  p_invoice jsonb,
  p_booking_ids uuid[] DEFAULT '{}'::uuid[],
  p_invoice_id uuid DEFAULT NULL::uuid,
  p_expected_version integer DEFAULT NULL::integer
)
RETURNS SETOF invoices
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_id uuid;
  v_updated integer := 0;
  v_current_version integer;
  v_ids uuid[] := COALESCE(p_booking_ids, '{}'::uuid[]);
  v_count integer := COALESCE(array_length(p_booking_ids, 1), 0);
  v_booking_id uuid := NULLIF(p_invoice->>'booking_id', '')::uuid;
  v_customer_id uuid := NULLIF(p_invoice->>'customer_id', '')::uuid;
  v_quote_id uuid := NULLIF(p_invoice->>'quote_id', '')::uuid;
  v_allow_unlink boolean := COALESCE((p_invoice->>'allow_unlink_bookings')::boolean, false);
  v_existing public.invoices%ROWTYPE;
  v_existing_links uuid[];
  v_bad text;
  v_missing integer;
BEGIN
  PERFORM public.lock_bookings_for_billing(v_ids);

  -- ---- Coherencia de identidad (booking / customer / quote) ----
  IF v_count > 0 THEN
    SELECT count(*) INTO v_missing
      FROM unnest(v_ids) AS nb(id)
     WHERE NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = nb.id);
    IF v_missing > 0 THEN
      RAISE EXCEPTION 'Alguna de las reservas seleccionadas no existe.' USING ERRCODE = '23514';
    END IF;

    IF v_booking_id IS NOT NULL AND NOT (v_booking_id = ANY (v_ids)) THEN
      RAISE EXCEPTION 'La reserva principal de la factura no está incluida en las reservas ligadas.'
        USING ERRCODE = '23514';
    END IF;

    IF v_customer_id IS NOT NULL THEN
      SELECT b.booking_number INTO v_bad
        FROM unnest(v_ids) AS nb(id)
        JOIN public.bookings b ON b.id = nb.id
       WHERE b.customer_id IS NOT NULL AND b.customer_id <> v_customer_id
       LIMIT 1;
      IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'La reserva % pertenece a otro cliente; no puede facturarse en esta factura.', v_bad
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF v_quote_id IS NOT NULL THEN
      SELECT b.booking_number INTO v_bad
        FROM unnest(v_ids) AS nb(id)
        JOIN public.bookings b ON b.id = nb.id
       WHERE b.quote_id IS NOT NULL AND b.quote_id <> v_quote_id
       LIMIT 1;
      IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'La reserva % proviene de otra cotización distinta a la de la factura.', v_bad
          USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF v_booking_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = v_booking_id) THEN
      RAISE EXCEPTION 'La reserva de la factura no existe.' USING ERRCODE = '23514';
    END IF;
    IF v_customer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.id = v_booking_id AND b.customer_id IS NOT NULL AND b.customer_id <> v_customer_id
    ) THEN
      RAISE EXCEPTION 'La reserva de la factura pertenece a otro cliente.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_invoice_id IS NULL THEN
    INSERT INTO public.invoices (
      invoice_number, booking_id, customer_id, customer_name, quote_id,
      line_items, subtotal, tax_rate, tax_amount, total,
      due_date, issued_at, billing_period_start, billing_period_end, notes,
      serie, folio, forma_pago, metodo_pago, uso_cfdi, moneda, tipo_cambio,
      receptor_rfc, receptor_razon_social, receptor_regimen_fiscal,
      receptor_domicilio_fiscal_cp, global_periodicity, global_months, global_year
    ) VALUES (
      public.next_draft_invoice_number(),
      v_booking_id,
      v_customer_id,
      p_invoice->>'customer_name',
      v_quote_id,
      COALESCE(p_invoice->'line_items', '[]'::jsonb),
      COALESCE((p_invoice->>'subtotal')::numeric, 0),
      COALESCE((p_invoice->>'tax_rate')::numeric, 0),
      COALESCE((p_invoice->>'tax_amount')::numeric, 0),
      COALESCE((p_invoice->>'total')::numeric, 0),
      NULLIF(p_invoice->>'due_date', '')::date,
      COALESCE(NULLIF(p_invoice->>'issued_at', '')::date, public.today_mty()),
      NULLIF(p_invoice->>'billing_period_start', '')::date,
      NULLIF(p_invoice->>'billing_period_end', '')::date,
      p_invoice->>'notes',
      p_invoice->>'serie',
      p_invoice->>'folio',
      p_invoice->>'forma_pago',
      p_invoice->>'metodo_pago',
      p_invoice->>'uso_cfdi',
      p_invoice->>'moneda',
      (p_invoice->>'tipo_cambio')::numeric,
      p_invoice->>'receptor_rfc',
      p_invoice->>'receptor_razon_social',
      p_invoice->>'receptor_regimen_fiscal',
      p_invoice->>'receptor_domicilio_fiscal_cp',
      p_invoice->>'global_periodicity',
      p_invoice->>'global_months',
      (p_invoice->>'global_year')::integer
    )
    RETURNING id INTO v_id;
  ELSE
    v_id := p_invoice_id;

    SELECT * INTO v_existing FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Factura no encontrada o sin permisos para modificarla.' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(array_agg(ib.booking_id ORDER BY ib.booking_id), '{}'::uuid[])
      INTO v_existing_links
      FROM public.invoice_bookings ib
     WHERE ib.invoice_id = p_invoice_id;

    -- Factura emitida o timbrada: los enlaces de identidad son inmutables.
    IF v_existing.status IS DISTINCT FROM 'draft' OR v_existing.cfdi_uuid IS NOT NULL THEN
      IF v_booking_id IS DISTINCT FROM v_existing.booking_id
         OR v_customer_id IS DISTINCT FROM v_existing.customer_id
         OR v_quote_id IS DISTINCT FROM v_existing.quote_id THEN
        RAISE EXCEPTION 'La factura % ya fue emitida o timbrada; sus vínculos (reserva, cliente, cotización) no pueden cambiar. Cancélala para corregirlos.', v_existing.invoice_number
          USING ERRCODE = '23514';
      END IF;
      IF (SELECT COALESCE(array_agg(x ORDER BY x), '{}'::uuid[]) FROM unnest(v_ids) AS t(x))
         IS DISTINCT FROM v_existing_links THEN
        RAISE EXCEPTION 'La factura % ya fue emitida o timbrada; no se pueden cambiar sus reservas ligadas. Cancélala para corregirlas.', v_existing.invoice_number
          USING ERRCODE = '23514';
      END IF;
    END IF;

    -- No permitir vaciar asociaciones sin una ruta de negocio explícita.
    IF v_count = 0 AND array_length(v_existing_links, 1) IS NOT NULL AND NOT v_allow_unlink THEN
      RAISE EXCEPTION 'La factura % tiene reservas ligadas; no se pueden quitar todas sin una acción explícita de desvinculación.', v_existing.invoice_number
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.invoices SET
      booking_id = v_booking_id,
      customer_id = v_customer_id,
      customer_name = p_invoice->>'customer_name',
      quote_id = v_quote_id,
      line_items = COALESCE(p_invoice->'line_items', '[]'::jsonb),
      subtotal = COALESCE((p_invoice->>'subtotal')::numeric, 0),
      tax_rate = COALESCE((p_invoice->>'tax_rate')::numeric, 0),
      tax_amount = COALESCE((p_invoice->>'tax_amount')::numeric, 0),
      total = COALESCE((p_invoice->>'total')::numeric, 0),
      due_date = NULLIF(p_invoice->>'due_date', '')::date,
      issued_at = COALESCE(NULLIF(p_invoice->>'issued_at', '')::date, issued_at),
      billing_period_start = NULLIF(p_invoice->>'billing_period_start', '')::date,
      billing_period_end = NULLIF(p_invoice->>'billing_period_end', '')::date,
      notes = p_invoice->>'notes',
      serie = p_invoice->>'serie',
      folio = p_invoice->>'folio',
      forma_pago = p_invoice->>'forma_pago',
      metodo_pago = p_invoice->>'metodo_pago',
      uso_cfdi = p_invoice->>'uso_cfdi',
      moneda = p_invoice->>'moneda',
      tipo_cambio = (p_invoice->>'tipo_cambio')::numeric,
      receptor_rfc = p_invoice->>'receptor_rfc',
      receptor_razon_social = p_invoice->>'receptor_razon_social',
      receptor_regimen_fiscal = p_invoice->>'receptor_regimen_fiscal',
      receptor_domicilio_fiscal_cp = p_invoice->>'receptor_domicilio_fiscal_cp',
      global_periodicity = p_invoice->>'global_periodicity',
      global_months = p_invoice->>'global_months',
      global_year = (p_invoice->>'global_year')::integer
    WHERE id = p_invoice_id
      AND (p_expected_version IS NULL OR version = p_expected_version);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      SELECT i.version INTO v_current_version FROM public.invoices i WHERE i.id = p_invoice_id;
      IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
        RAISE EXCEPTION 'stale_write: otro usuario modificó esta factura; recarga y vuelve a intentar'
          USING ERRCODE = '55000';
      END IF;
      RAISE EXCEPTION 'No se pudo guardar la factura (sin permisos o bloqueada por otra regla).'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM public.sync_invoice_bookings(v_id, v_ids);

  RETURN QUERY SELECT * FROM public.invoices i WHERE i.id = v_id;
END;
$fn$;

-- Validación de asignaciones de venta también en UPDATE.
CREATE OR REPLACE FUNCTION public.guard_invoice_sale_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_missing integer;
BEGIN
  IF NEW.quote_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('app.e2e_seed', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- En UPDATE sólo revisamos cuando se (re)vincula la cotización o cuando la
  -- factura sale de borrador; así no bloqueamos cancelaciones ni pagos.
  IF TG_OP = 'UPDATE'
     AND NEW.quote_id IS NOT DISTINCT FROM OLD.quote_id
     AND NOT (OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'cancelled')) THEN
    RETURN NEW;
  END IF;

  v_missing := public.quote_sale_units_unassigned(NEW.quote_id);

  IF v_missing > 0 THEN
    RAISE EXCEPTION
      'No se puede facturar: la cotización de venta tiene % equipo(s) sin asignar', v_missing
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_invoice_sale_assignment ON public.invoices;
CREATE TRIGGER trg_guard_invoice_sale_assignment
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_sale_assignment();

-- ---------- 2) create_recurring_invoice ----------
CREATE OR REPLACE FUNCTION public.create_recurring_invoice(
  p_booking_ids uuid[], p_customer_id uuid, p_customer_name text, p_line_items jsonb,
  p_subtotal numeric, p_tax_rate numeric, p_tax_amount numeric, p_total numeric,
  p_billing_period_start date, p_billing_period_end date, p_receptor_rfc text,
  p_receptor_razon_social text, p_receptor_regimen_fiscal text,
  p_receptor_domicilio_fiscal_cp text, p_uso_cfdi text,
  p_moneda text DEFAULT 'MXN'::text, p_tipo_cambio numeric DEFAULT 1
)
RETURNS TABLE(invoice_id uuid, invoice_number text, already_existed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_existing_id uuid;
  v_existing_number text;
  v_lock_key bigint;
  v_bid uuid;
  v_is_single boolean := array_length(p_booking_ids, 1) = 1;
  v_moneda text := COALESCE(NULLIF(upper(btrim(p_moneda)), ''), 'MXN');
  v_tipo_cambio numeric;
  v_uso_cfdi text := NULLIF(btrim(p_uso_cfdi), '');
  v_bad text;
  v_missing integer;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo')) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_booking_ids requerido';
  END IF;

  IF p_billing_period_start IS NULL OR p_billing_period_end IS NULL THEN
    RAISE EXCEPTION 'El periodo de facturación (inicio y fin) es obligatorio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_billing_period_start > p_billing_period_end THEN
    RAISE EXCEPTION 'El fin del periodo (%) no puede ser anterior al inicio (%).',
      p_billing_period_end, p_billing_period_start USING ERRCODE = 'check_violation';
  END IF;

  -- Invariantes de reservas ANTES de tocar last_billed_date.
  SELECT count(*) INTO v_missing
    FROM unnest(p_booking_ids) AS nb(id)
   WHERE NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = nb.id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Alguna reserva del periodo recurrente no existe.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id
   WHERE p_customer_id IS NOT NULL
     AND b.customer_id IS DISTINCT FROM p_customer_id
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % pertenece a otro cliente; no puede incluirse en esta factura recurrente.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id
   WHERE b.status IN ('cancelled', 'completed')
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % está cancelada o completada; no es facturable.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id
   WHERE COALESCE(b.recurring_billing, false) = false
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva % no tiene facturación recurrente activa.', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.booking_number INTO v_bad
    FROM unnest(p_booking_ids) AS nb(id)
    JOIN public.bookings b ON b.id = nb.id
   WHERE p_billing_period_start < b.start_date
      OR (b.end_date IS NOT NULL AND p_billing_period_end > b.end_date)
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'El periodo % – % queda fuera del rango de la reserva %.',
      p_billing_period_start, p_billing_period_end, v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_uso_cfdi IS NULL THEN
    RAISE EXCEPTION 'El cliente no tiene uso de CFDI capturado; captúralo antes de generar la factura recurrente.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_moneda = 'MXN' THEN
    v_tipo_cambio := 1;
  ELSIF public.fx_is_missing(v_moneda, p_tipo_cambio) THEN
    RAISE EXCEPTION 'Tipo de cambio inválido para facturar en % (se requiere un valor mayor a 0 y distinto de 1)', v_moneda
      USING ERRCODE = 'check_violation';
  ELSE
    v_tipo_cambio := p_tipo_cambio;
  END IF;

  FOR v_bid IN SELECT unnest(p_booking_ids) ORDER BY 1 LOOP
    v_lock_key := ('x' || substr(md5(v_bid::text), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  SELECT i.id, i.invoice_number
    INTO v_existing_id, v_existing_number
  FROM public.invoice_bookings ib
  JOIN public.invoices i ON i.id = ib.invoice_id
  WHERE ib.booking_id = ANY(p_booking_ids)
    AND i.billing_period_start = p_billing_period_start
    AND i.billing_period_end = p_billing_period_end
    AND i.status <> 'cancelled'
    AND (i.cfdi_status IS NULL OR i.cfdi_status <> 'cancelled')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.bookings SET last_billed_date = p_billing_period_end WHERE id = ANY(p_booking_ids);
    invoice_id := v_existing_id;
    invoice_number := v_existing_number;
    already_existed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT public.next_draft_invoice_number() INTO v_invoice_number;
  IF v_invoice_number IS NULL THEN
    v_invoice_number := 'FAC-AUTO-' || extract(epoch FROM now())::bigint::text;
  END IF;

  BEGIN
    INSERT INTO public.invoices (
      invoice_number, booking_id, customer_id, customer_name, line_items,
      subtotal, tax_rate, tax_amount, total, status, due_date,
      billing_period_start, billing_period_end,
      receptor_rfc, receptor_razon_social, receptor_regimen_fiscal,
      receptor_domicilio_fiscal_cp, uso_cfdi,
      forma_pago, metodo_pago, moneda, tipo_cambio
    ) VALUES (
      v_invoice_number,
      CASE WHEN v_is_single THEN p_booking_ids[1] ELSE NULL END,
      p_customer_id, p_customer_name, p_line_items,
      p_subtotal, p_tax_rate, p_tax_amount, p_total, 'draft', p_billing_period_end,
      p_billing_period_start, p_billing_period_end,
      p_receptor_rfc, p_receptor_razon_social, p_receptor_regimen_fiscal,
      p_receptor_domicilio_fiscal_cp, v_uso_cfdi,
      '99', 'PPD', v_moneda, v_tipo_cambio
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_bookings (invoice_id, booking_id)
    SELECT v_invoice_id, unnest(p_booking_ids);
  EXCEPTION WHEN unique_violation THEN
    SELECT i.id, i.invoice_number
      INTO v_existing_id, v_existing_number
    FROM public.invoice_bookings ib
    JOIN public.invoices i ON i.id = ib.invoice_id
    WHERE ib.booking_id = ANY(p_booking_ids)
      AND i.billing_period_start = p_billing_period_start
      AND i.billing_period_end = p_billing_period_end
      AND i.status <> 'cancelled'
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      SELECT i.id, i.invoice_number
        INTO v_existing_id, v_existing_number
      FROM public.invoices i
      WHERE i.booking_id = ANY(p_booking_ids)
        AND i.billing_period_start = p_billing_period_start
        AND i.billing_period_end = p_billing_period_end
        AND i.status <> 'cancelled'
      LIMIT 1;
    END IF;

    IF v_existing_id IS NULL THEN RAISE; END IF;

    UPDATE public.bookings SET last_billed_date = p_billing_period_end WHERE id = ANY(p_booking_ids);

    invoice_id := v_existing_id;
    invoice_number := v_existing_number;
    already_existed := true;
    RETURN NEXT;
    RETURN;
  END;

  UPDATE public.bookings SET last_billed_date = p_billing_period_end WHERE id = ANY(p_booking_ids);

  invoice_id := v_invoice_id;
  invoice_number := v_invoice_number;
  already_existed := false;
  RETURN NEXT;
END;
$fn$;

-- ---------- 3) convert_quote_to_bookings ----------
CREATE OR REPLACE FUNCTION public.convert_quote_to_bookings(
  p_quote_id uuid, p_assignments jsonb, p_recurring boolean DEFAULT false
)
RETURNS TABLE(booking_id uuid, forklift_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_quote quotes%ROWTYPE; v_assignment jsonb; v_forklift_id uuid; v_model_id uuid;
  v_daily numeric; v_weekly numeric; v_monthly numeric; v_booking_id uuid; v_meta jsonb;
  v_slots jsonb; v_idx int; v_slot_count int; v_assign_count int; v_distinct int;
  v_deleted timestamptz;
BEGIN
  IF NOT (
    has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'administrativo'::app_role) OR
    has_role((select auth.uid()), 'dispatcher'::app_role) OR has_role((select auth.uid()), 'ventas'::app_role)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotización no encontrada'; END IF;
  IF COALESCE(v_quote.quote_type, 'rental') <> 'rental' THEN
    RAISE EXCEPTION 'Sólo las cotizaciones de renta pueden convertirse en reservas (tipo: %)', v_quote.quote_type
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Solo se pueden convertir cotizaciones aceptadas (estado actual: %)', v_quote.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE quote_id = p_quote_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'La cotización ya fue convertida';
  END IF;
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < public.today_mty() THEN
    RAISE EXCEPTION 'Cotización vencida: actualiza precios y vigencia antes de convertir';
  END IF;
  IF jsonb_typeof(p_assignments) <> 'array' OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una asignación';
  END IF;

  SELECT COALESCE(jsonb_agg(elem ORDER BY ord, n), '[]'::jsonb)
    INTO v_slots
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(v_quote.rental_meta) = 'array'
              THEN v_quote.rental_meta ELSE '[]'::jsonb END
       ) WITH ORDINALITY AS t(elem, ord)
  CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE((t.elem->>'quantity')::int, 1), 1)) AS g(n);

  v_slot_count := jsonb_array_length(v_slots);
  v_assign_count := jsonb_array_length(p_assignments);
  IF v_slot_count > 0 AND v_assign_count <> v_slot_count THEN
    RAISE EXCEPTION 'La cotización requiere % unidad(es) y se recibieron % asignación(es).',
      v_slot_count, v_assign_count USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(DISTINCT (a->>'forklift_id')) INTO v_distinct
    FROM jsonb_array_elements(p_assignments) AS a;
  IF v_distinct <> v_assign_count THEN
    RAISE EXCEPTION 'Hay unidades repetidas en las asignaciones.' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_assignment IN SELECT jsonb_array_elements(p_assignments) LOOP
    v_forklift_id := (v_assignment->>'forklift_id')::uuid;
    SELECT equipment_model_id, deleted_at INTO v_model_id, v_deleted
      FROM forklifts WHERE id = v_forklift_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Montacargas no encontrado: %', v_forklift_id USING ERRCODE = 'check_violation';
    END IF;
    IF v_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'El montacargas % está archivado; no puede asignarse.', v_forklift_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_meta := NULL;
    IF v_model_id IS NOT NULL THEN
      SELECT s.elem, s.ord - 1 INTO v_meta, v_idx
        FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS s(elem, ord)
       WHERE (s.elem->>'modelId')::uuid = v_model_id
       ORDER BY s.ord
       LIMIT 1;
      IF v_meta IS NOT NULL THEN
        v_slots := v_slots - v_idx;
      END IF;
    END IF;

    IF v_slot_count > 0 AND v_meta IS NULL THEN
      RAISE EXCEPTION 'El montacargas % no corresponde a ningún modelo cotizado disponible.', v_forklift_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_meta IS NOT NULL THEN
      v_daily := COALESCE((v_meta->>'dailyRate')::numeric, 0);
      v_weekly := COALESCE((v_meta->>'weeklyRate')::numeric, 0);
      v_monthly := COALESCE((v_meta->>'monthlyRate')::numeric, 0);
    ELSE
      v_daily := 0; v_weekly := 0; v_monthly := 0;
    END IF;

    v_booking_id := public.create_booking(
      v_forklift_id, v_quote.customer_id, v_quote.customer_name, NULL,
      v_quote.start_date, v_quote.end_date, p_recurring, p_quote_id
    );
    UPDATE public.bookings
       SET daily_rate = COALESCE(NULLIF(v_daily, 0), daily_rate),
           weekly_rate = COALESCE(NULLIF(v_weekly, 0), weekly_rate),
           monthly_rate = COALESCE(NULLIF(v_monthly, 0), monthly_rate),
           currency = COALESCE(v_quote.currency, 'MXN'),
           tipo_cambio = COALESCE(NULLIF(v_quote.tipo_cambio, 0),
                          CASE WHEN COALESCE(v_quote.currency, 'MXN') = 'MXN' THEN 1 END)
     WHERE id = v_booking_id;
    RETURN QUERY SELECT v_booking_id, v_forklift_id;
  END LOOP;

  UPDATE public.quotes SET status = 'converted' WHERE id = p_quote_id;
END;
$fn$;

-- ---------- 4) create_booking ----------
CREATE OR REPLACE FUNCTION public.create_booking(
  p_forklift_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text,
  p_customer_contact text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date, p_recurring_billing boolean DEFAULT false,
  p_quote_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_booking_id uuid;
  v_booking_number text;
  v_current_status text;
  v_quote public.quotes%ROWTYPE;
  v_deleted_at timestamptz;
  v_model_id uuid;
  v_expected_units integer;
  v_existing integer;
  v_buffer interval := make_interval(days => public.maintenance_buffer_days());
BEGIN
  IF public.has_role((select auth.uid()), 'admin'::app_role) THEN
    NULL;
  ELSIF public.has_role((select auth.uid()), 'administrativo'::app_role)
     OR public.has_role((select auth.uid()), 'dispatcher'::app_role)
     OR public.has_role((select auth.uid()), 'ventas'::app_role) THEN
    IF p_quote_id IS NULL THEN
      RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
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

  SELECT equipment_model_id INTO v_model_id FROM public.forklifts WHERE id = p_forklift_id;

  IF p_quote_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cotización no encontrada';
    END IF;
    IF COALESCE(v_quote.quote_type, 'rental') <> 'rental' THEN
      RAISE EXCEPTION 'La cotización % no es de renta; no puede generar reservas.', p_quote_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_quote.status NOT IN ('accepted', 'converted') THEN
      RAISE EXCEPTION 'La cotización debe estar aceptada por el cliente para crear la reserva (estado actual: %).', v_quote.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_customer_id IS DISTINCT FROM v_quote.customer_id THEN
      RAISE EXCEPTION 'El cliente de la reserva no coincide con el de la cotización.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF (v_quote.start_date IS NOT NULL AND p_start_date <> v_quote.start_date)
       OR (v_quote.end_date IS NOT NULL AND p_end_date <> v_quote.end_date) THEN
      RAISE EXCEPTION 'Las fechas de la reserva no coinciden con las de la cotización (% – %).',
        v_quote.start_date, v_quote.end_date USING ERRCODE = 'check_violation';
    END IF;
    IF v_quote.forklift_id IS NOT NULL AND v_quote.forklift_id <> p_forklift_id THEN
      RAISE EXCEPTION 'La cotización especifica otra unidad; no puede reservarse este montacargas.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_quote.forklift_id IS NULL AND jsonb_typeof(v_quote.rental_meta) = 'array'
       AND jsonb_array_length(v_quote.rental_meta) > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_quote.rental_meta) AS m
         WHERE NULLIF(m->>'modelId','')::uuid IS NOT DISTINCT FROM v_model_id
      ) THEN
        RAISE EXCEPTION 'El modelo del montacargas no corresponde a los modelos cotizados.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_quote.forklift_id IS NULL AND v_quote.equipment_model_id IS NOT NULL
          AND v_model_id IS DISTINCT FROM v_quote.equipment_model_id THEN
      RAISE EXCEPTION 'El modelo del montacargas no corresponde al modelo cotizado.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- No más reservas vigentes que unidades cotizadas.
    SELECT GREATEST(COALESCE(SUM(GREATEST(COALESCE((m->>'quantity')::int, 1), 1)), 1), 1)
      INTO v_expected_units
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_quote.rental_meta) = 'array'
                  THEN v_quote.rental_meta ELSE '[]'::jsonb END) AS m;

    SELECT count(*) INTO v_existing
      FROM public.bookings b
     WHERE b.quote_id = p_quote_id AND b.status <> 'cancelled';
    IF v_existing >= v_expected_units THEN
      RAISE EXCEPTION 'La cotización ya tiene % reserva(s) vigente(s) para % unidad(es) cotizada(s).',
        v_existing, v_expected_units USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El cliente seleccionado está archivado o no existe';
  END IF;

  SELECT status, deleted_at
    INTO v_current_status, v_deleted_at
    FROM public.forklifts
   WHERE id = p_forklift_id
   FOR UPDATE;
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Montacargas no encontrado';
  END IF;
  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'El montacargas está archivado; restáuralo antes de reservarlo'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_current_status IN ('maintenance', 'out_of_service', 'retired', 'sold') THEN
    RAISE EXCEPTION 'El montacargas no está disponible (estado: %)', v_current_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
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
    SELECT 1 FROM public.bookings b
     WHERE b.forklift_id = p_forklift_id
       AND b.status NOT IN ('cancelled', 'completed')
       AND daterange(b.start_date, b.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'El montacargas ya está reservado en ese rango de fechas'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (
        SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
          FROM public.maintenance_logs ml
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
    SELECT 1 FROM public.maintenance_logs ml
     WHERE ml.forklift_id = p_forklift_id
       AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
       AND ml.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El montacargas tiene una orden de trabajo activa; no se puede reservar'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bookings.booking_number'));
  v_booking_number := public.next_booking_number();
  PERFORM set_config('app.booking_rpc', 'on', true);
  INSERT INTO public.bookings (
    forklift_id, customer_id, customer_name, customer_contact,
    start_date, end_date, recurring_billing, status, booking_number, quote_id
  ) VALUES (
    p_forklift_id, p_customer_id, p_customer_name, p_customer_contact,
    p_start_date, p_end_date, p_recurring_billing, 'confirmed', v_booking_number, p_quote_id
  )
  RETURNING id INTO v_booking_id;
  PERFORM set_config('app.booking_rpc', 'off', true);
  RETURN v_booking_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.booking_rpc', 'off', true);
  RAISE;
END;
$fn$;

-- ---------- 5) assign_forklift_to_sale_quote ----------
CREATE OR REPLACE FUNCTION public.assign_forklift_to_sale_quote(
  p_quote_id uuid, p_forklift_ids uuid[], p_line_indices integer[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_idx int;
  v_fid uuid;
  v_prev text;
  v_deleted_at timestamptz;
  v_quote public.quotes%ROWTYPE;
  v_bad_line int;
  v_distinct int;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_forklift_ids IS NULL OR p_line_indices IS NULL
     OR array_length(p_forklift_ids, 1) IS NULL
     OR array_length(p_forklift_ids, 1) <> array_length(p_line_indices, 1) THEN
    RAISE EXCEPTION 'Las listas de unidades y líneas deben tener la misma longitud'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotización no encontrada: %', p_quote_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_quote.quote_type <> 'sale' THEN
    RAISE EXCEPTION 'La cotización % no es de venta (tipo: %)', p_quote_id, v_quote.quote_type
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'La cotización debe estar aceptada por el cliente para asignar unidades (estado actual: %).', v_quote.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Unidades repetidas en la petición.
  SELECT count(DISTINCT f) INTO v_distinct FROM unnest(p_forklift_ids) AS f;
  IF v_distinct <> array_length(p_forklift_ids, 1) THEN
    RAISE EXCEPTION 'Hay unidades repetidas en la asignación.' USING ERRCODE = 'check_violation';
  END IF;

  -- Unidades ya asignadas a alguna cotización.
  IF EXISTS (
    SELECT 1 FROM public.quote_assigned_forklifts
     WHERE forklift_id = ANY(p_forklift_ids)
  ) THEN
    RAISE EXCEPTION 'Alguna de las unidades ya está asignada a una cotización de venta.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Líneas válidas y cupo por línea, ANTES de marcar nada como vendido.
  WITH lines AS (
    SELECT (t.ord - 1)::int AS line_index,
           ceil(coalesce(nullif((t.item->>'quantity')::numeric, 0), 1))::int AS required
      FROM public.quotes q
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(q.line_items, '[]'::jsonb))
           WITH ORDINALITY AS t(item, ord)
     WHERE q.id = p_quote_id
       AND coalesce(t.item->>'description', '') ~* '-\s*Venta de equipo$'
  ), req AS (
    SELECT li AS line_index, count(*)::int AS pedidas
      FROM unnest(p_line_indices) AS li
     GROUP BY li
  ), cur AS (
    SELECT line_index, count(*)::int AS asignadas
      FROM public.quote_assigned_forklifts
     WHERE quote_id = p_quote_id
     GROUP BY line_index
  )
  SELECT r.line_index INTO v_bad_line
    FROM req r
    LEFT JOIN lines l ON l.line_index = r.line_index
    LEFT JOIN cur c ON c.line_index = r.line_index
   WHERE l.line_index IS NULL
      OR r.pedidas + coalesce(c.asignadas, 0) > l.required
   ORDER BY r.line_index
   LIMIT 1;

  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'La línea % de la cotización no existe o ya no admite más unidades.', v_bad_line
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.forklift_rpc', 'on', true);

  FOR v_idx IN 1 .. array_length(p_forklift_ids, 1) LOOP
    v_fid := p_forklift_ids[v_idx];

    SELECT status, deleted_at INTO v_prev, v_deleted_at
      FROM public.forklifts WHERE id = v_fid FOR UPDATE;
    IF v_prev IS NULL THEN
      RAISE EXCEPTION 'Montacargas no encontrado: %', v_fid USING ERRCODE = 'check_violation';
    END IF;
    IF v_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'El montacargas % está archivado; restáuralo antes de asignarlo a una venta', v_fid
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_prev IN ('maintenance', 'out_of_service') THEN
      RAISE EXCEPTION 'El montacargas % está en mantenimiento o fuera de servicio; no puede venderse', v_fid
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.forklift_id = v_fid
         AND b.status = 'confirmed'
         AND b.start_date <= public.today_mty()
         AND (b.end_date IS NULL OR b.end_date >= public.today_mty())
    ) THEN
      RAISE EXCEPTION 'El montacargas % tiene una reserva vigente; complétala o cancélala antes de venderlo', v_fid
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_prev = 'sold' THEN
      RAISE EXCEPTION 'El montacargas % ya está vendido', v_fid USING ERRCODE = 'check_violation';
    END IF;
    IF public.has_open_rental(v_fid) THEN
      RAISE EXCEPTION 'La unidad tiene una renta activa; completa la devolución antes de venderla o darla de baja'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.quote_assigned_forklifts (quote_id, forklift_id, line_index)
    VALUES (p_quote_id, v_fid, p_line_indices[v_idx]);

    UPDATE public.forklifts
       SET status = 'sold', updated_at = now()
     WHERE id = v_fid;

    INSERT INTO public.status_logs (forklift_id, from_status, to_status, note)
    VALUES (v_fid, v_prev, 'sold',
            'Asignado a cotización de venta ' || p_quote_id::text);
  END LOOP;
END;
$fn$;

-- ---------- 6) Pagos a proveedores ----------
CREATE OR REPLACE FUNCTION public.register_supplier_payment(
  p_bill_id uuid, p_amount numeric, p_payment_date date DEFAULT today_mty(),
  p_payment_method text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text,
  p_reference text DEFAULT NULL::text, p_receipt_url text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_balance NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_id      UUID;
  v_batch_id UUID;
BEGIN
  IF NOT (has_role((select auth.uid()),'admin') OR has_role((select auth.uid()),'administrativo')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  SELECT balance, status, approval_status INTO v_balance, v_status, v_approval
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'No se puede pagar una factura en borrador';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede pagar una factura cancelada';
  END IF;
  IF v_approval NOT IN ('approved', 'not_required') THEN
    RAISE EXCEPTION 'La factura no está aprobada para pago (estado de aprobación: %)', v_approval;
  END IF;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente (saldo: %)', v_balance;
  END IF;

  SELECT i.batch_id INTO v_batch_id
    FROM public.supplier_payment_batch_items i
    JOIN public.supplier_payment_batches b ON b.id = i.batch_id
   WHERE i.bill_id = p_bill_id
   ORDER BY b.created_at DESC
   LIMIT 1;

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by, batch_id
  ) VALUES (
    p_bill_id, COALESCE(p_payment_date, public.today_mty()), p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, (select auth.uid()), v_batch_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.register_supplier_payment(
  p_bill_id uuid, p_amount numeric, p_payment_date date DEFAULT today_mty(),
  p_payment_method text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text,
  p_reference text DEFAULT NULL::text, p_receipt_url text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text, p_batch_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_balance NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_id      UUID;
  v_batch_id UUID;
BEGIN
  IF NOT (has_role((select auth.uid()),'admin') OR has_role((select auth.uid()),'administrativo')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;

  SELECT balance, status, approval_status INTO v_balance, v_status, v_approval
    FROM public.supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'No se puede pagar una factura en borrador';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede pagar una factura cancelada';
  END IF;
  IF v_approval NOT IN ('approved', 'not_required') THEN
    RAISE EXCEPTION 'La factura no está aprobada para pago (estado de aprobación: %)', v_approval;
  END IF;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente (saldo: %)', v_balance;
  END IF;

  IF p_batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.supplier_payment_batch_items
     WHERE batch_id = p_batch_id AND bill_id = p_bill_id
  ) THEN
    RAISE EXCEPTION 'El lote % no contiene la factura %', p_batch_id, p_bill_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_batch_id := p_batch_id;
  IF v_batch_id IS NULL THEN
    SELECT i.batch_id INTO v_batch_id
      FROM public.supplier_payment_batch_items i
      JOIN public.supplier_payment_batches b ON b.id = i.batch_id
     WHERE i.bill_id = p_bill_id
     ORDER BY b.created_at DESC
     LIMIT 1;
  END IF;

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by, batch_id
  ) VALUES (
    p_bill_id, COALESCE(p_payment_date, public.today_mty()), p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, (select auth.uid()), v_batch_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.create_supplier_payment_batch(p_items jsonb, p_notes text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
    IF v_bill.status = 'draft' THEN
      RAISE EXCEPTION 'La factura % está en borrador; no puede incluirse en un lote de pago', v_bill.bill_number
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_bill.status = 'cancelled' THEN
      RAISE EXCEPTION 'La factura % está cancelada; no puede incluirse en un lote de pago', v_bill.bill_number
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_bill.approval_status NOT IN ('approved', 'not_required') THEN
      RAISE EXCEPTION 'La factura % no está aprobada', v_bill.bill_number;
    END IF;
    IF v_bill.payment_in_progress_at IS NOT NULL THEN
      RAISE EXCEPTION 'La factura % ya está en un lote de pago en curso', v_bill.bill_number
        USING ERRCODE = 'check_violation';
    END IF;
    -- Sin tolerancia por redondeo: el lote no puede exceder el saldo real,
    -- porque después register_supplier_payment rechazaría ese pago.
    IF v_amount > v_bill.balance THEN
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
$fn$;

CREATE OR REPLACE FUNCTION public.create_supplier_payment_batch(
  p_bill_ids uuid[], p_scheduled_for date, p_payment_method text, p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_batch_id uuid; v_bill_id uuid; v_bill public.supplier_bills%ROWTYPE; v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT (public.has_role(v_user_id, 'admin'::app_role) OR public.has_role(v_user_id, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_bill_ids IS NULL OR array_length(p_bill_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_bill_ids cannot be empty';
  END IF;

  INSERT INTO public.supplier_payment_batches (scheduled_for, payment_method, notes, created_by)
  VALUES (p_scheduled_for, p_payment_method, p_notes, v_user_id) RETURNING id INTO v_batch_id;

  FOREACH v_bill_id IN ARRAY p_bill_ids LOOP
    SELECT * INTO v_bill FROM public.supplier_bills WHERE id = v_bill_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'bill % not found', v_bill_id; END IF;
    IF v_bill.status = 'draft' THEN
      RAISE EXCEPTION 'bill % está en borrador; no puede incluirse en un lote', v_bill.bill_number;
    END IF;
    IF v_bill.status = 'cancelled' THEN
      RAISE EXCEPTION 'bill % está cancelada; no puede incluirse en un lote', v_bill.bill_number;
    END IF;
    IF v_bill.approval_status NOT IN ('approved', 'not_required') THEN
      RAISE EXCEPTION 'bill % no está aprobada', v_bill.bill_number;
    END IF;
    IF v_bill.balance <= 0 THEN RAISE EXCEPTION 'bill % no tiene saldo pendiente', v_bill.bill_number; END IF;
    IF v_bill.payment_in_progress_at IS NOT NULL THEN
      RAISE EXCEPTION 'bill % ya está en otro lote de pago en proceso', v_bill.bill_number;
    END IF;

    UPDATE public.supplier_bills SET payment_in_progress_at = now() WHERE id = v_bill.id;

    INSERT INTO public.supplier_payment_batch_items (
      batch_id, bill_id, supplier_id, bill_number, supplier_name,
      bank_name, clabe, account_number, amount, currency
    )
    SELECT v_batch_id, v_bill.id, v_bill.supplier_id, v_bill.bill_number, s.name,
           sba.bank_name, sba.clabe, sba.account_number, v_bill.balance, v_bill.currency
      FROM public.suppliers s
      LEFT JOIN public.supplier_bank_accounts sba ON sba.supplier_id = s.id AND sba.is_primary = true
     WHERE s.id = v_bill.supplier_id;
  END LOOP;

  RETURN v_batch_id;
END;
$fn$;

-- ---------- 7) booking_extensions: la factura ligada debe cobrar la extensión ----------
CREATE OR REPLACE FUNCTION public.enforce_extension_invoice_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.invoice_id IS NOT DISTINCT FROM OLD.invoice_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La factura de la extensión no existe.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La reserva de la extensión no existe.' USING ERRCODE = '23514';
  END IF;

  IF v_invoice.status = 'cancelled'
     OR COALESCE(v_invoice.cfdi_status, '') = 'cancelled' THEN
    RAISE EXCEPTION 'La factura % está cancelada; no puede cobrar la extensión.', v_invoice.invoice_number
      USING ERRCODE = '23514';
  END IF;

  IF v_invoice.booking_id IS DISTINCT FROM NEW.booking_id
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id = v_invoice.id AND ib.booking_id = NEW.booking_id
     ) THEN
    RAISE EXCEPTION 'La factura % no corresponde a la reserva de esta extensión.', v_invoice.invoice_number
      USING ERRCODE = '23514';
  END IF;

  IF v_booking.customer_id IS NOT NULL
     AND v_invoice.customer_id IS NOT NULL
     AND v_invoice.customer_id <> v_booking.customer_id THEN
    RAISE EXCEPTION 'La factura % pertenece a otro cliente.', v_invoice.invoice_number
      USING ERRCODE = '23514';
  END IF;

  -- Debe cobrar algo y, si tiene periodo, cubrir el fin de la extensión.
  IF COALESCE(v_invoice.total, 0) <= 0 THEN
    RAISE EXCEPTION 'La factura % no tiene importe; no puede cobrar la extensión.', v_invoice.invoice_number
      USING ERRCODE = '23514';
  END IF;
  IF v_invoice.billing_period_start IS NOT NULL AND v_invoice.billing_period_end IS NOT NULL
     AND (v_invoice.billing_period_end < NEW.new_end_date
          OR v_invoice.billing_period_start > NEW.new_end_date) THEN
    RAISE EXCEPTION 'El periodo de la factura % no cubre la extensión hasta %.',
      v_invoice.invoice_number, NEW.new_end_date USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_extension_invoice_link ON public.booking_extensions;
CREATE TRIGGER trg_extension_invoice_link
BEFORE INSERT OR UPDATE OF invoice_id ON public.booking_extensions
FOR EACH ROW EXECUTE FUNCTION public.enforce_extension_invoice_link();