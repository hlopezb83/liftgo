-- FIX R6-04: approve_payment_intent con bloqueo de factura, conversion FX,
-- descuento de intents pendientes y criterio canonico de notas de credito.
CREATE OR REPLACE FUNCTION public.approve_payment_intent(p_intent_id uuid, p_payment_form_sat text DEFAULT '03'::text, p_review_notes text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_intent public.customer_payment_intents%ROWTYPE;
  v_payment_id uuid; v_invoice_customer uuid; v_invoice_currency text;
  v_invoice_total numeric; v_invoice_exchange numeric;
  v_paid numeric; v_credited numeric; v_pending numeric; v_balance numeric;
BEGIN
  IF NOT (public.has_role((select auth.uid()), 'admin'::app_role) OR public.has_role((select auth.uid()), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.customer_payment_intents
     SET status = 'approved'::payment_intent_status,
         review_notes = p_review_notes, reviewed_at = now(), reviewed_by = (select auth.uid())
   WHERE id = p_intent_id AND status = 'pending_review'::payment_intent_status
   RETURNING * INTO v_intent;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_pending' USING ERRCODE = 'P0001'; END IF;

  -- (a) bloqueo de la factura ANTES de calcular el saldo
  SELECT customer_id, COALESCE(moneda, 'MXN'), total, COALESCE(tipo_cambio, 1)
    INTO v_invoice_customer, v_invoice_currency, v_invoice_total, v_invoice_exchange
  FROM public.invoices WHERE id = v_intent.invoice_id
  FOR UPDATE;
  IF v_invoice_customer IS NULL THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0001'; END IF;
  IF v_invoice_customer <> v_intent.customer_id THEN
    RAISE EXCEPTION 'La factura del reporte no pertenece al cliente que lo envió' USING ERRCODE = 'check_violation';
  END IF;
  v_invoice_currency := upper(v_invoice_currency);

  -- (b) pagos convertidos a la moneda de la factura
  SELECT COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(p.currency, v_invoice_currency)) = v_invoice_currency THEN p.amount
        WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN'
          THEN p.amount / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_invoice_exchange, 0)), 0)
        WHEN v_invoice_currency = 'MXN'
          THEN p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_invoice_exchange, 0))
        ELSE p.amount
      END), 0)
    INTO v_paid
  FROM public.payments p WHERE p.invoice_id = v_intent.invoice_id;

  -- (d) criterio canonico de notas de credito
  SELECT COALESCE(SUM(total), 0) INTO v_credited FROM public.credit_notes
   WHERE invoice_id = v_intent.invoice_id
     AND cfdi_status = 'stamped'
     AND status <> 'cancelled'
     AND cancellation_status IS DISTINCT FROM 'accepted';

  -- (c) intents pendientes de revision descuentan saldo
  SELECT COALESCE(SUM(amount), 0) INTO v_pending
  FROM public.customer_payment_intents
   WHERE invoice_id = v_intent.invoice_id
     AND status = 'pending_review'::payment_intent_status
     AND id <> v_intent.id;

  v_balance := v_invoice_total - v_paid - v_credited - v_pending;
  IF v_intent.amount > v_balance + 0.01 THEN
    RAISE EXCEPTION 'El monto reportado (%) excede el saldo pendiente (%) de la factura', v_intent.amount, v_balance
      USING ERRCODE = 'check_violation';
  END IF;

  -- (e) moneda de la factura y exchange_rate NULL (no falsear el TC)
  INSERT INTO public.payments(
    invoice_id, amount, payment_date, payment_method, payment_form_sat,
    reference_number, notes, currency, exchange_rate
  ) VALUES (
    v_intent.invoice_id, v_intent.amount, v_intent.transfer_date,
    'transfer', COALESCE(p_payment_form_sat, '03'), v_intent.tracking_key,
    'Aprobado desde portal (intent ' || v_intent.id::text || ')',
    v_invoice_currency, NULL
  ) RETURNING id INTO v_payment_id;
  UPDATE public.customer_payment_intents SET payment_id = v_payment_id WHERE id = v_intent.id;
  RETURN v_payment_id;
END;
$function$;

