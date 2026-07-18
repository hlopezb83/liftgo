
-- BL-002 refuerzo: rechazar amounts no positivos.
ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);

-- DI-005: sync atómico de invoice.status desde el historial real de payments.
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
  v_balance numeric(14,2);
  v_latest_date date;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT total, status INTO v_total, v_status
  FROM invoices WHERE id = v_invoice_id
  FOR UPDATE;
  IF v_total IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0), MAX(payment_date)
    INTO v_paid, v_latest_date
  FROM payments WHERE invoice_id = v_invoice_id;

  v_balance := round(v_total - v_paid, 2);

  -- No tocar facturas canceladas o borrador desde este trigger.
  IF v_status IN ('cancelled', 'draft') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_balance <= 0 AND v_status <> 'paid' THEN
    UPDATE invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, CURRENT_DATE)
      WHERE id = v_invoice_id;
  ELSIF v_balance > 0 AND v_paid > 0 AND v_status <> 'partial' THEN
    UPDATE invoices SET status = 'partial', paid_at = NULL
      WHERE id = v_invoice_id;
  ELSIF v_paid = 0 AND v_status <> 'sent' THEN
    UPDATE invoices SET status = 'sent', paid_at = NULL
      WHERE id = v_invoice_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS sync_invoice_status_from_payments_trg ON public.payments;
CREATE TRIGGER sync_invoice_status_from_payments_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_status_from_payments();
