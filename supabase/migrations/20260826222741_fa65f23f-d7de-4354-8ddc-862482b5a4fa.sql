-- FIX R4-03
CREATE OR REPLACE FUNCTION public.trg_payment_amount_mxn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_moneda text;
  v_tipo_cambio numeric;
  v_pay_currency text;
BEGIN
  SELECT i.moneda, i.tipo_cambio INTO v_moneda, v_tipo_cambio
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;
  v_moneda := upper(COALESCE(v_moneda, 'MXN'));
  v_pay_currency := upper(COALESCE(NEW.currency, v_moneda));

  IF v_pay_currency = 'MXN' THEN
    NEW.amount_mxn := ROUND(COALESCE(NEW.amount, 0), 2);
  ELSIF v_pay_currency <> v_moneda THEN
    RAISE EXCEPTION
      'Pago en % no coincide con la moneda de la factura (%) y no hay tipo de cambio para convertirlo',
      v_pay_currency, v_moneda
      USING ERRCODE = 'check_violation';
  ELSE
    NEW.amount_mxn := ROUND(
      COALESCE(NEW.amount, 0) * COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(v_tipo_cambio, 0)),
      2
    );
  END IF;
  RETURN NEW;
END;
$$;

-- FIX R4-10
CREATE OR REPLACE VIEW public.v_invoices_with_balance
WITH (security_invoker = true) AS
SELECT i.id, i.invoice_number, i.booking_id, i.customer_id, i.customer_name,
  i.line_items, i.subtotal, i.tax_rate, i.tax_amount, i.total, i.status,
  i.issued_at, i.due_date, i.paid_at, i.notes, i.created_at, i.updated_at,
  i.serie, i.folio, i.forma_pago, i.metodo_pago, i.uso_cfdi, i.moneda,
  i.tipo_cambio, i.receptor_rfc, i.receptor_razon_social,
  i.receptor_regimen_fiscal, i.receptor_domicilio_fiscal_cp, i.cfdi_uuid,
  i.cfdi_xml, i.cfdi_status, i.cancelled_at, i.cancellation_reason,
  i.quote_id, i.facturapi_invoice_id, i.billing_period_start,
  i.billing_period_end, i.cfdi_xml_url, i.cfdi_pdf_url, i.cfdi_error_message,
  i.cancellation_status, i.cancellation_motive, i.substitution_uuid,
  i.is_e2e, i.e2e_scope, i.global_periodicity, i.global_months, i.global_year,
  i.acuse_pdf_url, i.acuse_xml_url, i.facturapi_env,
  COALESCE(p.paid, 0::numeric) AS paid_amount,
  COALESCE(cn.credited, 0::numeric) AS credited_amount,
  GREATEST(i.total - COALESCE(p.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric) AS balance,
  CASE
    WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN round(i.total, 2)
    WHEN i.tipo_cambio IS NOT NULL AND i.tipo_cambio > 0 THEN round(i.total * i.tipo_cambio, 2)
    ELSE NULL
  END AS total_mxn,
  CASE
    WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN'
      THEN round(GREATEST(i.total - COALESCE(p.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric), 2)
    WHEN i.tipo_cambio IS NOT NULL AND i.tipo_cambio > 0
      THEN round(GREATEST(i.total - COALESCE(p.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric) * i.tipo_cambio, 2)
    ELSE NULL
  END AS balance_mxn,
  (upper(COALESCE(i.moneda, 'MXN')) <> 'MXN'
    AND (i.tipo_cambio IS NULL OR i.tipo_cambio <= 0)) AS fx_missing
FROM invoices i
LEFT JOIN (
  SELECT p.invoice_id,
    SUM(
      CASE
        WHEN upper(COALESCE(p.currency, ip.moneda, 'MXN')) = upper(COALESCE(ip.moneda, 'MXN'))
          THEN p.amount
        WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN'
          THEN p.amount / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(ip.tipo_cambio, 0)), 0)
        ELSE p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(ip.tipo_cambio, 0))
      END
    ) AS paid
  FROM payments p
  JOIN invoices ip ON ip.id = p.invoice_id
  GROUP BY p.invoice_id
) p ON p.invoice_id = i.id
LEFT JOIN (
  SELECT credit_notes.invoice_id, sum(credit_notes.total) AS credited
  FROM credit_notes
  WHERE credit_notes.cancellation_status <> 'accepted'::text
    AND credit_notes.status <> 'cancelled'::text
    AND credit_notes.cfdi_status = 'stamped'::text
  GROUP BY credit_notes.invoice_id
) cn ON cn.invoice_id = i.id;

GRANT SELECT ON public.v_invoices_with_balance TO authenticated, anon, service_role;

