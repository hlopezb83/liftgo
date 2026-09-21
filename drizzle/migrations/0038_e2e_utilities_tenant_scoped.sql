-- 0038 — Endurecimiento multiempresa (paso 2): utilidades E2E con alcance por
-- organización.
--
-- Antes de esta migración las funciones E2E eran SECURITY DEFINER con guarda
-- únicamente de rol (`has_role`, que es global): cualquier admin autenticado
-- podía sembrar, purgar o borrar datos E2E de OTRA organización.
--
-- Cambios:
--   * `e2e_purge_all()` se elimina (sin consumidores en el repositorio).
--   * Se agrega la guarda común `e2e_require_admin_organization()`.
--   * `e2e_seed_scenario`, `e2e_seed_portal_scenario`, `e2e_teardown`,
--     `purge_e2e_data` y `purge_e2e_audit_logs` conservan firma y resultado,
--     pero sólo operan sobre la organización interna activa del llamante.

-- ---------------------------------------------------------------------------
-- 1) Función sin consumidores: se elimina.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.e2e_purge_all();

-- ---------------------------------------------------------------------------
-- 2) Guarda común: exactamente un contexto interno activo + rol admin.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.e2e_require_admin_organization(p_function text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  -- `current_internal_organization_id()` devuelve NULL si el usuario no tiene
  -- exactamente una membresía interna en una organización activa.
  v_organization_id := public.current_internal_organization_id();
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION
      'Forbidden: % requiere exactamente un contexto interno activo', p_function
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role((SELECT auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: % requiere rol admin', p_function
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.organization_id', v_organization_id::text, true);
  RETURN v_organization_id;
END;
$function$;

COMMENT ON FUNCTION public.e2e_require_admin_organization(text) IS
  'Guarda multiempresa de las utilidades E2E: exige rol admin y exactamente un contexto interno activo; devuelve el organization_id verificado.';

-- ---------------------------------------------------------------------------
-- 3) Semilla del escenario interno.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.e2e_seed_scenario(p_scope text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_model_id uuid; v_forklift_id uuid; v_customer_id uuid;
  v_quote_id uuid; v_booking_id uuid; v_invoice_id uuid;
  v_maintenance_log_id uuid;
  v_quote_number text; v_booking_number text; v_invoice_number text;
  v_subtotal numeric := 10000; v_tax numeric := 1600; v_total numeric := 11600;
  v_allowed boolean;
BEGIN
  v_org := public.e2e_require_admin_organization('e2e_seed_scenario');

  IF p_scope IS NULL OR length(trim(p_scope)) = 0 THEN
    RAISE EXCEPTION 'e2e_seed_scenario requires a non-null p_scope';
  END IF;

  SELECT coalesce(cs.allow_e2e_seed, false) INTO v_allowed
  FROM public.company_settings cs
  WHERE cs.organization_id = v_org;
  IF NOT coalesce(v_allowed, false) THEN
    RAISE EXCEPTION 'E2E seeding disabled on this environment';
  END IF;

  PERFORM set_config('app.e2e_seed', 'on', true);

  INSERT INTO public.equipment_models (organization_id, manufacturer, model,
    default_capacity_kg, default_fuel_type,
    default_daily_rate, default_weekly_rate, default_monthly_rate, is_e2e, e2e_scope)
  VALUES (v_org, 'E2E-Maker', 'E2E-Model-' || substr(gen_random_uuid()::text,1,8), 2500, 'LPG',
    500, 3000, 10000, true, p_scope)
  RETURNING id INTO v_model_id;

  INSERT INTO public.forklifts (organization_id, name, model, manufacturer, capacity_kg,
    fuel_type, status, daily_rate, weekly_rate, monthly_rate, is_e2e, e2e_scope)
  VALUES (v_org, 'E2E-FL-' || substr(gen_random_uuid()::text,1,8), 'E2E-Model', 'E2E-Maker',
    2500, 'LPG', 'available', 500, 3000, 10000, true, p_scope)
  RETURNING id INTO v_forklift_id;

  INSERT INTO public.customers (name, email, phone, rfc, is_e2e, e2e_scope,
    created_by_organization_id)
  VALUES ('E2E Cliente ' || substr(gen_random_uuid()::text,1,8),
    'e2e-' || substr(gen_random_uuid()::text,1,8) || '@test.local',
    '8181818181', 'XAXX010101000', true, p_scope, v_org)
  RETURNING id INTO v_customer_id;

  -- Enlace explícito con la organización (idempotente; no depende del trigger).
  INSERT INTO public.organization_customers (organization_id, customer_id, status)
  VALUES (v_org, v_customer_id, 'active')
  ON CONFLICT (organization_id, customer_id) DO NOTHING;

  v_quote_number := public.next_quote_number_e2e();
  INSERT INTO public.quotes (organization_id, quote_number, customer_id, customer_name,
    forklift_id, equipment_model_id,
    start_date, end_date, line_items, subtotal, tax_rate, tax_amount, total,
    status, currency, quote_type, is_e2e, e2e_scope)
  VALUES (v_org, v_quote_number, v_customer_id, 'E2E Cliente', v_forklift_id, v_model_id,
    public.today_mty(), public.today_mty() + INTERVAL '30 days',
    jsonb_build_array(jsonb_build_object('description', 'Renta mensual E2E',
      'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal)),
    v_subtotal, 16, v_tax, v_total, 'draft', 'MXN', 'rental', true, p_scope)
  RETURNING id INTO v_quote_id;

  UPDATE public.quotes SET status = 'sent'
   WHERE id = v_quote_id AND organization_id = v_org;
  UPDATE public.quotes SET status = 'accepted', accepted_at = now()
   WHERE id = v_quote_id AND organization_id = v_org;

  v_booking_number := public.next_booking_number_e2e();
  INSERT INTO public.bookings (organization_id, booking_number, forklift_id, customer_id,
    customer_name, start_date, end_date, status, quote_id, is_e2e, e2e_scope)
  VALUES (v_org, v_booking_number, v_forklift_id, v_customer_id, 'E2E Cliente',
    public.today_mty(), public.today_mty() + INTERVAL '30 days', 'confirmed', v_quote_id,
    true, p_scope)
  RETURNING id INTO v_booking_id;

  v_invoice_number := public.next_invoice_number_e2e();
  INSERT INTO public.invoices (organization_id, invoice_number, booking_id, customer_id,
    customer_name, quote_id, line_items, subtotal, tax_rate, tax_amount, total,
    status, issued_at, due_date, moneda, is_e2e, e2e_scope)
  VALUES (v_org, v_invoice_number, v_booking_id, v_customer_id, 'E2E Cliente', v_quote_id,
    jsonb_build_array(jsonb_build_object('description', 'Renta mensual E2E',
      'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal)),
    v_subtotal, 16, v_tax, v_total, 'sent', public.today_mty(),
    public.today_mty() + INTERVAL '15 days', 'MXN', true, p_scope)
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_bookings (organization_id, invoice_id, booking_id, line_index)
  VALUES (v_org, v_invoice_id, v_booking_id, 0);

  INSERT INTO public.maintenance_logs (organization_id, forklift_id, service_type,
    description, cost, performed_at, work_status, is_e2e, e2e_scope)
  VALUES (v_org, v_forklift_id, 'preventive', 'E2E Kanban WO - ' || substr(p_scope, 1, 16),
    0, public.today_mty(), 'pending', true, p_scope)
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

-- ---------------------------------------------------------------------------
-- 4) Semilla del escenario de portal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.e2e_seed_portal_scenario(p_scope text, p_portal_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_user_id uuid;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 10000;
  v_tax numeric := 1600;
  v_total numeric := 11600;
  v_allowed boolean;
  v_existing_customer_ids uuid[];
  v_has_role boolean;
BEGIN
  v_org := public.e2e_require_admin_organization('e2e_seed_portal_scenario');

  IF p_scope IS NULL OR length(trim(p_scope)) = 0 THEN
    RAISE EXCEPTION 'e2e_seed_portal_scenario requires a non-null p_scope';
  END IF;
  IF p_portal_email IS NULL OR length(trim(p_portal_email)) = 0 THEN
    RAISE EXCEPTION 'e2e_seed_portal_scenario requires a non-null p_portal_email';
  END IF;

  SELECT coalesce(cs.allow_e2e_seed, false) INTO v_allowed
  FROM public.company_settings cs
  WHERE cs.organization_id = v_org;
  IF NOT coalesce(v_allowed, false) THEN
    RAISE EXCEPTION 'E2E seeding disabled on this environment';
  END IF;

  PERFORM set_config('app.e2e_seed', 'on', true);

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_portal_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Portal user % not found in auth.users', p_portal_email;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_user_id)
    INTO v_has_role;
  IF NOT v_has_role THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'customer'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NOT public.has_role(v_user_id, 'customer'::app_role) THEN
    RAISE EXCEPTION 'El usuario % ya tiene un rol distinto de customer; no se altera desde el seed E2E', p_portal_email;
  END IF;

  -- Sólo los clientes E2E del usuario que pertenecen a ESTA organización.
  SELECT coalesce(array_agg(c.id), '{}') INTO v_existing_customer_ids
  FROM public.customers c
  WHERE c.user_id = v_user_id
    AND c.is_e2e = true
    AND EXISTS (
      SELECT 1 FROM public.organization_customers oc
      WHERE oc.customer_id = c.id AND oc.organization_id = v_org
    );

  IF array_length(v_existing_customer_ids, 1) IS NOT NULL THEN
    DELETE FROM public.customer_payment_intents cpi
    WHERE cpi.organization_id = v_org
      AND cpi.invoice_id IN (
        SELECT i.id FROM public.invoices i
        WHERE i.organization_id = v_org
          AND i.customer_id = ANY(v_existing_customer_ids) AND i.is_e2e = true
      );

    DELETE FROM public.payments p
    WHERE p.organization_id = v_org
      AND p.invoice_id IN (
        SELECT i.id FROM public.invoices i
        WHERE i.organization_id = v_org
          AND i.customer_id = ANY(v_existing_customer_ids) AND i.is_e2e = true
      );

    DELETE FROM public.credit_notes cn
    WHERE cn.organization_id = v_org
      AND (
        cn.invoice_id IN (
          SELECT i.id FROM public.invoices i
          WHERE i.organization_id = v_org
            AND i.customer_id = ANY(v_existing_customer_ids) AND i.is_e2e = true
        )
        OR cn.customer_id = ANY(v_existing_customer_ids)
      );

    -- NOTA: la limpieza de objetos en storage se hace via Storage API desde el
    -- teardown de Playwright; borrar de storage.objects esta bloqueado.

    DELETE FROM public.invoices i
     WHERE i.organization_id = v_org
       AND i.customer_id = ANY(v_existing_customer_ids) AND i.is_e2e = true;

    DELETE FROM public.bookings b
     WHERE b.organization_id = v_org
       AND b.customer_id = ANY(v_existing_customer_ids) AND b.is_e2e = true;

    DELETE FROM public.quote_assigned_forklifts qaf
     WHERE qaf.organization_id = v_org
       AND qaf.quote_id IN (
         SELECT q.id FROM public.quotes q
         WHERE q.organization_id = v_org
           AND q.customer_id = ANY(v_existing_customer_ids) AND q.is_e2e = true
       );

    DELETE FROM public.quotes q
     WHERE q.organization_id = v_org
       AND q.customer_id = ANY(v_existing_customer_ids) AND q.is_e2e = true;

    DELETE FROM public.organization_customers oc
     WHERE oc.organization_id = v_org
       AND oc.customer_id = ANY(v_existing_customer_ids);

    DELETE FROM public.customers c
     WHERE c.id = ANY(v_existing_customer_ids)
       AND c.is_e2e = true
       AND NOT EXISTS (
         SELECT 1 FROM public.organization_customers oc2
         WHERE oc2.customer_id = c.id
       );
  END IF;

  INSERT INTO public.customers (name, email, phone, rfc, user_id, is_e2e, e2e_scope,
    created_by_organization_id)
  VALUES ('E2E Portal ' || substr(p_scope, 1, 12),
          p_portal_email,
          '8181818181',
          'XAXX010101000',
          v_user_id,
          true,
          p_scope,
          v_org)
  RETURNING id INTO v_customer_id;

  INSERT INTO public.organization_customers (organization_id, customer_id, status)
  VALUES (v_org, v_customer_id, 'active')
  ON CONFLICT (organization_id, customer_id) DO NOTHING;

  v_invoice_number := public.next_invoice_number_e2e();
  INSERT INTO public.invoices (organization_id, invoice_number, customer_id, customer_name,
    line_items, subtotal, tax_rate, tax_amount, total,
    status, issued_at, due_date, moneda, is_e2e, e2e_scope)
  VALUES (v_org, v_invoice_number, v_customer_id, 'E2E Portal',
    jsonb_build_array(jsonb_build_object('description', 'Renta portal E2E',
      'quantity', 1, 'unit_price', v_subtotal, 'total', v_subtotal)),
    v_subtotal, 16, v_tax, v_total, 'sent', public.today_mty(),
    public.today_mty() + INTERVAL '15 days', 'MXN', true, p_scope)
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

-- ---------------------------------------------------------------------------
-- 5) Teardown por scope, acotado a la organización del llamante.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.e2e_teardown(p_scope text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
  v_ids uuid[];
  v_customer_ids uuid[];
BEGIN
  v_org := public.e2e_require_admin_organization('e2e_teardown');

  IF p_scope IS NULL OR length(trim(p_scope)) = 0 THEN
    RAISE EXCEPTION 'e2e_teardown requires a non-null p_scope';
  END IF;

  PERFORM set_config('app.e2e_teardown', 'on', true);

  SELECT coalesce(array_agg(c.id), '{}') INTO v_customer_ids
  FROM public.customers c
  WHERE c.is_e2e = true
    AND c.e2e_scope = p_scope
    AND EXISTS (
      SELECT 1 FROM public.organization_customers oc
      WHERE oc.customer_id = c.id AND oc.organization_id = v_org
    );

  SELECT COALESCE(array_agg(id), '{}') INTO v_ids FROM (
    SELECT id FROM public.invoices WHERE is_e2e AND e2e_scope = p_scope AND organization_id = v_org
    UNION ALL SELECT id FROM public.bookings WHERE is_e2e AND e2e_scope = p_scope AND organization_id = v_org
    UNION ALL SELECT id FROM public.quotes WHERE is_e2e AND e2e_scope = p_scope AND organization_id = v_org
    UNION ALL SELECT id FROM public.forklifts WHERE is_e2e AND e2e_scope = p_scope AND organization_id = v_org
    UNION ALL SELECT id FROM public.equipment_models WHERE is_e2e AND e2e_scope = p_scope AND organization_id = v_org
    UNION ALL SELECT unnest(v_customer_ids)
    UNION ALL SELECT id FROM public.payments WHERE is_e2e AND e2e_scope = p_scope AND organization_id = v_org
  ) s;

  DELETE FROM public.payments p
   WHERE p.organization_id = v_org
     AND (
       (p.is_e2e = true AND p.e2e_scope = p_scope)
       OR p.invoice_id IN (
            SELECT i.id FROM public.invoices i
             WHERE i.organization_id = v_org AND i.is_e2e = true AND i.e2e_scope = p_scope
          )
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('payments', v_n);

  DELETE FROM public.credit_notes cn
   WHERE cn.organization_id = v_org
     AND (
       cn.invoice_id IN (
         SELECT i.id FROM public.invoices i
          WHERE i.organization_id = v_org AND i.is_e2e = true AND i.e2e_scope = p_scope
       )
       OR cn.customer_id = ANY(v_customer_ids)
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('credit_notes', v_n);

  -- NOTA: la limpieza de objetos en storage se hace via Storage API desde el
  -- teardown de Playwright; borrar de storage.objects esta bloqueado.
  v_counts := v_counts || jsonb_build_object('storage_objects', 0);

  DELETE FROM public.invoices
   WHERE is_e2e = true AND e2e_scope = p_scope AND organization_id = v_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('invoices', v_n);

  DELETE FROM public.bookings
   WHERE is_e2e = true AND e2e_scope = p_scope AND organization_id = v_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('bookings', v_n);

  DELETE FROM public.quote_assigned_forklifts qaf
    WHERE qaf.organization_id = v_org
      AND qaf.quote_id IN (
        SELECT q.id FROM public.quotes q
         WHERE q.organization_id = v_org AND q.is_e2e = true AND q.e2e_scope = p_scope);

  DELETE FROM public.quotes
   WHERE is_e2e = true AND e2e_scope = p_scope AND organization_id = v_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('quotes', v_n);

  DELETE FROM public.maintenance_parts mp
    WHERE mp.organization_id = v_org
      AND mp.maintenance_log_id IN (
        SELECT ml.id FROM public.maintenance_logs ml
         WHERE ml.organization_id = v_org
           AND ((ml.is_e2e = true AND ml.e2e_scope = p_scope)
             OR ml.forklift_id IN (SELECT f.id FROM public.forklifts f
                                    WHERE f.organization_id = v_org
                                      AND f.is_e2e = true AND f.e2e_scope = p_scope)));

  DELETE FROM public.maintenance_labor mlab
    WHERE mlab.organization_id = v_org
      AND mlab.maintenance_log_id IN (
        SELECT ml.id FROM public.maintenance_logs ml
         WHERE ml.organization_id = v_org
           AND ((ml.is_e2e = true AND ml.e2e_scope = p_scope)
             OR ml.forklift_id IN (SELECT f.id FROM public.forklifts f
                                    WHERE f.organization_id = v_org
                                      AND f.is_e2e = true AND f.e2e_scope = p_scope)));

  DELETE FROM public.maintenance_logs ml
   WHERE ml.organization_id = v_org
     AND ((ml.is_e2e = true AND ml.e2e_scope = p_scope)
       OR ml.forklift_id IN (SELECT f.id FROM public.forklifts f
                              WHERE f.organization_id = v_org
                                AND f.is_e2e = true AND f.e2e_scope = p_scope));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('maintenance_logs', v_n);

  DELETE FROM public.forklifts
   WHERE is_e2e = true AND e2e_scope = p_scope AND organization_id = v_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('forklifts', v_n);

  DELETE FROM public.equipment_models
   WHERE is_e2e = true AND e2e_scope = p_scope AND organization_id = v_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('equipment_models', v_n);

  DELETE FROM public.organization_customers oc
   WHERE oc.organization_id = v_org AND oc.customer_id = ANY(v_customer_ids);

  DELETE FROM public.customers c
   WHERE c.id = ANY(v_customer_ids)
     AND c.is_e2e = true
     AND c.e2e_scope = p_scope
     AND NOT EXISTS (
       SELECT 1 FROM public.organization_customers oc2 WHERE oc2.customer_id = c.id
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('customers', v_n);

  IF array_length(v_ids, 1) IS NOT NULL THEN
    DELETE FROM public.activity_feed af
     WHERE af.organization_id = v_org AND af.is_e2e = true AND af.entity_id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('activity_feed', v_n);
  ELSE
    v_counts := v_counts || jsonb_build_object('activity_feed', 0);
  END IF;

  RETURN v_counts;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) Purga de datos E2E: misma firma, alcance por organización.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_e2e_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_customer_ids uuid[];
  c_activity int; c_payments int; c_invoices int; c_bookings int;
  c_qaf int; c_quotes int; c_forklifts int; c_models int; c_customers int;
BEGIN
  v_org := public.e2e_require_admin_organization('purge_e2e_data');

  SELECT coalesce(array_agg(c.id), '{}') INTO v_customer_ids
  FROM public.customers c
  WHERE c.is_e2e = true
    AND EXISTS (
      SELECT 1 FROM public.organization_customers oc
      WHERE oc.customer_id = c.id AND oc.organization_id = v_org
    );

  DELETE FROM public.activity_feed
   WHERE is_e2e = true AND organization_id = v_org;
  GET DIAGNOSTICS c_activity = ROW_COUNT;

  DELETE FROM public.payments p
   WHERE p.organization_id = v_org
     AND (p.is_e2e = true
       OR p.invoice_id IN (SELECT i.id FROM public.invoices i
                            WHERE i.organization_id = v_org AND i.is_e2e = true));
  GET DIAGNOSTICS c_payments = ROW_COUNT;

  DELETE FROM public.invoices WHERE is_e2e = true AND organization_id = v_org;
  GET DIAGNOSTICS c_invoices = ROW_COUNT;

  DELETE FROM public.bookings WHERE is_e2e = true AND organization_id = v_org;
  GET DIAGNOSTICS c_bookings = ROW_COUNT;

  DELETE FROM public.quote_assigned_forklifts qaf
   WHERE qaf.organization_id = v_org
     AND qaf.quote_id IN (SELECT q.id FROM public.quotes q
                           WHERE q.organization_id = v_org AND q.is_e2e = true);
  GET DIAGNOSTICS c_qaf = ROW_COUNT;

  DELETE FROM public.quotes WHERE is_e2e = true AND organization_id = v_org;
  GET DIAGNOSTICS c_quotes = ROW_COUNT;

  DELETE FROM public.maintenance_parts mp
   WHERE mp.organization_id = v_org
     AND mp.maintenance_log_id IN (SELECT ml.id FROM public.maintenance_logs ml
                                    WHERE ml.organization_id = v_org AND ml.is_e2e = true);
  DELETE FROM public.maintenance_labor mlab
   WHERE mlab.organization_id = v_org
     AND mlab.maintenance_log_id IN (SELECT ml.id FROM public.maintenance_logs ml
                                      WHERE ml.organization_id = v_org AND ml.is_e2e = true);
  DELETE FROM public.maintenance_logs
   WHERE is_e2e = true AND organization_id = v_org;

  DELETE FROM public.forklifts WHERE is_e2e = true AND organization_id = v_org;
  GET DIAGNOSTICS c_forklifts = ROW_COUNT;

  DELETE FROM public.equipment_models WHERE is_e2e = true AND organization_id = v_org;
  GET DIAGNOSTICS c_models = ROW_COUNT;

  DELETE FROM public.organization_customers oc
   WHERE oc.organization_id = v_org AND oc.customer_id = ANY(v_customer_ids);

  DELETE FROM public.customers c
   WHERE c.id = ANY(v_customer_ids)
     AND c.is_e2e = true
     AND NOT EXISTS (
       SELECT 1 FROM public.organization_customers oc2 WHERE oc2.customer_id = c.id
     );
  GET DIAGNOSTICS c_customers = ROW_COUNT;

  RETURN jsonb_build_object(
    'activity_feed', c_activity,
    'payments', c_payments,
    'invoices', c_invoices,
    'bookings', c_bookings,
    'quote_assigned_forklifts', c_qaf,
    'quotes', c_quotes,
    'forklifts', c_forklifts,
    'equipment_models', c_models,
    'customers', c_customers
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7) Purga de bitácora E2E: misma firma, alcance por organización.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_e2e_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_n integer := 0;
BEGIN
  v_org := public.e2e_require_admin_organization('purge_e2e_audit_logs');

  PERFORM set_config('app.audit_maintenance', 'on', true);
  DELETE FROM public.audit_logs
   WHERE is_e2e = true AND organization_id = v_org;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('app.audit_maintenance', 'off', true);

  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.e2e_seed_scenario(text) IS
  'Semilla E2E del escenario interno, acotada a la organización interna activa del llamante.';
COMMENT ON FUNCTION public.e2e_seed_portal_scenario(text, text) IS
  'Semilla E2E del escenario de portal, acotada a la organización interna activa del llamante.';
COMMENT ON FUNCTION public.e2e_teardown(text) IS
  'Limpieza E2E por scope, acotada a la organización interna activa del llamante.';
COMMENT ON FUNCTION public.purge_e2e_data() IS
  'Purga de datos E2E de la organización interna activa del llamante (nunca global).';
COMMENT ON FUNCTION public.purge_e2e_audit_logs() IS
  'Purga de bitácora E2E de la organización interna activa del llamante (nunca global).';

-- ---------------------------------------------------------------------------
-- 8) ACL: PUBLIC y anon sin EXECUTE; authenticated sólo con guarda tenant.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.e2e_require_admin_organization(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.e2e_require_admin_organization(text) FROM anon;
REVOKE ALL ON FUNCTION public.e2e_seed_scenario(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.e2e_seed_scenario(text) FROM anon;
REVOKE ALL ON FUNCTION public.e2e_seed_portal_scenario(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.e2e_seed_portal_scenario(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.e2e_teardown(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.e2e_teardown(text) FROM anon;
REVOKE ALL ON FUNCTION public.purge_e2e_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_e2e_data() FROM anon;
REVOKE ALL ON FUNCTION public.purge_e2e_audit_logs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_e2e_audit_logs() FROM anon;

GRANT EXECUTE ON FUNCTION public.e2e_seed_scenario(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.e2e_seed_portal_scenario(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.e2e_teardown(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_e2e_data() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_e2e_audit_logs() TO authenticated, service_role;
-- La guarda interna no se expone a `authenticated`: es un detalle interno.
GRANT EXECUTE ON FUNCTION public.e2e_require_admin_organization(text) TO service_role;
