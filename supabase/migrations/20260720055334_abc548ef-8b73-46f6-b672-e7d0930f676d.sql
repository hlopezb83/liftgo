-- C-1 defensivo: bloquear pagos en divisa distinta a la factura hasta que
-- exista soporte formal de conversión (amount normalizado + reconciliación
-- de triggers de saldo y REPs multi-moneda). Hoy 100% de pagos y facturas
-- están en MXN; este trigger evita corrupción silenciosa de saldos en
-- cuanto alguien emita una factura USD.

CREATE OR REPLACE FUNCTION public.enforce_payment_matches_invoice_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_currency text;
  pay_currency text;
BEGIN
  SELECT COALESCE(moneda, 'MXN')
    INTO inv_currency
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  IF inv_currency IS NULL THEN
    -- invoice_id inválido: dejar que la FK dispare el error apropiado.
    RETURN NEW;
  END IF;

  pay_currency := COALESCE(NEW.currency, 'MXN');

  IF pay_currency <> inv_currency THEN
    RAISE EXCEPTION
      'Pago en % no coincide con la divisa de la factura (%). Conversión multi-moneda aún no soportada.',
      pay_currency, inv_currency
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_currency_matches_invoice ON public.payments;
CREATE TRIGGER trg_payments_currency_matches_invoice
BEFORE INSERT OR UPDATE OF currency, invoice_id ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_payment_matches_invoice_currency();
