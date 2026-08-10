-- Baja: whitelist de transiciones para deliveries (hoy la tabla no tiene
-- máquina de estados). Se preserva ÍNTEGRA la lógica vigente de
-- validate_transition (incluye el manejo de invoices/supplier_bills con
-- v_jwt_role y v_due que la versión citada en la auditoría no tenía) y solo
-- se agrega la whitelist de deliveries.
CREATE OR REPLACE FUNCTION public.validate_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed text[];
  v_initial text[];
  v_due date;
  v_jwt_role text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_initial := CASE TG_TABLE_NAME
      WHEN 'invoices'       THEN ARRAY['draft','sent']
      WHEN 'quotes'         THEN ARRAY['draft','sent']
      WHEN 'bookings'       THEN ARRAY['confirmed']
      WHEN 'supplier_bills' THEN ARRAY['draft','pending']
      WHEN 'forklifts'      THEN ARRAY['available']
      -- Baja: 'completed' inicial: DeliveryFormDialog registra entregas "ya hechas".
      WHEN 'deliveries'     THEN ARRAY['scheduled','pending','completed']
      ELSE ARRAY[]::text[]
    END;

    IF TG_TABLE_NAME = 'supplier_bills' AND NEW.status::text = 'overdue' THEN
      v_due := NULLIF(to_jsonb(NEW) ->> 'due_date', '')::date;
      IF v_due IS NOT NULL AND v_due < public.today_mty() THEN
        RETURN NEW;
      END IF;
    END IF;

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
      WHEN 'draft'    THEN ARRAY['sent','overdue','cancelled']
      WHEN 'sent'     THEN ARRAY['overdue','paid','cancelled']
      WHEN 'overdue'  THEN ARRAY['paid','cancelled']
      WHEN 'partial'  THEN ARRAY['overdue','cancelled']
      ELSE ARRAY[]::text[] END
    WHEN 'quotes' THEN CASE OLD.status::text
      WHEN 'draft'    THEN ARRAY['sent','rejected','expired']
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
    -- Baja: deliveries con estados terminales completed/cancelled.
    WHEN 'deliveries' THEN CASE OLD.status::text
      WHEN 'pending'   THEN ARRAY['scheduled','completed','cancelled']
      WHEN 'scheduled' THEN ARRAY['completed','cancelled']
      ELSE ARRAY[]::text[] END
    ELSE ARRAY[]::text[]
  END;

  IF TG_TABLE_NAME = 'invoices'
     AND current_setting('app.payment_sync', true) = 'on'
     AND pg_trigger_depth() > 1
     AND OLD.status::text IN ('sent','partial','overdue','paid')
     AND NEW.status::text IN ('sent','partial','overdue','paid') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'invoices'
     AND OLD.status::text = 'paid'
     AND NEW.status::text = 'cancelled' THEN
    BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
    IF v_jwt_role = 'service_role'
       OR current_setting('app.sat_flow', true) IS NOT DISTINCT FROM 'on' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT (NEW.status::text = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Transicion de estado no permitida en %: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transition ON public.deliveries;
CREATE TRIGGER trg_validate_transition
  BEFORE INSERT OR UPDATE OF status ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.validate_transition();
