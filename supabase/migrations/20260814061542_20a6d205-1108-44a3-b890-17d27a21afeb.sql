DROP INDEX IF EXISTS public.idx_booking_extensions_invoice_id;

CREATE OR REPLACE FUNCTION public.enforce_booking_extension_billing_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.invoice_id IS NOT NULL
     AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
  THEN
    RAISE EXCEPTION 'La extension % ya fue facturada (factura %). Cancela esa factura antes de re-facturarla.',
      OLD.id, OLD.invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.invoice_id IS NOT NULL AND NEW.billed_at IS NULL THEN
    NEW.billed_at := now();
  END IF;

  RETURN NEW;
END;
$$;