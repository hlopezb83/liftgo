-- FIX L-1: una factura no puede salir de 'draft' sin cliente.
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_customer_required_when_not_draft;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_customer_required_when_not_draft
  CHECK (
    status = 'draft'
    OR customer_id IS NOT NULL
    OR customer_name IS NOT NULL
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.enforce_invoice_customer_when_not_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'draft'
     AND NEW.customer_id IS NULL
     AND (NEW.customer_name IS NULL OR btrim(NEW.customer_name) = '') THEN
    RAISE EXCEPTION
      'La factura no puede salir de borrador sin cliente (se requiere customer_id o customer_name)'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_customer_required_trg ON public.invoices;
CREATE TRIGGER invoices_customer_required_trg
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invoice_customer_when_not_draft();