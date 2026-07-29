-- DB3-10: guard de banderas e2e en INSERT + auditoria del flip
CREATE OR REPLACE FUNCTION public.guard_is_e2e_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text; v_jwt_role text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_e2e, false) IS NOT TRUE AND NEW.e2e_scope IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.is_e2e IS NOT DISTINCT FROM OLD.is_e2e AND NEW.e2e_scope IS NOT DISTINCT FROM OLD.e2e_scope THEN
      RETURN NEW;
    END IF;
  END IF;

  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role' THEN RETURN NEW; END IF;

  IF current_setting('app.e2e_seed', true) = 'on' THEN RETURN NEW; END IF;

  BEGIN SELECT email INTO v_email FROM auth.users WHERE id = auth.uid(); EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  IF public.is_e2e_actor_email(v_email) THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Solo actores e2e o el service_role pueden crear o modificar filas con is_e2e/e2e_scope'
    USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.invoices;
CREATE TRIGGER trg_guard_is_e2e BEFORE INSERT OR UPDATE OF is_e2e, e2e_scope ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.quotes;
CREATE TRIGGER trg_guard_is_e2e BEFORE INSERT OR UPDATE OF is_e2e, e2e_scope ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.bookings;
CREATE TRIGGER trg_guard_is_e2e BEFORE INSERT OR UPDATE OF is_e2e, e2e_scope ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.payments;
CREATE TRIGGER trg_guard_is_e2e BEFORE INSERT OR UPDATE OF is_e2e, e2e_scope ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.customers;
CREATE TRIGGER trg_guard_is_e2e BEFORE INSERT OR UPDATE OF is_e2e, e2e_scope ON public.customers FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.forklifts;
CREATE TRIGGER trg_guard_is_e2e BEFORE INSERT OR UPDATE OF is_e2e, e2e_scope ON public.forklifts FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();
DROP TRIGGER IF EXISTS trg_guard_is_e2e ON public.equipment_models;
CREATE TRIGGER trg_guard_is_e2e BEFORE INSERT OR UPDATE OF is_e2e, e2e_scope ON public.equipment_models FOR EACH ROW EXECUTE FUNCTION public.guard_is_e2e_flag();

-- e2e_seed_scenario: marcar sesion privilegiada del seed
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

  PERFORM set_config('app.e2e_seed', 'on', true);

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

