-- =====================================================================
-- R9 · LOTE A (forward-only, idempotente)
-- R9-01 set_supplier_bill_approval_status: no-op debe comparar NEW.total
-- R9-03 get_customer_summary: universo/conversión canónica (fx_is_missing)
-- R9-10 create_recurring_invoice: fail-closed con fx_is_missing
-- =====================================================================

-- ---------------------------------------------------------------------
-- R9-01
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_supplier_bill_approval_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold NUMERIC(14,2);
  v_total_mxn NUMERIC(14,2);
  v_old_total_mxn NUMERIC(14,2);
  v_fx_missing boolean;
  v_old_fx_missing boolean;
  v_jwt_role text;
  v_has_payments boolean;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  -- R10-02: `current_user` es fiable aquí porque esta función NO es SECURITY
  -- DEFINER: PostgREST hace SET ROLE service_role para el rol de servicio.
  IF v_jwt_role = 'service_role'
     OR current_user = 'service_role'
     OR current_setting('app.cxp_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT cxp_approval_threshold_mxn INTO v_threshold
    FROM public.company_settings ORDER BY created_at ASC LIMIT 1;
  v_threshold := COALESCE(v_threshold, 10000);

  v_fx_missing := public.fx_is_missing(NEW.currency, NEW.exchange_rate);

  v_total_mxn := CASE
    WHEN v_fx_missing THEN NULL
    WHEN upper(COALESCE(NEW.currency, 'MXN')) = 'MXN' THEN COALESCE(NEW.total, 0)
    ELSE COALESCE(NEW.total, 0) * NEW.exchange_rate
  END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Una factura de proveedor no puede nacer en estado de aprobacion %. Registrala pendiente y usa approve_supplier_bill / reject_supplier_bill.', NEW.approval_status
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_fx_missing OR v_total_mxn > v_threshold THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;

    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.approval_notes := NULL;

    RETURN NEW;
  END IF;

  v_old_fx_missing := public.fx_is_missing(OLD.currency, OLD.exchange_rate);
  v_old_total_mxn := CASE
    WHEN v_old_fx_missing THEN NULL
    WHEN upper(COALESCE(OLD.currency, 'MXN')) = 'MXN' THEN COALESCE(OLD.total, 0)
    ELSE COALESCE(OLD.total, 0) * OLD.exchange_rate
  END;

  -- R9-01: cuando el TC falta, AMBOS total_mxn son NULL y la comparación
  -- `IS NOT DISTINCT FROM` los daba por equivalentes: un cambio real de
  -- NEW.total pasaba de largo (sin guard de pagos y sin recálculo). Se compara
  -- explícitamente el total en la moneda del documento.
  IF v_total_mxn IS NOT DISTINCT FROM v_old_total_mxn
     AND NEW.total IS NOT DISTINCT FROM OLD.total
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND v_fx_missing IS NOT DISTINCT FROM v_old_fx_missing THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.supplier_payments sp WHERE sp.bill_id = NEW.id
  ) INTO v_has_payments;

  IF v_has_payments THEN
    RAISE EXCEPTION 'No se puede cambiar el monto, la moneda o el tipo de cambio: la factura ya tiene pagos registrados.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.approval_status = 'approved' THEN
    RAISE EXCEPTION 'No se puede cambiar el monto de una factura ya aprobada. Recházala y solicita reaprobación antes de editarla.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- R9-08 / R10-01 (sin cambios): rechazada siempre vuelve a 'pending'.
  IF OLD.approval_status IN ('pending', 'not_required', 'rejected') THEN
    IF v_fx_missing OR v_total_mxn > v_threshold OR OLD.approval_status = 'rejected' THEN
      NEW.approval_status := 'pending';
    ELSE
      NEW.approval_status := 'not_required';
    END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  RETURN NEW;
END $function$;

