-- BL-11 (cierre): red de seguridad server-side contra sobrepagos.
-- La validación client-side en useRecordPaymentForm puede burlarse con dos
-- pestañas concurrentes; este trigger bloquea la fila de invoices y compara
-- la suma total de pagos contra invoice.total, rechazando en el borde de la DB.

CREATE OR REPLACE FUNCTION public.enforce_payment_within_invoice_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_total NUMERIC;
  inv_status TEXT;
  total_paid NUMERIC;
BEGIN
  -- Lock the invoice row to serialize concurrent payment writes.
  SELECT total, status INTO inv_total, inv_status
  FROM public.invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  IF inv_total IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found for payment', NEW.invoice_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Sum of all payments for this invoice, excluding the current row on UPDATE.
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.payments
  WHERE invoice_id = NEW.invoice_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  total_paid := total_paid + NEW.amount;

  -- Tolerancia de 1 centavo por redondeo.
  IF total_paid > inv_total + 0.01 THEN
    RAISE EXCEPTION
      'Sobrepago rechazado: la suma de pagos (%.2f) excede el total de la factura (%.2f)',
      total_paid, inv_total
      USING ERRCODE = 'check_violation',
            HINT = 'Reduce el monto del pago o cancela pagos previos antes de registrar uno nuevo.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_payment_within_invoice_total ON public.payments;

CREATE TRIGGER trg_enforce_payment_within_invoice_total
BEFORE INSERT OR UPDATE OF amount, invoice_id ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_payment_within_invoice_total();

COMMENT ON FUNCTION public.enforce_payment_within_invoice_total() IS
  'BL-11: bloquea invoices FOR UPDATE y rechaza pagos cuya suma exceda invoice.total (+0.01 tolerancia).';