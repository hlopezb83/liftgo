-- M-15: tolerancia solo para MARCAR pagado; sobrepago rechazado sin +0.01.

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

  PERFORM set_config('app.payment_sync', 'on', true);

  -- M-15: la tolerancia (0.005) solo aplica para MARCAR 'paid'.
  IF v_paid >= v_total - v_credited - 0.005 THEN
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

  -- M-15: sin tolerancia de +0.01: cualquier exceso estricto se rechaza.
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

COMMENT ON FUNCTION public.enforce_payment_within_invoice_total() IS
  'BL-11/M-15: bloquea invoices FOR UPDATE y rechaza pagos cuya suma exceda invoice.total - credit_notes (sin tolerancia de sobrepago).';

CREATE OR REPLACE FUNCTION public.register_supplier_payment(
  p_bill_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE,
  p_payment_method text DEFAULT NULL, p_bank_account text DEFAULT NULL,
  p_reference text DEFAULT NULL, p_receipt_url text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_approval public.supplier_bill_approval_status;
  v_id      UUID;
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
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede pagar una factura cancelada';
  END IF;
  IF v_approval = 'pending' THEN
    RAISE EXCEPTION 'La factura requiere aprobación antes de pagar';
  END IF;
  IF v_approval = 'rejected' THEN
    RAISE EXCEPTION 'La factura fue rechazada y no puede pagarse';
  END IF;
  -- M-15: sin tolerancia de +0.01 en el rechazo de sobrepago.
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'El monto excede el saldo pendiente (saldo: %)', v_balance;
  END IF;

  INSERT INTO public.supplier_payments (
    bill_id, payment_date, amount, payment_method, bank_account,
    reference, receipt_url, notes, created_by
  ) VALUES (
    p_bill_id, p_payment_date, p_amount, p_payment_method, p_bank_account,
    p_reference, p_receipt_url, p_notes, (select auth.uid())
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.recalc_supplier_bill(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total   NUMERIC(14,2);
  v_paid    NUMERIC(14,2);
  v_status  public.supplier_bill_status;
  v_due     DATE;
  v_current public.supplier_bill_status;
BEGIN
  SELECT total, status, due_date INTO v_total, v_current, v_due
    FROM public.supplier_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_current IN ('draft','cancelled') THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.supplier_payments WHERE bill_id = p_bill_id;

  -- M-15: tolerancia de 0.005 solo para MARCAR 'paid'.
  IF v_paid >= v_total - 0.005 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < public.today_mty() THEN
    v_status := 'overdue';
  ELSE
    v_status := 'pending';
  END IF;

  PERFORM set_config('app.cxp_recalc', 'on', true);

  UPDATE public.supplier_bills
    SET balance = GREATEST(v_total - v_paid, 0),
        status  = v_status,
        updated_at = now()
    WHERE id = p_bill_id;
END $function$;