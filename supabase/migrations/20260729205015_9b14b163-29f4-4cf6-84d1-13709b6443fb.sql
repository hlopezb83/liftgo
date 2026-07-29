-- DB3-06: draft ya no salta a accepted (conserva accepted->cancelled de DB3-08)
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

-- DB3-06 + DB3-07: guard de aceptacion (vigencia vieja + accepted_at)
CREATE OR REPLACE FUNCTION public.guard_quote_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    IF NEW.valid_until IS NOT NULL AND NEW.valid_until < current_date THEN
      RAISE EXCEPTION 'No se puede aceptar una cotizacion vencida (valid_until=%)', NEW.valid_until
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.valid_until IS NOT NULL AND OLD.valid_until < current_date THEN
      RAISE EXCEPTION 'No se puede aceptar una cotizacion cuya vigencia ya vencio (valid_until=%). Extiende la vigencia y reenviala primero.', OLD.valid_until
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_guard_acceptance ON public.quotes;
CREATE TRIGGER quotes_guard_acceptance
BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.guard_quote_acceptance();

-- DB3-07: lock ampliado de cotizacion aceptada
CREATE OR REPLACE FUNCTION public.lock_accepted_quote_amounts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'accepted' AND (
       NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.line_items IS DISTINCT FROM OLD.line_items OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
    OR NEW.forklift_id IS DISTINCT FROM OLD.forklift_id
    OR NEW.quote_type IS DISTINCT FROM OLD.quote_type
    OR NEW.rental_meta IS DISTINCT FROM OLD.rental_meta
  ) THEN
    RAISE EXCEPTION 'No se pueden modificar montos, fechas, cliente ni equipo de una cotizacion aceptada. Cancelala (admin/administrativo) y crea una nueva version.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IS DISTINCT FROM 'accepted' AND NEW.status = 'accepted' AND (
       NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.line_items IS DISTINCT FROM OLD.line_items OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
    OR NEW.forklift_id IS DISTINCT FROM OLD.forklift_id
    OR NEW.quote_type IS DISTINCT FROM OLD.quote_type
    OR NEW.rental_meta IS DISTINCT FROM OLD.rental_meta
  ) THEN
    RAISE EXCEPTION 'No se pueden alterar montos, fechas, cliente ni equipo en el mismo movimiento que acepta la cotizacion.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lock_accepted_quote_amounts ON public.quotes;
CREATE TRIGGER trg_lock_accepted_quote_amounts
  BEFORE UPDATE OF subtotal, tax_amount, tax_rate, total, line_items, start_date, end_date,
                   customer_id, customer_name, forklift_id, quote_type, rental_meta, status ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.lock_accepted_quote_amounts();