-- FIX R4-15 + R4-16 (versión final de sync_invoice_status_from_payments)
CREATE OR REPLACE FUNCTION public.sync_invoice_status_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_total numeric(14,2);
  v_status text;
  v_paid numeric(14,2);
  v_credited numeric(14,2);
  v_latest_date date;
  v_due date;
  v_target text;
  v_moneda text;
  v_tc numeric;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT total, status, due_date, moneda, tipo_cambio
    INTO v_total, v_status, v_due, v_moneda, v_tc
  FROM invoices WHERE id = v_invoice_id
  FOR UPDATE;
  IF v_total IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_status IN ('cancelled', 'draft') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_moneda := upper(COALESCE(v_moneda, 'MXN'));

  -- R4-15: pagos convertidos a la moneda de la factura (ver FIX R4-03).
  SELECT COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(p.currency, v_moneda)) = v_moneda THEN p.amount
        WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN'
          THEN p.amount / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0)), 0)
        ELSE p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0))
      END), 0), MAX(p.payment_date)
    INTO v_paid, v_latest_date
  FROM payments p WHERE p.invoice_id = v_invoice_id;

  -- N-21 / R4-15: criterio canonico de NC (mismo que la vista y la UI).
  SELECT COALESCE(SUM(total), 0) INTO v_credited
  FROM credit_notes
  WHERE invoice_id = v_invoice_id
    AND cfdi_status = 'stamped'
    AND status <> 'cancelled'
    AND cancellation_status IS DISTINCT FROM 'accepted';

  PERFORM set_config('app.payment_sync', 'on', true);

  IF v_paid >= v_total - v_credited - 0.005 AND v_paid > 0 THEN
    IF v_status <> 'paid' THEN
      UPDATE invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, public.today_mty())
        WHERE id = v_invoice_id;
    END IF;
  -- R4-16: cubierta al 100% por NC timbrada(s) => 'paid'.
  ELSIF v_paid = 0 AND v_credited >= v_total - 0.005 THEN
    IF v_status <> 'paid' THEN
      UPDATE invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, public.today_mty())
        WHERE id = v_invoice_id;
    END IF;
  ELSIF v_paid = 0 AND v_credited > 0 THEN
    IF v_status = 'paid' THEN
      UPDATE invoices SET status = 'sent', paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  ELSIF (v_paid + v_credited) > 0 THEN
    IF v_status <> 'partial' THEN
      UPDATE invoices SET status = 'partial', paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  ELSE
    v_target := CASE
      WHEN v_due IS NOT NULL AND v_due < public.today_mty() THEN 'overdue'
      ELSE 'sent'
    END;
    IF v_status <> v_target THEN
      UPDATE invoices SET status = v_target, paid_at = NULL
        WHERE id = v_invoice_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_payment_within_invoice_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv_total NUMERIC;
  inv_status TEXT;
  inv_moneda TEXT;
  inv_tc NUMERIC;
  total_paid NUMERIC;
  new_amount NUMERIC;
  credited NUMERIC;
  payable NUMERIC;
BEGIN
  SELECT total, status, moneda, tipo_cambio
    INTO inv_total, inv_status, inv_moneda, inv_tc
  FROM public.invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  IF inv_total IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found for payment', NEW.invoice_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF inv_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en facturas canceladas'
      USING ERRCODE = 'check_violation';
  END IF;

  inv_moneda := upper(COALESCE(inv_moneda, 'MXN'));

  SELECT COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(p.currency, inv_moneda)) = inv_moneda THEN p.amount
        WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN'
          THEN p.amount / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(inv_tc, 0)), 0)
        ELSE p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(inv_tc, 0))
      END), 0) INTO total_paid
  FROM public.payments p
  WHERE p.invoice_id = NEW.invoice_id
    AND (TG_OP = 'INSERT' OR p.id <> NEW.id);

  new_amount := CASE
    WHEN upper(COALESCE(NEW.currency, inv_moneda)) = inv_moneda THEN NEW.amount
    WHEN upper(COALESCE(NEW.currency, 'MXN')) = 'MXN'
      THEN NEW.amount / NULLIF(COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(inv_tc, 0)), 0)
    ELSE NEW.amount * COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(inv_tc, 0))
  END;
  IF new_amount IS NULL THEN
    RAISE EXCEPTION
      'No se puede verificar el sobrepago: falta tipo de cambio para convertir el pago (%) a la moneda de la factura (%)',
      upper(COALESCE(NEW.currency, 'MXN')), inv_moneda
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO credited
  FROM public.credit_notes
  WHERE invoice_id = NEW.invoice_id
    AND cfdi_status = 'stamped'
    AND status <> 'cancelled'
    AND cancellation_status IS DISTINCT FROM 'accepted';

  total_paid := total_paid + new_amount;
  payable := inv_total - credited;

  IF total_paid > payable THEN
    RAISE EXCEPTION
      'Sobrepago rechazado: la suma de pagos (%) excede el saldo facturable (%) despues de notas de credito',
      round(total_paid, 2), round(payable, 2)
      USING ERRCODE = 'check_violation',
            HINT = 'Reduce el monto del pago o cancela pagos previos antes de registrar uno nuevo.';
  END IF;

  RETURN NEW;
END;
$function$;

-- FIX R4-12
CREATE OR REPLACE FUNCTION public.convert_quote_to_bookings(p_quote_id uuid, p_assignments jsonb, p_recurring boolean DEFAULT false)
RETURNS TABLE(booking_id uuid, forklift_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote quotes%ROWTYPE; v_assignment jsonb; v_forklift_id uuid; v_model_id uuid;
  v_daily numeric; v_weekly numeric; v_monthly numeric; v_booking_id uuid; v_meta jsonb;
  v_slots jsonb; v_idx int;
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
  FOR v_assignment IN SELECT jsonb_array_elements(p_assignments) LOOP
    v_forklift_id := (v_assignment->>'forklift_id')::uuid;
    SELECT equipment_model_id INTO v_model_id FROM forklifts WHERE id = v_forklift_id;
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
    -- R4-12: sin paridad 1:1 para divisas sin TC.
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
$function$;