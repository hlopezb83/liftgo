-- DB4-02 (N4-2 MEDIO + N3-r4 BAJO): cierra la puerta INSERT de damage_records.
CREATE OR REPLACE FUNCTION public.guard_damage_record_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice_customer uuid;
  v_damage_customer uuid;
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.invoice_id IS NOT DISTINCT FROM OLD.invoice_id THEN
    RETURN NEW;
  END IF;
  SELECT customer_id INTO v_invoice_customer FROM public.invoices WHERE id = NEW.invoice_id;
  IF v_invoice_customer IS NULL THEN
    RAISE EXCEPTION 'La factura ligada al dano no existe o no tiene cliente (invoice_id=%)', NEW.invoice_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_damage_customer := COALESCE(
    NEW.customer_id,
    (SELECT customer_id FROM public.bookings WHERE id = NEW.booking_id)
  );
  IF v_damage_customer IS NOT NULL AND v_invoice_customer IS DISTINCT FROM v_damage_customer THEN
    RAISE EXCEPTION 'La factura ligada pertenece a otro cliente. El cargo del dano debe facturarse al cliente del dano.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_damage_record_invoice ON public.damage_records;
CREATE TRIGGER trg_guard_damage_record_invoice
  BEFORE INSERT OR UPDATE OF invoice_id ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_damage_record_invoice();

CREATE OR REPLACE FUNCTION public.guard_damage_record_initial_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_jwt_role text;
BEGIN
  IF NEW.status = 'reported' THEN
    RETURN NEW;
  END IF;
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' OR v_jwt_role IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Estado inicial no permitido en damage_records: %. Los danos nacen en estado reported.', NEW.status
    USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS trg_guard_damage_record_initial_status ON public.damage_records;
CREATE TRIGGER trg_guard_damage_record_initial_status
  BEFORE INSERT ON public.damage_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_damage_record_initial_status();