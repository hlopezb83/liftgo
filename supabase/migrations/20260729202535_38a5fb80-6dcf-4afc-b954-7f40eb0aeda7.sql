-- DB3-08 (corregido): valvula de escape accepted -> cancelled + delete-guard,
-- conservando la exencion de teardown E2E via app.e2e_teardown + is_e2e.

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_dominio;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_status_dominio
  CHECK (status IN ('draft','sent','accepted','rejected','expired','cancelled')) NOT VALID;
ALTER TABLE public.quotes VALIDATE CONSTRAINT quotes_status_dominio;

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
      WHEN 'accepted' THEN ARRAY['cancelled']
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

CREATE OR REPLACE FUNCTION public.guard_quote_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'accepted' AND NEW.status = 'cancelled' THEN
    IF current_setting('app.e2e_teardown', true) = 'on'
       AND OLD.is_e2e IS TRUE
       AND OLD.e2e_scope IS NOT NULL THEN
      RETURN NEW;
    END IF;
    IF NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    ) THEN
      RAISE EXCEPTION 'Solo un administrador o administrativo puede cancelar una cotizacion aceptada.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.bookings WHERE quote_id = OLD.id AND status = 'confirmed') THEN
      RAISE EXCEPTION 'No se puede cancelar la cotizacion: tiene reservas confirmadas. Cancela primero las reservas.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.guard_quote_cancellation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_quote_cancellation ON public.quotes;
CREATE TRIGGER trg_guard_quote_cancellation
  BEFORE UPDATE OF status ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_quote_cancellation();

CREATE OR REPLACE FUNCTION public.guard_quote_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_jwt_role text;
BEGIN
  -- Exencion de teardown E2E (mecanismo vigente): flag transaccional + fila e2e.
  IF current_setting('app.e2e_teardown', true) = 'on'
     AND OLD.is_e2e IS TRUE
     AND OLD.e2e_scope IS NOT NULL THEN
    RETURN OLD;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' AND OLD.is_e2e IS TRUE THEN
    RETURN OLD;
  END IF;

  IF OLD.status = 'accepted' THEN
    RAISE EXCEPTION 'No se puede borrar una cotizacion aceptada. Cancelala primero (admin/administrativo) o crea una version nueva.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.bookings WHERE quote_id = OLD.id) THEN
    RAISE EXCEPTION 'No se puede borrar una cotizacion con reservas ligadas (trazabilidad comercial).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END; $$;

REVOKE EXECUTE ON FUNCTION public.guard_quote_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_quote_delete ON public.quotes;
CREATE TRIGGER trg_guard_quote_delete
  BEFORE DELETE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_quote_delete();