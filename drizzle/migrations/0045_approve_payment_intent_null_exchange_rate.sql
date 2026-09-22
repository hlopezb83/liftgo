-- Multiempresa · 0045: corrección puntual de public.approve_payment_intent.
--
-- La 0040 introdujo el guard organizacional correcto, pero además cambió el
-- valor insertado en payments.exchange_rate de NULL a
-- COALESCE(NULLIF(v_invoice_exchange, 0), 1). El pago derivado del portal se
-- registra SIEMPRE en la moneda de la factura, así que un tipo de cambio
-- explícito inventa un TC que nadie capturó y rompe el contrato previo
-- (r_fix32 R6-04). Esta migración restituye NULL sin tocar nada más.
--
-- No se modifica 0040 porque ya está desplegada.
CREATE OR REPLACE FUNCTION public.approve_payment_intent(p_intent_id uuid, p_payment_form_sat text DEFAULT '03'::text, p_review_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_intent public.customer_payment_intents%ROWTYPE;
  v_payment_id uuid; v_invoice_customer uuid; v_invoice_currency text;
  v_invoice_total numeric; v_invoice_exchange numeric;
  v_paid numeric; v_credited numeric; v_pending numeric; v_balance numeric;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.customer_payment_intents
     SET status = 'approved'::payment_intent_status,
         review_notes = p_review_notes, reviewed_at = now(), reviewed_by = v_uid
   WHERE id = p_intent_id
     AND organization_id = v_org
     AND status = 'pending_review'::payment_intent_status
   RETURNING * INTO v_intent;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_pending' USING ERRCODE = 'P0001'; END IF;

  -- (a) bloqueo de la factura ANTES de calcular el saldo
  SELECT customer_id, COALESCE(moneda, 'MXN'), total, COALESCE(tipo_cambio, 1)
    INTO v_invoice_customer, v_invoice_currency, v_invoice_total, v_invoice_exchange
  FROM public.invoices
  WHERE id = v_intent.invoice_id AND organization_id = v_org
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
  FROM public.payments p
  WHERE p.invoice_id = v_intent.invoice_id AND p.organization_id = v_org;

  -- (d) criterio canonico de notas de credito
  SELECT COALESCE(SUM(total), 0) INTO v_credited FROM public.credit_notes
   WHERE invoice_id = v_intent.invoice_id
     AND organization_id = v_org
     AND cfdi_status = 'stamped'
     AND status <> 'cancelled'
     AND cancellation_status IS DISTINCT FROM 'accepted';

  -- (c) intents pendientes de revision descuentan saldo
  SELECT COALESCE(SUM(amount), 0) INTO v_pending
  FROM public.customer_payment_intents
   WHERE invoice_id = v_intent.invoice_id
     AND organization_id = v_org
     AND status = 'pending_review'::payment_intent_status
     AND id <> v_intent.id;

  v_balance := v_invoice_total - v_paid - v_credited - v_pending;
  IF v_intent.amount > v_balance + 0.01 THEN
    RAISE EXCEPTION 'El monto reportado (%) excede el saldo pendiente (%) de la factura', v_intent.amount, v_balance
      USING ERRCODE = 'check_violation';
  END IF;

  -- (e) el pago se registra en la moneda de la factura: exchange_rate queda
  -- NULL para no inventar un tipo de cambio que nadie capturó.
  INSERT INTO public.payments(
    invoice_id, amount, payment_date, payment_method, payment_form_sat,
    reference_number, notes, currency, exchange_rate, organization_id
  ) VALUES (
    v_intent.invoice_id, v_intent.amount, v_intent.transfer_date,
    'transfer', COALESCE(p_payment_form_sat, '03'), v_intent.tracking_key,
    'Aprobado desde portal (intent ' || v_intent.id::text || ')',
    v_invoice_currency, NULL, v_org
  ) RETURNING id INTO v_payment_id;

  UPDATE public.customer_payment_intents
     SET payment_id = v_payment_id
   WHERE id = v_intent.id AND organization_id = v_org;

  RETURN v_payment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_payment_intent(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_payment_intent(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_payment_intent(uuid, text, text) IS
  'Multiempresa 0045: conserva el guard 0040 (rol + membresia interna + organization_id = current_internal_organization_id()) y restituye exchange_rate NULL en el pago derivado, porque se registra en la moneda de la factura.';