-- e2e_seed_portal_scenario: mismo flag de sesion privilegiada
CREATE OR REPLACE FUNCTION public.e2e_seed_portal_scenario(p_scope text, p_portal_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 10000;
  v_tax numeric := 1600;
  v_total numeric := 11600;
  v_allowed boolean;
  v_existing_customer_ids uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: e2e_seed_portal_scenario requires admin role';
  END IF;
  IF p_scope IS NULL OR length(trim(p_scope)) = 0 THEN
    RAISE EXCEPTION 'e2e_seed_portal_scenario requires a non-null p_scope';
  END IF;
  IF p_portal_email IS NULL OR length(trim(p_portal_email)) = 0 THEN
    RAISE EXCEPTION 'e2e_seed_portal_scenario requires a non-null p_portal_email';
  END IF;

  SELECT coalesce(allow_e2e_seed, false) INTO v_allowed FROM public.company_settings LIMIT 1;
  IF NOT coalesce(v_allowed, false) THEN
    RAISE EXCEPTION 'E2E seeding disabled on this environment';
  END IF;

  PERFORM set_config('app.e2e_seed', 'on', true);

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_portal_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Portal user % not found in auth.users', p_portal_email;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'customer'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT coalesce(array_agg(id), '{}') INTO v_existing_customer_ids
  FROM public.customers
  WHERE user_id = v_user_id
    AND is_e2e = true;

  IF array_length(v_existing_customer_ids, 1) IS NOT NULL THEN
    DELETE FROM public.customer_payment_intents
    WHERE invoice_id IN (
      SELECT id FROM public.invoices WHERE customer_id = ANY(v_existing_customer_ids)
    );

    DELETE FROM public.payments
    WHERE invoice_id IN (
      SELECT id FROM public.invoices WHERE customer_id = ANY(v_existing_customer_ids)
    );

    DELETE FROM public.invoices WHERE customer_id = ANY(v_existing_customer_ids) AND is_e2e = true;
    DELETE FROM public.bookings WHERE customer_id = ANY(v_existing_customer_ids) AND is_e2e = true;
    DELETE FROM public.quote_assigned_forklifts
    WHERE quote_id IN (
      SELECT id FROM public.quotes WHERE customer_id = ANY(v_existing_customer_ids) AND is_e2e = true
    );
    DELETE FROM public.quotes WHERE customer_id = ANY(v_existing_customer_ids) AND is_e2e = true;
    DELETE FROM public.customers WHERE id = ANY(v_existing_customer_ids) AND is_e2e = true;
  END IF;

  INSERT INTO public.customers (name, email, phone, rfc, user_id, is_e2e, e2e_scope)
  VALUES ('E2E Portal ' || substr(p_scope, 1, 12),
          p_portal_email,
          '8181818181',
          'XAXX010101000',
          v_user_id,
          true,
          p_scope)
  RETURNING id INTO v_customer_id;

  v_invoice_number := public.next_invoice_number_e2e();
  INSERT INTO public.invoices (invoice_number, customer_id, customer_name,
    line_items, subtotal, tax_rate, tax_amount, total,
    status, issued_at, due_date, moneda, is_e2e, e2e_scope)
  VALUES (v_invoice_number, v_customer_id, 'E2E Portal',
    jsonb_build_array(jsonb_build_object('description', 'Renta portal E2E',
      'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal)),
    v_subtotal, 16, v_tax, v_total, 'sent', CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days',
    'MXN', true, p_scope)
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'customer_id', v_customer_id,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total', v_total,
    'scope', p_scope
  );
END;
$function$;

-- audit_trigger_fn: auditar siempre el flip de banderas e2e
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_old jsonb; v_new jsonb; v_changed text[]; v_key text;
  v_user_id uuid; v_email text; v_is_e2e_actor boolean := false;
  v_e2e_flag_changed boolean := false;
  v_jwt_role text;
  v_privileged_e2e_session boolean := false;
BEGIN
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

  IF v_user_id IS NOT NULL THEN
    BEGIN
      SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
      v_is_e2e_actor := public.is_e2e_actor_email(v_email);
    EXCEPTION WHEN OTHERS THEN v_is_e2e_actor := false; END;
  END IF;

  v_privileged_e2e_session := v_is_e2e_actor
    OR v_jwt_role = 'service_role'
    OR current_setting('app.e2e_seed', true) = 'on';

  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) ? 'is_e2e') THEN
    v_e2e_flag_changed :=
      ((to_jsonb(NEW)->>'is_e2e') IS DISTINCT FROM (to_jsonb(OLD)->>'is_e2e'))
      OR ((to_jsonb(NEW)->>'e2e_scope') IS DISTINCT FROM (to_jsonb(OLD)->>'e2e_scope'));
  END IF;

  IF v_is_e2e_actor THEN
    IF v_e2e_flag_changed THEN
      v_old := to_jsonb(OLD) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      v_new := to_jsonb(NEW) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_fields, user_id)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_old, v_new, ARRAY['is_e2e','e2e_scope'], v_user_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF (to_jsonb(NEW) ? 'is_e2e') AND ((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE)
       AND v_privileged_e2e_session THEN
      RETURN NEW;
    END IF;
    v_new := to_jsonb(NEW) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_new, v_user_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT v_e2e_flag_changed
       AND (to_jsonb(NEW) ? 'is_e2e')
       AND (((to_jsonb(NEW)->>'is_e2e')::boolean IS TRUE) OR ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE)) THEN
      RETURN NEW;
    END IF;
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_changed := ARRAY[]::text[];
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key NOT IN ('updated_at', 'created_at') AND (v_old->v_key IS DISTINCT FROM v_new->v_key) THEN
        v_changed := v_changed || v_key;
      END IF;
    END LOOP;
    IF array_length(v_changed, 1) > 0 THEN
      v_old := v_old - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      v_new := v_new - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
      INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_fields, user_id)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_old, v_new, v_changed, v_user_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF (to_jsonb(OLD) ? 'is_e2e') AND ((to_jsonb(OLD)->>'is_e2e')::boolean IS TRUE) THEN RETURN OLD; END IF;
    v_old := to_jsonb(OLD) - 'cfdi_xml' - 'cfdi_xml_url' - 'content' - 'xml_content' - 'line_items';
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, user_id)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_old, v_user_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $function$;

-- DB3-11: user_id inmutable en user_roles
CREATE OR REPLACE FUNCTION public.guard_user_roles_immutable_user_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'No se puede reasignar user_id en user_roles. Usa update_user_role_safe (borra e inserta el rol).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_user_roles_immutable_user_id ON public.user_roles;
CREATE TRIGGER trg_user_roles_immutable_user_id
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_roles_immutable_user_id();

-- DB3-12: montos de pagos a 2 decimales
CREATE OR REPLACE FUNCTION public.round_payment_amount()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.amount IS NOT NULL THEN
    NEW.amount := round(NEW.amount, 2);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_round_payment_amount ON public.payments;
CREATE TRIGGER trg_round_payment_amount
  BEFORE INSERT OR UPDATE OF amount ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.round_payment_amount();

DROP TRIGGER IF EXISTS trg_round_supplier_payment_amount ON public.supplier_payments;
CREATE TRIGGER trg_round_supplier_payment_amount
  BEFORE INSERT OR UPDATE OF amount ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.round_payment_amount();

UPDATE public.payments SET amount = round(amount, 2) WHERE amount IS DISTINCT FROM round(amount, 2);
UPDATE public.supplier_payments SET amount = round(amount, 2) WHERE amount IS DISTINCT FROM round(amount, 2);

-- DB3-13: app.payment_sync exige pg_trigger_depth() > 1
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
     AND pg_trigger_depth() > 1
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