-- ---------------------------------------------------------------------
-- R9-03
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_summary(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bookings jsonb;
  v_invoices jsonb;
  v_totals   jsonb;
BEGIN
  IF NOT (
    has_role((select auth.uid()), 'admin'::app_role) OR
    has_role((select auth.uid()), 'administrativo'::app_role) OR
    has_role((select auth.uid()), 'auditor'::app_role) OR
    has_role((select auth.uid()), 'dispatcher'::app_role) OR
    has_role((select auth.uid()), 'ventas'::app_role) OR
    (has_role((select auth.uid()), 'customer'::app_role)
      AND p_customer_id = get_customer_id_for_user((select auth.uid())))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id, 'booking_number', b.booking_number,
    'start_date', b.start_date, 'end_date', b.end_date, 'status', b.status,
    'forklift', jsonb_build_object('name', f.name, 'model', f.model)
  ) ORDER BY b.start_date DESC), '[]'::jsonb)
  INTO v_bookings
  FROM bookings b
  LEFT JOIN forklifts f ON f.id = b.forklift_id
  WHERE b.customer_id = p_customer_id;

  -- B5-02: los borradores no son documentos emitidos; se excluyen del listado.
  -- R9-03: ya no se fabrica `tipo_cambio = 1` cuando falta; se expone el valor
  -- real y una bandera `fx_missing` con la regla canónica.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'invoice_number', i.invoice_number, 'issued_at', i.issued_at,
    'due_date', i.due_date, 'total', i.total, 'status', i.status,
    'currency', COALESCE(i.moneda, 'MXN'),
    'tipo_cambio', i.tipo_cambio,
    'fx_missing', public.fx_is_missing(i.moneda, i.tipo_cambio)
  ) ORDER BY i.issued_at DESC), '[]'::jsonb)
  INTO v_invoices
  FROM invoices i
  WHERE i.customer_id = p_customer_id
    AND i.status NOT IN ('draft', 'cancelled');

  -- R9-03: un único universo y una única regla de conversión. Los documentos
  -- con FX faltante se EXCLUYEN de los cuatro importes (nunca 1:1) y se
  -- reportan aparte en `fx_missing_count`, de modo que
  -- total_paid <= total_invoiced siga siendo internamente consistente.
  WITH scoped AS (
    SELECT v.*,
           public.fx_is_missing(v.moneda, v.tipo_cambio) AS fx_missing,
           CASE WHEN upper(COALESCE(v.moneda, 'MXN')) = 'MXN'
                THEN 1::numeric ELSE v.tipo_cambio END AS rate
    FROM public.v_invoices_with_balance v
    WHERE v.customer_id = p_customer_id
      AND v.status NOT IN ('draft', 'cancelled')
  ),
  usable AS (
    SELECT * FROM scoped WHERE NOT fx_missing
  )
  SELECT jsonb_build_object(
    'total_invoiced',  COALESCE((SELECT SUM(ROUND(u.total * u.rate, 2)) FROM usable u), 0),
    'total_paid',      COALESCE((SELECT SUM(ROUND(u.paid_amount * u.rate, 2)) FROM usable u), 0),
    'total_credited',  COALESCE((SELECT SUM(ROUND(u.credited_amount * u.rate, 2)) FROM usable u), 0),
    'outstanding_revenue', COALESCE((
      SELECT SUM(ROUND(u.balance * u.rate, 2)) FROM usable u
      WHERE u.status IN ('sent', 'partial', 'overdue')
        AND COALESCE(u.cancellation_status, '') <> 'accepted'
    ), 0),
    'fx_missing_count', COALESCE((SELECT COUNT(*) FROM scoped s WHERE s.fx_missing), 0)
  ) INTO v_totals;

  RETURN jsonb_build_object(
    'bookings', v_bookings,
    'invoices', v_invoices,
    'totals',   v_totals
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- R9-10
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_recurring_invoice(
  p_booking_ids uuid[], p_customer_id uuid, p_customer_name text, p_line_items jsonb,
  p_subtotal numeric, p_tax_rate numeric, p_tax_amount numeric, p_total numeric,
  p_billing_period_start date, p_billing_period_end date, p_receptor_rfc text,
  p_receptor_razon_social text, p_receptor_regimen_fiscal text,
  p_receptor_domicilio_fiscal_cp text, p_uso_cfdi text,
  p_moneda text DEFAULT 'MXN'::text, p_tipo_cambio numeric DEFAULT 1)
RETURNS TABLE(invoice_id uuid, invoice_number text, already_existed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo')) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_booking_ids requerido';
  END IF;

  IF v_uso_cfdi IS NULL THEN
    RAISE EXCEPTION 'El cliente no tiene uso de CFDI capturado; captúralo antes de generar la factura recurrente.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- R9-10: fail-closed con la regla canónica. El DEFAULT 1 del parámetro no
  -- puede crear una factura en divisa con tipo de cambio ficticio.
  IF v_moneda = 'MXN' THEN
    v_tipo_cambio := 1;
  ELSIF public.fx_is_missing(v_moneda, p_tipo_cambio) THEN
    RAISE EXCEPTION 'Tipo de cambio inválido para facturar en % (se requiere un valor mayor a 0 y distinto de 1)', v_moneda
      USING ERRCODE = 'check_violation';
  ELSE
    v_tipo_cambio := p_tipo_cambio;
  END IF;

  FOR v_bid IN
    SELECT unnest(p_booking_ids) ORDER BY 1
  LOOP
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
    UPDATE public.bookings
       SET last_billed_date = p_billing_period_end
     WHERE id = ANY(p_booking_ids);
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

    IF v_existing_id IS NULL THEN
      RAISE;
    END IF;

    UPDATE public.bookings
       SET last_billed_date = p_billing_period_end
     WHERE id = ANY(p_booking_ids);

    invoice_id := v_existing_id;
    invoice_number := v_existing_number;
    already_existed := true;
    RETURN NEXT;
    RETURN;
  END;

  UPDATE public.bookings
     SET last_billed_date = p_billing_period_end
   WHERE id = ANY(p_booking_ids);

  invoice_id := v_invoice_id;
  invoice_number := v_invoice_number;
  already_existed := false;
  RETURN NEXT;
END;
$function$;