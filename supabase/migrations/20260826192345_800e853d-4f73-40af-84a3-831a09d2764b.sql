-- FIX N-47: feedback_reports — longitudes y reporter_type derivado del rol real
ALTER TABLE public.feedback_reports
  ADD CONSTRAINT feedback_reports_title_length
    CHECK (char_length(btrim(title)) BETWEEN 3 AND 300),
  ADD CONSTRAINT feedback_reports_description_length
    CHECK (char_length(btrim(description)) BETWEEN 10 AND 5000);

CREATE OR REPLACE FUNCTION public.set_feedback_reporter_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reporter_id IS NULL THEN
    RAISE EXCEPTION 'reporter_id es requerido' USING ERRCODE = 'not_null_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = NEW.reporter_id
      AND ur.role = 'customer'::public.app_role
  ) THEN
    NEW.reporter_type := 'customer';
  ELSE
    NEW.reporter_type := 'internal';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_feedback_reporter_type() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_feedback_reports_set_reporter_type ON public.feedback_reports;
CREATE TRIGGER trg_feedback_reports_set_reporter_type
  BEFORE INSERT ON public.feedback_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_feedback_reporter_type();

-- FIX N-48: validar monto de customer_payment_intents contra el saldo real
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
  WHERE i.id = NEW.invoice_id;
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

REVOKE ALL ON FUNCTION public.validate_payment_intent_amount() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_cpi_validate_amount ON public.customer_payment_intents;
CREATE TRIGGER trg_cpi_validate_amount
  BEFORE INSERT ON public.customer_payment_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_intent_amount();