ALTER TABLE public.booking_extensions
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_booking_extensions_invoice_id
  ON public.booking_extensions (invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMENT ON COLUMN public.booking_extensions.invoice_id IS
  'Factura que cobra los dias extra de esta extension (NULL = pendiente de facturar).';
COMMENT ON COLUMN public.booking_extensions.billed_at IS
  'Momento en que la extension quedo facturada.';

-- Guard: no permitir re-vincular una extension ya facturada a otra factura.
CREATE OR REPLACE FUNCTION public.enforce_booking_extension_billing_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.invoice_id IS NOT NULL
     AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
  THEN
    RAISE EXCEPTION 'La extension % ya fue facturada (factura %). Cancela esa factura antes de re-facturarla.',
      OLD.id, OLD.invoice_id
      USING ERRCODE = '23505';
  END IF;

  IF NEW.invoice_id IS NOT NULL AND NEW.billed_at IS NULL THEN
    NEW.billed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_extension_billing_lock ON public.booking_extensions;
CREATE TRIGGER trg_booking_extension_billing_lock
  BEFORE INSERT OR UPDATE ON public.booking_extensions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_extension_billing_lock();

REVOKE ALL ON FUNCTION public.enforce_booking_extension_billing_lock() FROM PUBLIC, anon;

-- Policy de UPDATE: solo back-office puede sellar la extension como facturada.
DROP POLICY IF EXISTS "booking_extensions_update_backoffice" ON public.booking_extensions;
CREATE POLICY "booking_extensions_update_backoffice"
  ON public.booking_extensions
  FOR UPDATE
  TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::app_role) OR public.has_role((select auth.uid()), 'administrativo'::app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::app_role) OR public.has_role((select auth.uid()), 'administrativo'::app_role));

GRANT UPDATE (invoice_id, billed_at) ON public.booking_extensions TO authenticated;
GRANT ALL ON public.booking_extensions TO service_role;