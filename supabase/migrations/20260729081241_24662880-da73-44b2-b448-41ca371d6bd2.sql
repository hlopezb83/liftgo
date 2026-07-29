-- DB-01 drift
ALTER TABLE public.forklifts ADD COLUMN IF NOT EXISTS equipment_model_id uuid REFERENCES public.equipment_models(id);
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS tipo_cambio numeric NOT NULL DEFAULT 1;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'MXN';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tipo_cambio numeric NOT NULL DEFAULT 1;
ALTER TABLE public.status_logs ADD COLUMN IF NOT EXISTS changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.forklifts.equipment_model_id IS 'Modelo de catalogo (equipment_models). Requerido por convert_quote_to_bookings.';
COMMENT ON COLUMN public.status_logs.changed_by IS 'Usuario que origino el cambio de estado (lo escribe cancel_booking).';

-- DB-02 dominios de status
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_dominio;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_dominio CHECK (status IN ('draft','sent','partial','paid','overdue','cancelled')) NOT VALID;
ALTER TABLE public.invoices VALIDATE CONSTRAINT invoices_status_dominio;

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_dominio;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_status_dominio CHECK (status IN ('draft','sent','accepted','rejected','expired')) NOT VALID;
ALTER TABLE public.quotes VALIDATE CONSTRAINT quotes_status_dominio;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_dominio;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_dominio CHECK (status IN ('confirmed','completed','cancelled')) NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_status_dominio;

ALTER TABLE public.forklifts DROP CONSTRAINT IF EXISTS forklifts_status_dominio;
ALTER TABLE public.forklifts ADD CONSTRAINT forklifts_status_dominio CHECK (status IN ('available','rented','maintenance','out_of_service','retired','sold')) NOT VALID;
ALTER TABLE public.forklifts VALIDATE CONSTRAINT forklifts_status_dominio;

-- DB-03 maquina de estados
CREATE OR REPLACE FUNCTION public.validate_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed text[];
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','cancelled']
      WHEN 'sent'     THEN ARRAY['partial','paid','overdue','cancelled']
      WHEN 'overdue'  THEN ARRAY['sent','partial','paid','cancelled']
      WHEN 'partial'  THEN ARRAY['sent','paid','overdue','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'quotes' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','accepted','rejected','expired']
      WHEN 'sent'     THEN ARRAY['accepted','rejected','expired']
      WHEN 'expired'  THEN ARRAY['draft']
      ELSE ARRAY[]::text[] END
    WHEN 'bookings' THEN CASE OLD.status::text
      WHEN 'confirmed' THEN ARRAY['completed','cancelled']
      WHEN 'completed' THEN ARRAY['confirmed']
      ELSE ARRAY[]::text[] END
    WHEN 'supplier_bills' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['pending','cancelled']
      WHEN 'pending'  THEN ARRAY['partial','paid','overdue','cancelled']
      WHEN 'overdue'  THEN ARRAY['pending','partial','paid','cancelled']
      WHEN 'partial'  THEN ARRAY['pending','paid','overdue','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'forklifts' THEN CASE OLD.status::text
      WHEN 'available'      THEN ARRAY['rented','maintenance','out_of_service','retired','sold']
      WHEN 'rented'         THEN ARRAY['available','maintenance','out_of_service','retired','sold']
      WHEN 'maintenance'    THEN ARRAY['available','rented','out_of_service','retired','sold']
      WHEN 'out_of_service' THEN ARRAY['available','maintenance','retired','sold']
      WHEN 'retired'        THEN ARRAY['available']
      ELSE ARRAY[]::text[] END
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida en %: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transition ON public.invoices;
CREATE TRIGGER trg_validate_transition BEFORE UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.validate_transition();
DROP TRIGGER IF EXISTS trg_validate_transition ON public.quotes;
CREATE TRIGGER trg_validate_transition BEFORE UPDATE OF status ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.validate_transition();
DROP TRIGGER IF EXISTS trg_validate_transition ON public.bookings;
CREATE TRIGGER trg_validate_transition BEFORE UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.validate_transition();
DROP TRIGGER IF EXISTS trg_validate_transition ON public.supplier_bills;
CREATE TRIGGER trg_validate_transition BEFORE UPDATE OF status ON public.supplier_bills FOR EACH ROW EXECUTE FUNCTION public.validate_transition();
DROP TRIGGER IF EXISTS trg_validate_transition ON public.forklifts;
CREATE TRIGGER trg_validate_transition BEFORE UPDATE OF status ON public.forklifts FOR EACH ROW EXECUTE FUNCTION public.validate_transition();

-- DB-04 guard de cancelacion de facturas
CREATE OR REPLACE FUNCTION public.guard_invoice_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motivo text;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF OLD.cfdi_uuid IS NOT NULL AND COALESCE(OLD.cancellation_status, 'none') <> 'accepted' THEN
      RAISE EXCEPTION 'La factura esta timbrada (cfdi_uuid=%): usa el flujo de cancelacion SAT, no la cancelacion directa', OLD.cfdi_uuid
        USING ERRCODE = 'check_violation';
    END IF;

    v_motivo := public.assert_invoice_cancellable(OLD.id);
    IF v_motivo IS NOT NULL THEN
      RAISE EXCEPTION '%', v_motivo USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_cancellation ON public.invoices;
CREATE TRIGGER trg_guard_invoice_cancellation BEFORE UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_cancellation();