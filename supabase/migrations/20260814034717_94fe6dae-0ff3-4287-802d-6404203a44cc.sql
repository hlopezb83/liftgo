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
  v_balance numeric(14,2);
  v_latest_date date;
  v_due date;
  v_target text;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT total, status, due_date INTO v_total, v_status, v_due
  FROM invoices WHERE id = v_invoice_id
  FOR UPDATE;
  IF v_total IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_status IN ('cancelled', 'draft') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0), MAX(payment_date)
    INTO v_paid, v_latest_date
  FROM payments WHERE invoice_id = v_invoice_id;

  SELECT COALESCE(SUM(total), 0) INTO v_credited
  FROM credit_notes
  WHERE invoice_id = v_invoice_id AND status = 'stamped';

  v_balance := round(v_total - v_paid - v_credited, 2);

  PERFORM set_config('app.payment_sync', 'on', true);

  IF v_balance <= 0.01 THEN
    IF v_status <> 'paid' THEN
      UPDATE invoices SET status = 'paid', paid_at = COALESCE(v_latest_date, public.today_mty())
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

CREATE OR REPLACE FUNCTION public.sync_invoice_status_from_credit_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.sync_invoice_status_from_payments();
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_invoice_from_credit_notes ON public.credit_notes;
CREATE TRIGGER trg_sync_invoice_from_credit_notes
AFTER INSERT OR DELETE OR UPDATE OF status, total ON public.credit_notes
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_status_from_credit_notes();

CREATE OR REPLACE FUNCTION public.enforce_payment_within_invoice_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv_total NUMERIC;
  inv_status TEXT;
  total_paid NUMERIC;
  credited NUMERIC;
  payable NUMERIC;
BEGIN
  SELECT total, status INTO inv_total, inv_status
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

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.payments
  WHERE invoice_id = NEW.invoice_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  SELECT COALESCE(SUM(total), 0) INTO credited
  FROM public.credit_notes
  WHERE invoice_id = NEW.invoice_id AND status = 'stamped';

  total_paid := total_paid + NEW.amount;
  payable := inv_total - credited;

  IF total_paid > payable + 0.01 THEN
    RAISE EXCEPTION
      'Sobrepago rechazado: la suma de pagos (%.2f) excede el saldo facturable (%.2f) despues de notas de credito',
      total_paid, payable
      USING ERRCODE = 'check_violation',
            HINT = 'Reduce el monto del pago o cancela pagos previos antes de registrar uno nuevo.';
  END IF;

  RETURN NEW;
END;
$function$;