-- FIX R6-09: validate_payment_intent_amount con conversion FX de pagos.
CREATE OR REPLACE FUNCTION public.validate_payment_intent_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric(14,2);
  v_moneda text;
  v_tc numeric;
  v_paid numeric(14,2);
  v_credited numeric(14,2);
  v_pending numeric(14,2);
  v_available numeric(14,2);
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'El monto del reporte de pago debe ser mayor a cero'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT i.total, upper(COALESCE(i.moneda, 'MXN')), i.tipo_cambio
    INTO v_total, v_moneda, v_tc
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada' USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(p.currency, v_moneda)) = v_moneda THEN p.amount
        WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN'
          THEN p.amount / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0)), 0)
        WHEN v_moneda = 'MXN'
          THEN p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(v_tc, 0))
        ELSE p.amount
      END), 0)
    INTO v_paid
  FROM public.payments p
  WHERE p.invoice_id = NEW.invoice_id;

  SELECT COALESCE(sum(cn.total), 0) INTO v_credited
  FROM public.credit_notes cn
  WHERE cn.invoice_id = NEW.invoice_id
    AND cn.cancellation_status IS DISTINCT FROM 'accepted'::text
    AND cn.status <> 'cancelled'::text
    AND cn.cfdi_status = 'stamped'::text;

  -- customer_payment_intents no tiene columna currency: los montos se
  -- reportan en la moneda de la factura, la conversion no aplica.
  SELECT COALESCE(sum(cpi.amount), 0) INTO v_pending
  FROM public.customer_payment_intents cpi
  WHERE cpi.invoice_id = NEW.invoice_id
    AND cpi.status = 'pending_review'
    AND cpi.id <> NEW.id;

  v_available := GREATEST(v_total - v_paid - v_credited, 0) - v_pending;

  IF NEW.amount > v_available THEN
    RAISE EXCEPTION 'El monto (%) excede el saldo disponible de la factura (%). Verifica el saldo o los pagos pendientes de revision.',
      NEW.amount, GREATEST(v_available, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- FIX R6-10: fallback al tipo de cambio de la factura en conciliacion.
CREATE OR REPLACE FUNCTION public.confirm_bank_match(
  p_line_id uuid,
  p_payment_id uuid DEFAULT NULL,
  p_supplier_payment_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line_amount     numeric(14,2);
  v_signed_amount   numeric(14,2);
  v_pay_amount      numeric(14,2);
  v_bank_account_id uuid;
  v_currency        text;
BEGIN
  IF NOT (public.has_role((select auth.uid()), 'admin'::app_role)
       OR public.has_role((select auth.uid()), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF (p_payment_id IS NULL AND p_supplier_payment_id IS NULL)
     OR (p_payment_id IS NOT NULL AND p_supplier_payment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'debe enviarse exactamente un pago';
  END IF;

  SELECT ABS(bsl.signed_amount), bsl.signed_amount, bsl.bank_account_id
    INTO v_line_amount, v_signed_amount, v_bank_account_id
  FROM public.bank_statement_lines bsl
  WHERE bsl.id = p_line_id
    AND bsl.status IN ('unmatched'::bank_line_status, 'suggested'::bank_line_status)
  FOR UPDATE;

  IF v_line_amount IS NULL THEN
    RAISE EXCEPTION 'linea inexistente o ya conciliada' USING ERRCODE = 'P0001';
  END IF;

  IF (v_signed_amount < 0 AND p_supplier_payment_id IS NULL)
     OR (v_signed_amount > 0 AND p_payment_id IS NULL) THEN
    RAISE EXCEPTION 'el signo del movimiento (%) no corresponde al tipo de pago',
      v_signed_amount USING ERRCODE = 'P0001';
  END IF;

  SELECT ba.currency INTO v_currency
  FROM public.bank_accounts ba WHERE ba.id = v_bank_account_id;
  v_currency := COALESCE(v_currency, 'MXN');

  IF p_payment_id IS NOT NULL THEN
    SELECT CASE
             WHEN COALESCE(p.currency, 'MXN') = v_currency THEN p.amount
             WHEN COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)) IS NULL THEN NULL
             WHEN COALESCE(p.currency, 'MXN') = 'MXN'
               THEN ROUND(p.amount / COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)), 2)
             ELSE ROUND(p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)), 2)
           END
      INTO v_pay_amount
      FROM public.payments p
      LEFT JOIN public.invoices i ON i.id = p.invoice_id
     WHERE p.id = p_payment_id;
  ELSE
    SELECT CASE
             WHEN COALESCE(sb.currency, 'MXN') = v_currency THEN sp.amount
             WHEN sb.exchange_rate IS NULL OR sb.exchange_rate <= 0 THEN NULL
             WHEN COALESCE(sb.currency, 'MXN') = 'MXN' THEN ROUND(sp.amount / sb.exchange_rate, 2)
             ELSE ROUND(sp.amount * sb.exchange_rate, 2)
           END
      INTO v_pay_amount
      FROM public.supplier_payments sp
      LEFT JOIN public.supplier_bills sb ON sb.id = sp.bill_id
     WHERE sp.id = p_supplier_payment_id;
  END IF;

  IF v_pay_amount IS NULL THEN
    RAISE EXCEPTION 'pago inexistente o sin tipo de cambio valido para convertir a %',
      v_currency USING ERRCODE = 'P0001';
  END IF;

  IF ABS(v_line_amount - v_pay_amount) > 0.01 THEN
    RAISE EXCEPTION 'el monto del pago (%) no coincide con el movimiento (%)',
      v_pay_amount, v_line_amount USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_statement_lines
     SET status = 'matched'::bank_line_status,
         matched_payment_id = p_payment_id,
         matched_supplier_payment_id = p_supplier_payment_id,
         suggested_payment_id = NULL,
         suggested_supplier_payment_id = NULL,
         matched_at = now(),
         matched_by = (select auth.uid())
   WHERE id = p_line_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_bank_match_candidates(
  p_line_id uuid,
  p_search text DEFAULT NULL::text,
  p_date_window integer DEFAULT 15,
  p_amount_tolerance numeric DEFAULT 0.01
)
RETURNS TABLE(
  id uuid,
  kind text,
  candidate_date date,
  amount numeric,
  reference text,
  label text,
  score integer,
  day_diff integer,
  exact_amount boolean,
  reference_hit boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line     public.bank_statement_lines%ROWTYPE;
  v_abs      numeric(14,2);
  v_text     text;
  v_search   text;
  v_currency text;
  v_window   integer := GREATEST(0, LEAST(COALESCE(p_date_window, 15), 120));
  v_tol      numeric := GREATEST(0.01, COALESCE(p_amount_tolerance, 0.01));
BEGIN
  IF NOT (public.has_role((select auth.uid()), 'admin'::app_role)
       OR public.has_role((select auth.uid()), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_line FROM public.bank_statement_lines WHERE bank_statement_lines.id = p_line_id;
  IF v_line.id IS NULL THEN
    RAISE EXCEPTION 'linea inexistente' USING ERRCODE = 'P0001';
  END IF;

  SELECT ba.currency INTO v_currency
  FROM public.bank_accounts ba WHERE ba.id = v_line.bank_account_id;
  v_currency := COALESCE(v_currency, 'MXN');

  v_abs  := ABS(v_line.signed_amount);
  v_text := lower(COALESCE(v_line.description, '') || ' ' || COALESCE(v_line.reference, ''));
  v_search := NULLIF(lower(btrim(COALESCE(p_search, ''))), '');

  IF v_line.signed_amount < 0 THEN
    RETURN QUERY
    WITH conv AS (
      SELECT
        sp.id,
        sp.payment_date,
        sp.reference,
        sp.amount,
        sb.bill_number,
        sb.supplier_id,
        CASE
          WHEN COALESCE(sb.currency, 'MXN') = v_currency THEN sp.amount
          WHEN sb.exchange_rate IS NULL OR sb.exchange_rate <= 0 THEN NULL
          WHEN COALESCE(sb.currency, 'MXN') = 'MXN' THEN ROUND(sp.amount / sb.exchange_rate, 2)
          ELSE ROUND(sp.amount * sb.exchange_rate, 2)
        END AS converted_amount
      FROM public.supplier_payments sp
      LEFT JOIN public.supplier_bills sb ON sb.id = sp.bill_id
    )
    SELECT
      c.id,
      'supplier_payment'::text,
      c.payment_date,
      c.converted_amount,
      c.reference,
      COALESCE(c.bill_number, '—') || ' · ' || COALESCE(s.name, 'Sin proveedor'),
      (60
        + GREATEST(0, 25 - ABS(c.payment_date - v_line.posted_date) * 8)
        + CASE WHEN c.reference IS NOT NULL AND btrim(c.reference) <> ''
                    AND position(lower(c.reference) IN v_text) > 0
               THEN 15 ELSE 0 END)::integer,
      ABS(c.payment_date - v_line.posted_date)::integer,
      ABS(c.converted_amount - v_abs) <= 0.01,
      (c.reference IS NOT NULL AND btrim(c.reference) <> ''
        AND position(lower(c.reference) IN v_text) > 0)
    FROM conv c
    LEFT JOIN public.suppliers s ON s.id = c.supplier_id
    WHERE c.converted_amount IS NOT NULL
      AND ABS(c.converted_amount - v_abs) <= v_tol
      AND ABS(c.payment_date - v_line.posted_date) <= v_window
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_statement_lines bsl
        WHERE bsl.matched_supplier_payment_id = c.id AND bsl.id <> p_line_id
      )
      AND (
        v_search IS NULL
        OR lower(COALESCE(c.reference, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(c.bill_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(s.name, '')) LIKE '%' || v_search || '%'
        OR CAST(c.amount AS text) LIKE '%' || v_search || '%'
      )
    ORDER BY 7 DESC, 8 ASC
    LIMIT 50;
  ELSE
    RETURN QUERY
    WITH conv AS (
      SELECT
        p.*,
        CASE
          WHEN COALESCE(p.currency, 'MXN') = v_currency THEN p.amount
          WHEN COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)) IS NULL THEN NULL
          WHEN COALESCE(p.currency, 'MXN') = 'MXN'
            THEN ROUND(p.amount / COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)), 2)
          ELSE ROUND(p.amount * COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)), 2)
        END AS converted_amount
      FROM public.payments p
      LEFT JOIN public.invoices i ON i.id = p.invoice_id
    )
    SELECT
      c.id,
      'payment'::text,
      c.payment_date,
      c.converted_amount,
      c.reference_number,
      COALESCE(i.invoice_number, '—') || ' · ' || COALESCE(i.customer_name, 'Sin cliente'),
      (60
        + GREATEST(0, 25 - ABS(c.payment_date - v_line.posted_date) * 8)
        + CASE WHEN c.reference_number IS NOT NULL AND btrim(c.reference_number) <> ''
                    AND position(lower(c.reference_number) IN v_text) > 0
               THEN 15 ELSE 0 END)::integer,
      ABS(c.payment_date - v_line.posted_date)::integer,
      ABS(c.converted_amount - v_abs) <= 0.01,
      (c.reference_number IS NOT NULL AND btrim(c.reference_number) <> ''
        AND position(lower(c.reference_number) IN v_text) > 0)
    FROM conv c
    LEFT JOIN public.invoices i ON i.id = c.invoice_id
    WHERE c.converted_amount IS NOT NULL
      AND ABS(c.converted_amount - v_abs) <= v_tol
      AND ABS(c.payment_date - v_line.posted_date) <= v_window
      AND NOT EXISTS (
        SELECT 1 FROM public.bank_statement_lines bsl
        WHERE bsl.matched_payment_id = c.id AND bsl.id <> p_line_id
      )
      AND (
        v_search IS NULL
        OR lower(COALESCE(c.reference_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(i.invoice_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(i.customer_name, '')) LIKE '%' || v_search || '%'
        OR CAST(c.amount AS text) LIKE '%' || v_search || '%'
      )
    ORDER BY 7 DESC, 8 ASC
    LIMIT 50;
  END IF;
END;
$function$;

-- FIX R6-15: no reportar pagos sobre facturas canceladas/borrador y
-- comprobante dentro de la carpeta de la factura.
DROP POLICY IF EXISTS "Customers create own payment intents" ON public.customer_payment_intents;
CREATE POLICY "Customers create own payment intents"
ON public.customer_payment_intents FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((select auth.uid()), 'customer'::app_role)
  AND customer_id = public.get_customer_id_for_user((select auth.uid()))
  AND status = 'pending_review'::payment_intent_status
  AND invoice_id IN (
    SELECT id FROM public.invoices
    WHERE customer_id = public.get_customer_id_for_user((select auth.uid()))
      AND status NOT IN ('cancelled', 'draft')
      AND cancellation_status IS DISTINCT FROM 'accepted'
  )
  AND (proof_url IS NULL OR (storage.foldername(proof_url))[1] = customer_id::text)
  AND (proof_url IS NULL OR (storage.foldername(proof_url))[2] = invoice_id::text)
);

-- FIX R6-14: la proteccion de comprobantes ya procesados aplica a todos los roles.
DROP POLICY IF EXISTS "Customers delete own pending proofs" ON storage.objects;
CREATE POLICY "Customers delete own pending proofs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR (storage.foldername(name))[1] = public.get_customer_id_for_user((select auth.uid()))::text
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_payment_intents cpi
    WHERE cpi.proof_url = storage.objects.name
      AND cpi.status <> 'pending_review'::payment_intent_status
  )
);

-- FIX R6-24: mimetype declarado obligatorio (sin default permisivo).
DROP POLICY IF EXISTS "Customers upload own proofs" ON storage.objects;
CREATE POLICY "Customers upload own proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = public.get_customer_id_for_user((select auth.uid()))::text
  AND metadata->>'mimetype' IN (
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp'
  )
);