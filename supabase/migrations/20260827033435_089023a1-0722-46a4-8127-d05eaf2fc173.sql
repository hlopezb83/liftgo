-- R5-12: se bloquea la fila de la factura (FOR UPDATE) antes de calcular el
-- saldo, serializando intents concurrentes sobre la misma factura.
CREATE OR REPLACE FUNCTION public.validate_payment_intent_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_credited numeric(14,2);
  v_pending numeric(14,2);
  v_available numeric(14,2);
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'El monto del reporte de pago debe ser mayor a cero'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT i.total INTO v_total
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada' USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT COALESCE(sum(p.amount), 0) INTO v_paid
  FROM public.payments p
  WHERE p.invoice_id = NEW.invoice_id;

  SELECT COALESCE(sum(cn.total), 0) INTO v_credited
  FROM public.credit_notes cn
  WHERE cn.invoice_id = NEW.invoice_id
    AND cn.cancellation_status <> 'accepted'::text
    AND cn.status <> 'cancelled'::text
    AND cn.cfdi_status = 'stamped'::text;

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