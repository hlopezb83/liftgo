ALTER TABLE public.booking_extensions
  ADD COLUMN IF NOT EXISTS pending_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_extensions_pending_invoice
  ON public.booking_extensions (pending_invoice_id) WHERE pending_invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.extension_invoice_is_issued(p_invoice public.invoices)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(p_invoice.status, 'draft') NOT IN ('draft', 'cancelled')
     AND COALESCE(p_invoice.cfdi_status, '') <> 'cancelled';
$$;

CREATE OR REPLACE FUNCTION public.enforce_extension_invoice_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.invoice_id IS NOT DISTINCT FROM OLD.invoice_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La factura de la extensión no existe.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La reserva de la extensión no existe.' USING ERRCODE = '23514';
  END IF;

  IF v_invoice.status = 'cancelled'
     OR COALESCE(v_invoice.cfdi_status, '') = 'cancelled' THEN
    RAISE EXCEPTION 'La factura % está cancelada; no puede cobrar la extensión.', v_invoice.invoice_number
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(v_invoice.status, 'draft') = 'draft' THEN
    RAISE EXCEPTION 'La factura % aún está en borrador; emítela antes de marcar la extensión como facturada.',
      COALESCE(v_invoice.invoice_number, v_invoice.id::text) USING ERRCODE = '23514';
  END IF;

  IF v_invoice.booking_id IS DISTINCT FROM NEW.booking_id
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id = v_invoice.id AND ib.booking_id = NEW.booking_id
     ) THEN
    RAISE EXCEPTION 'La factura % no corresponde a la reserva de esta extensión.', v_invoice.invoice_number
      USING ERRCODE = '23514';
  END IF;

  IF v_booking.customer_id IS NOT NULL
     AND v_invoice.customer_id IS NOT NULL
     AND v_invoice.customer_id <> v_booking.customer_id THEN
    RAISE EXCEPTION 'La factura % pertenece a otro cliente.', v_invoice.invoice_number
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(v_invoice.total, 0) <= 0 THEN
    RAISE EXCEPTION 'La factura % no tiene importe; no puede cobrar la extensión.', v_invoice.invoice_number
      USING ERRCODE = '23514';
  END IF;
  IF v_invoice.billing_period_start IS NOT NULL AND v_invoice.billing_period_end IS NOT NULL
     AND (v_invoice.billing_period_end < NEW.new_end_date
          OR v_invoice.billing_period_start > NEW.new_end_date) THEN
    RAISE EXCEPTION 'El periodo de la factura % no cubre la extensión hasta %.',
      v_invoice.invoice_number, NEW.new_end_date USING ERRCODE = '23514';
  END IF;

  -- Ligada de forma definitiva: se libera la reserva de borrador.
  NEW.pending_invoice_id := NULL;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_extension_pending_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF NEW.pending_invoice_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.pending_invoice_id IS NOT DISTINCT FROM OLD.pending_invoice_id THEN
    RETURN NEW;
  END IF;

  IF NEW.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'La extensión % ya fue facturada; no puede reservarse para otra factura.', NEW.id
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.pending_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La factura de la extensión no existe.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La reserva de la extensión no existe.' USING ERRCODE = '23514';
  END IF;

  IF v_invoice.status = 'cancelled'
     OR COALESCE(v_invoice.cfdi_status, '') = 'cancelled' THEN
    RAISE EXCEPTION 'La factura % está cancelada; no puede cobrar la extensión.',
      COALESCE(v_invoice.invoice_number, v_invoice.id::text) USING ERRCODE = '23514';
  END IF;

  IF v_invoice.booking_id IS DISTINCT FROM NEW.booking_id
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_bookings ib
        WHERE ib.invoice_id = v_invoice.id AND ib.booking_id = NEW.booking_id
     ) THEN
    RAISE EXCEPTION 'La factura no corresponde a la reserva de esta extensión.'
      USING ERRCODE = '23514';
  END IF;

  IF v_booking.customer_id IS NOT NULL
     AND v_invoice.customer_id IS NOT NULL
     AND v_invoice.customer_id <> v_booking.customer_id THEN
    RAISE EXCEPTION 'La factura pertenece a otro cliente.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_extension_pending_invoice ON public.booking_extensions;
CREATE TRIGGER trg_extension_pending_invoice
  BEFORE INSERT OR UPDATE ON public.booking_extensions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_extension_pending_invoice();

CREATE OR REPLACE FUNCTION public.link_pending_extensions_on_invoice_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.extension_invoice_is_issued(NEW) THEN
    RETURN NEW;
  END IF;
  IF public.extension_invoice_is_issued(OLD) THEN
    RETURN NEW;
  END IF;

  UPDATE public.booking_extensions be
     SET invoice_id = NEW.id,
         billed_at = COALESCE(be.billed_at, now()),
         pending_invoice_id = NULL
   WHERE be.pending_invoice_id = NEW.id
     AND be.invoice_id IS NULL;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_link_pending_extensions ON public.invoices;
CREATE TRIGGER trg_link_pending_extensions
  AFTER UPDATE OF status, cfdi_status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.link_pending_extensions_on_invoice_issued();