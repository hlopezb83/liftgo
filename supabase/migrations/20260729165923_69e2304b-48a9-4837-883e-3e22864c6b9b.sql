-- DB2-02: la máquina de estados solo era BEFORE UPDATE; un INSERT directo
-- creaba facturas 'paid', bookings 'completed', cotizaciones 'accepted',
-- bills 'paid' sin ningún flujo. Ahora también valida el INSERT.
CREATE OR REPLACE FUNCTION public.validate_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed text[];
  v_initial text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_initial := CASE TG_TABLE_NAME
      WHEN 'invoices'       THEN ARRAY['draft','sent']
      WHEN 'quotes'         THEN ARRAY['draft','sent']
      WHEN 'bookings'       THEN ARRAY['confirmed']
      WHEN 'supplier_bills' THEN ARRAY['draft','pending']
      WHEN 'forklifts'      THEN ARRAY['available']
      ELSE ARRAY[]::text[]
    END;
    IF NOT (NEW.status::text = ANY(v_initial)) THEN
      RAISE EXCEPTION 'Estado inicial no permitido en %: %. Usa el flujo/RPC correspondiente.',
        TG_TABLE_NAME, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','cancelled']
      WHEN 'sent'     THEN ARRAY['partial','paid','overdue','cancelled']
      WHEN 'overdue'  THEN ARRAY['sent','partial','paid','cancelled']
      WHEN 'partial'  THEN ARRAY['sent','paid','overdue','cancelled']
      WHEN 'paid'     THEN ARRAY['cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'quotes' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','accepted','rejected','expired']
      WHEN 'sent'     THEN ARRAY['accepted','rejected','expired']
      WHEN 'expired'  THEN ARRAY['draft']
      ELSE ARRAY[]::text[] END
    WHEN 'bookings' THEN CASE OLD.status::text
      WHEN 'confirmed' THEN ARRAY['completed','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'supplier_bills' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['pending','cancelled']
      WHEN 'pending'  THEN ARRAY['partial','paid','overdue','cancelled']
      WHEN 'overdue'  THEN ARRAY['pending','partial','paid','cancelled']
      WHEN 'partial'  THEN ARRAY['pending','paid','overdue','cancelled']
      WHEN 'paid'     THEN ARRAY['pending','partial','overdue','cancelled']
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

  IF TG_TABLE_NAME = 'invoices'
     AND current_setting('app.payment_sync', true) = 'on'
     AND OLD.status::text IN ('sent','partial','overdue','paid')
     AND NEW.status::text IN ('sent','partial','overdue','paid') THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida en %: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transition ON public.invoices;
CREATE TRIGGER trg_validate_transition BEFORE INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_transition();
DROP TRIGGER IF EXISTS trg_validate_transition ON public.quotes;
CREATE TRIGGER trg_validate_transition BEFORE INSERT OR UPDATE OF status ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.validate_transition();
DROP TRIGGER IF EXISTS trg_validate_transition ON public.bookings;
CREATE TRIGGER trg_validate_transition BEFORE INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_transition();
DROP TRIGGER IF EXISTS trg_validate_transition ON public.supplier_bills;
CREATE TRIGGER trg_validate_transition BEFORE INSERT OR UPDATE OF status ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.validate_transition();
DROP TRIGGER IF EXISTS trg_validate_transition ON public.forklifts;
CREATE TRIGGER trg_validate_transition BEFORE INSERT OR UPDATE OF status ON public.forklifts
  FOR EACH ROW EXECUTE FUNCTION public.validate_transition();

-- DB2-03: metadatos fiscales de invoices solo escribibles por el flujo SAT.
CREATE OR REPLACE FUNCTION public.guard_invoice_fiscal_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR current_setting('app.sat_flow', true) = 'on' THEN RETURN NEW; END IF;
  IF OLD.cfdi_uuid IS NOT NULL AND NEW.cfdi_uuid IS NULL THEN
    RAISE EXCEPTION 'No se puede borrar cfdi_uuid de una factura timbrada. Usa el flujo de cancelacion SAT.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.cancellation_status IS DISTINCT FROM OLD.cancellation_status THEN
    RAISE EXCEPTION 'cancellation_status solo lo puede modificar el flujo de cancelacion SAT (valor actual: %).', OLD.cancellation_status USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.facturapi_invoice_id IS NOT NULL AND NEW.facturapi_invoice_id IS DISTINCT FROM OLD.facturapi_invoice_id THEN
    RAISE EXCEPTION 'facturapi_invoice_id no es editable fuera del flujo de timbrado/cancelacion.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_invoice_fiscal_metadata ON public.invoices;
CREATE TRIGGER trg_guard_invoice_fiscal_metadata
  BEFORE UPDATE OF cfdi_uuid, cancellation_status, facturapi_invoice_id ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_fiscal_metadata();

-- DB2-04: lock de cotización aceptada (montos, fechas y cliente).
CREATE OR REPLACE FUNCTION public.lock_accepted_quote_amounts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'accepted' AND (
       NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.line_items IS DISTINCT FROM OLD.line_items OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
  ) THEN
    RAISE EXCEPTION 'No se pueden modificar montos, fechas ni cliente de una cotizacion aceptada. Rechazala y crea una nueva version.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IS DISTINCT FROM 'accepted' AND NEW.status = 'accepted' AND (
       NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.line_items IS DISTINCT FROM OLD.line_items OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
  ) THEN
    RAISE EXCEPTION 'No se pueden alterar montos, fechas ni cliente en el mismo movimiento que acepta la cotizacion.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lock_accepted_quote_amounts ON public.quotes;
CREATE TRIGGER trg_lock_accepted_quote_amounts
  BEFORE UPDATE OF subtotal, tax_amount, tax_rate, total, line_items, start_date, end_date, customer_id, status ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.lock_accepted_quote_amounts();

-- DB2-05: bookings no pueden completarse sin inspección de devolución.
CREATE OR REPLACE FUNCTION public.guard_booking_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF NOT EXISTS (SELECT 1 FROM public.return_inspections WHERE booking_id = OLD.id) THEN
      RAISE EXCEPTION 'No se puede completar la renta sin inspeccion de devolucion. Usa el flujo de devolucion (complete_return_inspection).' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_booking_completion ON public.bookings;
CREATE TRIGGER trg_guard_booking_completion
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_completion();