-- DB3-06: e2e_seed_scenario pasa por 'sent' antes de aceptar
CREATE OR REPLACE FUNCTION public.e2e_seed_scenario(p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_model_id uuid; v_forklift_id uuid; v_customer_id uuid;
  v_quote_id uuid; v_booking_id uuid; v_invoice_id uuid;
  v_maintenance_log_id uuid;
  v_quote_number text; v_booking_number text; v_invoice_number text;
  v_subtotal numeric := 10000; v_tax numeric := 1600; v_total numeric := 11600;
  v_allowed boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: e2e_seed_scenario requires admin role';
  END IF;
  IF p_scope IS NULL OR length(trim(p_scope)) = 0 THEN
    RAISE EXCEPTION 'e2e_seed_scenario requires a non-null p_scope';
  END IF;
  SELECT coalesce(allow_e2e_seed, false) INTO v_allowed FROM public.company_settings LIMIT 1;
  IF NOT coalesce(v_allowed, false) THEN
    RAISE EXCEPTION 'E2E seeding disabled on this environment';
  END IF;

  INSERT INTO public.equipment_models (manufacturer, model, default_capacity_kg, default_fuel_type,
    default_daily_rate, default_weekly_rate, default_monthly_rate, is_e2e, e2e_scope)
  VALUES ('E2E-Maker', 'E2E-Model-' || substr(gen_random_uuid()::text,1,8), 2500, 'LPG',
    500, 3000, 10000, true, p_scope)
  RETURNING id INTO v_model_id;

  INSERT INTO public.forklifts (name, model, manufacturer, capacity_kg, fuel_type, status,
    daily_rate, weekly_rate, monthly_rate, is_e2e, e2e_scope)
  VALUES ('E2E-FL-' || substr(gen_random_uuid()::text,1,8), 'E2E-Model', 'E2E-Maker', 2500, 'LPG',
    'available', 500, 3000, 10000, true, p_scope)
  RETURNING id INTO v_forklift_id;

  INSERT INTO public.customers (name, email, phone, rfc, is_e2e, e2e_scope)
  VALUES ('E2E Cliente ' || substr(gen_random_uuid()::text,1,8),
    'e2e-' || substr(gen_random_uuid()::text,1,8) || '@test.local',
    '8181818181', 'XAXX010101000', true, p_scope)
  RETURNING id INTO v_customer_id;

  v_quote_number := public.next_quote_number_e2e();
  INSERT INTO public.quotes (quote_number, customer_id, customer_name, forklift_id, equipment_model_id,
    start_date, end_date, line_items, subtotal, tax_rate, tax_amount, total,
    status, currency, quote_type, is_e2e, e2e_scope)
  VALUES (v_quote_number, v_customer_id, 'E2E Cliente', v_forklift_id, v_model_id,
    CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
    jsonb_build_array(jsonb_build_object('description', 'Renta mensual E2E',
      'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal)),
    v_subtotal, 16, v_tax, v_total, 'draft', 'MXN', 'rental', true, p_scope)
  RETURNING id INTO v_quote_id;

  UPDATE public.quotes SET status = 'sent' WHERE id = v_quote_id;
  UPDATE public.quotes SET status = 'accepted', accepted_at = now() WHERE id = v_quote_id;

  v_booking_number := public.next_booking_number_e2e();
  INSERT INTO public.bookings (booking_number, forklift_id, customer_id, customer_name,
    start_date, end_date, status, quote_id, is_e2e, e2e_scope)
  VALUES (v_booking_number, v_forklift_id, v_customer_id, 'E2E Cliente',
    CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'confirmed', v_quote_id, true, p_scope)
  RETURNING id INTO v_booking_id;

  v_invoice_number := public.next_invoice_number_e2e();
  INSERT INTO public.invoices (invoice_number, booking_id, customer_id, customer_name, quote_id,
    line_items, subtotal, tax_rate, tax_amount, total,
    status, issued_at, due_date, moneda, is_e2e, e2e_scope)
  VALUES (v_invoice_number, v_booking_id, v_customer_id, 'E2E Cliente', v_quote_id,
    jsonb_build_array(jsonb_build_object('description', 'Renta mensual E2E',
      'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal)),
    v_subtotal, 16, v_tax, v_total, 'sent', CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days',
    'MXN', true, p_scope)
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_bookings (invoice_id, booking_id, line_index)
  VALUES (v_invoice_id, v_booking_id, 0);

  INSERT INTO public.maintenance_logs (forklift_id, service_type, description,
    cost, performed_at, work_status)
  VALUES (v_forklift_id, 'preventive', 'E2E Kanban WO - ' || substr(p_scope, 1, 16),
    0, CURRENT_DATE, 'pending')
  RETURNING id INTO v_maintenance_log_id;

  RETURN jsonb_build_object(
    'model_id', v_model_id, 'forklift_id', v_forklift_id, 'customer_id', v_customer_id,
    'quote_id', v_quote_id, 'quote_number', v_quote_number,
    'booking_id', v_booking_id, 'booking_number', v_booking_number,
    'invoice_id', v_invoice_id, 'invoice_number', v_invoice_number,
    'maintenance_log_id', v_maintenance_log_id,
    'total', v_total, 'scope', p_scope
  );
END;
$function$;

-- DB3-09: maquina de estados de contratos (dominio incluye 'sent', usado por la UI)
UPDATE public.contracts
   SET status = 'draft', updated_at = now()
 WHERE status NOT IN ('draft','sent','signed','active','cancelled');

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_dominio;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_dominio
  CHECK (status IN ('draft','sent','signed','active','cancelled')) NOT VALID;
ALTER TABLE public.contracts VALIDATE CONSTRAINT contracts_status_dominio;

CREATE OR REPLACE FUNCTION public.guard_contract_initial_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Estado inicial no permitido en contracts: %. Usa el flujo/RPC correspondiente.',
      NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_contract_initial_status ON public.contracts;
CREATE TRIGGER trg_contract_initial_status
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contract_initial_status();

CREATE OR REPLACE FUNCTION public.enforce_signed_contract_lock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('signed','active','cancelled') THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Solo un administrador puede cambiar el estado de un contrato firmado, activo o cancelado'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
    IF NEW.daily_rate IS DISTINCT FROM OLD.daily_rate
       OR NEW.weekly_rate IS DISTINCT FROM OLD.weekly_rate
       OR NEW.monthly_rate IS DISTINCT FROM OLD.monthly_rate
       OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.terms_text IS DISTINCT FROM OLD.terms_text
       OR NEW.extra_hour_rate IS DISTINCT FROM OLD.extra_hour_rate
       OR NEW.max_hours_per_month IS DISTINCT FROM OLD.max_hours_per_month THEN
      RAISE EXCEPTION 'No se pueden editar los campos de un contrato firmado, activo o cancelado'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contracts_signed_lock ON public.contracts;
CREATE TRIGGER trg_contracts_signed_lock
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signed_contract_lock();

CREATE OR REPLACE FUNCTION public.guard_contract_signable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('signed','active') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF COALESCE(NEW.daily_rate, 0) < 0 OR COALESCE(NEW.weekly_rate, 0) < 0
       OR COALESCE(NEW.monthly_rate, 0) < 0 OR COALESCE(NEW.deposit_amount, 0) < 0 THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato con tasas o deposito negativos'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.customer_id IS NULL THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato sin cliente (customer_id)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato sin fechas de vigencia (start_date/end_date)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.end_date < NEW.start_date THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato con fecha final anterior a la inicial'
        USING ERRCODE = 'check_violation';
    END IF;
    IF COALESCE(NEW.monthly_rate, 0) <= 0 AND COALESCE(NEW.daily_rate, 0) <= 0 THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato sin tarifa: monthly_rate o daily_rate deben ser mayores a cero'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_contract_signable ON public.contracts;
CREATE TRIGGER trg_guard_contract_signable
  BEFORE INSERT OR UPDATE OF status, daily_rate, weekly_rate, monthly_rate, deposit_amount,
                            customer_id, start_date, end_date ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contract_signable();