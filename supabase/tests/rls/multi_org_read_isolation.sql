-- Multi-organización Fases 4-5: RLS, configuración y portal se aíslan por organización.
-- Usa un cliente comercial compartido con dos cuentas de portal distintas.
BEGIN;

DO $$
DECLARE
  v_org_a uuid;
  v_org_b uuid := 'e5000000-0000-4000-8000-0000000000b1';
  v_staff_a uuid := 'e5000000-0000-4000-8000-0000000000a1';
  v_portal_b uuid := 'e5000000-0000-4000-8000-0000000000b2';
  v_customer uuid := 'e5000000-0000-4000-8000-0000000000c1';
  v_tables text[] := ARRAY[
    'activity_feed', 'audit_logs', 'bank_accounts',
    'bank_statement_imports', 'bank_statement_lines',
    'bank_statement_upload_chunks', 'bank_statement_uploads',
    'billing_secrets', 'booking_extensions', 'bookings',
    'cfdi_retry_queue', 'collection_notes', 'collection_reminders_log',
    'company_settings', 'contract_templates', 'contracts', 'credit_notes',
    'customer_payment_intents', 'damage_records', 'deliveries', 'documents',
    'drivers', 'equipment_models', 'feedback_reports',
    'feedback_status_history', 'fiscal_periods', 'forklifts',
    'invoice_bookings', 'invoice_number_settings', 'invoices',
    'maintenance_labor', 'maintenance_logs', 'maintenance_parts',
    'maintenance_policies', 'mechanics', 'notifications',
    'operating_expenses', 'parts_inventory', 'payments', 'prospects',
    'quote_assigned_forklifts', 'quotes', 'rate_limits',
    'return_inspections', 'status_logs', 'supplier_bank_accounts',
    'supplier_bill_approvals', 'supplier_bills', 'supplier_contacts',
    'supplier_payment_batch_items', 'supplier_payment_batches',
    'supplier_payments', 'suppliers', 'user_manual', 'webhook_events'
  ];
  v_table text;
BEGIN
  -- Toda tabla operativa debe tener una policy RESTRICTIVE de scope.
  FOREACH v_table IN ARRAY v_tables LOOP
    IF (
      SELECT count(*)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND p.polname = 'org_scope_isolation'
        AND NOT p.polpermissive
        AND p.polcmd = '*'
    ) <> 1 THEN
      RAISE EXCEPTION
        'RLS ORG: % debe tener una policy RESTRICTIVE org_scope_isolation',
        v_table;
    END IF;
  END LOOP;

  SELECT id INTO v_org_a
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  IF v_org_a IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere la organización inicial';
  END IF;

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_b, 'Organización B de prueba', 'rls-org-b');

  -- auth.users dispara la creación de profile y su auditoría. En un flujo
  -- multi-org la operación de servicio debe declarar el contexto ANTES.
  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_staff_a, 'staff-org-a@rls.test', now(), now());

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_portal_b, 'portal-org-b@rls.test', now(), now());

  INSERT INTO public.organization_memberships (
    organization_id, auth_user_id, member_type
  )
  VALUES
    (v_org_a, v_staff_a, 'internal'),
    (v_org_b, v_portal_b, 'portal');

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_staff_a, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role;

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_portal_b, 'customer'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role;

  INSERT INTO public.customers (id, name)
  VALUES (v_customer, 'Cliente comercial compartido');

  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES
    (v_org_a, v_customer),
    (v_org_b, v_customer);

  INSERT INTO public.customer_portal_accounts (
    organization_id, customer_id, auth_user_id, email
  )
  VALUES (
    v_org_b, v_customer, v_portal_b, 'portal-org-b@rls.test'
  );

  INSERT INTO public.activity_feed (
    id, event_type, entity_type, entity_id, title, organization_id
  )
  VALUES
    (
      'e5000000-0000-4000-8000-0000000000d1',
      'test', 'org_scope',
      'e5000000-0000-4000-8000-0000000000d1',
      'Actividad de A', v_org_a
    ),
    (
      'e5000000-0000-4000-8000-0000000000d2',
      'test', 'org_scope',
      'e5000000-0000-4000-8000-0000000000d2',
      'Actividad de B', v_org_b
    );

  -- Fase 5: cada organización puede tener su cuenta de cobranza por
  -- defecto y cerrar el mismo periodo fiscal sin afectar a la otra.
  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.bank_accounts (
    id, name, bank, account_number, account_holder, is_default_collection,
    organization_id
  )
  VALUES (
    'e5000000-0000-4000-8000-0000000000f1',
    'Cobranza A', 'Banco A', '0001', 'Organización A', true, v_org_a
  );

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.bank_accounts (
    id, name, bank, account_number, account_holder, is_default_collection,
    organization_id
  )
  VALUES (
    'e5000000-0000-4000-8000-0000000000f2',
    'Cobranza B', 'Banco B', '0002', 'Organización B', true, v_org_b
  );

  INSERT INTO public.fiscal_periods (
    organization_id, period, closed_at
  )
  VALUES (v_org_b, '2098-12', now());

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.fiscal_periods (organization_id, period)
  VALUES (v_org_a, '2098-12');

  -- Cada operación de servicio fija su contexto explícitamente. Esto
  -- reproduce el requisito real cuando ya hay más de una organización.
  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.quotes (
    id, customer_id, quote_number, status, subtotal, tax_amount, total,
    organization_id
  )
  VALUES (
    'e5000000-0000-4000-8000-0000000000e1',
    v_customer, 'RLS-ORG-A', 'draft', 100, 0, 100, v_org_a
  );

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.quotes (
    id, customer_id, quote_number, status, subtotal, tax_amount, total,
    organization_id
  )
  VALUES (
    'e5000000-0000-4000-8000-0000000000e2',
    v_customer, 'RLS-ORG-B', 'draft', 100, 0, 100, v_org_b
  );
END;
$$;

-- Las RPC analíticas se ejecutan como invoker para respetar las policies RLS.
DO $$
DECLARE
  v_remaining_definers text;
  v_org_a uuid;
  v_blocked boolean := false;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_remaining_definers
  FROM pg_proc p
  WHERE p.oid IN (
    'public.get_activity_metrics(timestamptz,timestamptz)'::regprocedure,
    'public.get_available_forklifts(date,date)'::regprocedure,
    'public.get_dashboard_stats()'::regprocedure,
    'public.get_income_statement(date,date,text)'::regprocedure,
    'public.get_insurance_alerts()'::regprocedure,
    'public.get_sale_available_forklifts(integer,integer)'::regprocedure,
    'public.get_sidebar_badge_counts()'::regprocedure,
    'public.report_maintenance_cost_by_unit(date,date)'::regprocedure,
    'public.report_profit_by_model(date,date)'::regprocedure,
    'public.report_revenue_by_month(date,date)'::regprocedure,
    'public.report_revenue_month_invoices(text)'::regprocedure,
    'public.report_utilization_by_model(date,date)'::regprocedure,
    'public.report_utilization_by_unit(date,date)'::regprocedure
  )
    AND p.prosecdef;

  IF v_remaining_definers IS NOT NULL THEN
    RAISE EXCEPTION
      'RPC ORG: las lecturas deben ser SECURITY INVOKER; siguen definer: %',
      v_remaining_definers;
  END IF;

  IF position(
    'organization_scope_matches'
    IN pg_get_functiondef('public.get_portal_collection_account()'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION 'CONFIG ORG: get_portal_collection_account no valida organización';
  END IF;

  IF position(
    'organization_scope_matches'
    IN pg_get_functiondef('public.maintenance_buffer_days()'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION 'CONFIG ORG: maintenance_buffer_days no valida organización';
  END IF;

  IF to_regprocedure('public.guard_fiscal_period_open(date,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'FISCAL ORG: quedó expuesta la variante global de dos argumentos';
  END IF;

  SELECT id INTO v_org_a
  FROM public.organizations
  WHERE id <> 'e5000000-0000-4000-8000-0000000000b1'::uuid
    AND is_active
  ORDER BY created_at
  LIMIT 1;

  PERFORM public.guard_fiscal_period_open('2098-12-15', 'test', v_org_a);

  BEGIN
    PERFORM public.guard_fiscal_period_open(
      '2098-12-15',
      'test',
      'e5000000-0000-4000-8000-0000000000b1'::uuid
    );
  EXCEPTION WHEN raise_exception THEN
    v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'FISCAL ORG: el cierre de la organización B no se hizo cumplir';
  END IF;
END;
$$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"e5000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_visible integer;
  v_activity_metric_total integer;
BEGIN
  SELECT count(*) INTO v_visible
  FROM public.activity_feed
  WHERE id IN (
    'e5000000-0000-4000-8000-0000000000d1',
    'e5000000-0000-4000-8000-0000000000d2'
  );

  IF v_visible <> 1 THEN
    RAISE EXCEPTION
      'RLS ORG: el staff de A ve % actividades entre A y B (esperado 1)',
      v_visible;
  END IF;

  SELECT (public.get_activity_metrics(
    now() - interval '1 hour',
    now() + interval '1 hour'
  ) ->> 'total')::integer
  INTO v_activity_metric_total;

  IF v_activity_metric_total <> 1 THEN
    RAISE EXCEPTION
      'RPC ORG: get_activity_metrics devolvió % actividades para A (esperado 1)',
      v_activity_metric_total;
  END IF;
END;
$$;

RESET ROLE;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"e5000000-0000-4000-8000-0000000000b2","role":"authenticated"}';

DO $$
DECLARE
  v_visible integer;
  v_customer uuid;
  v_collection_bank text;
BEGIN
  SELECT public.get_customer_id_for_user(auth.uid()) INTO v_customer;
  IF v_customer IS DISTINCT FROM 'e5000000-0000-4000-8000-0000000000c1'::uuid THEN
    RAISE EXCEPTION
      'PORTAL ORG: la cuenta de B no resolvió su cliente desde customer_portal_accounts';
  END IF;

  SELECT count(*) INTO v_visible
  FROM public.quotes
  WHERE id IN (
    'e5000000-0000-4000-8000-0000000000e1',
    'e5000000-0000-4000-8000-0000000000e2'
  );

  IF v_visible <> 1 THEN
    RAISE EXCEPTION
      'PORTAL ORG: la cuenta de B ve % cotizaciones del mismo cliente entre A y B (esperado 1)',
      v_visible;
  END IF;

  SELECT p.bank INTO v_collection_bank
  FROM public.get_portal_collection_account() AS p;

  IF v_collection_bank IS DISTINCT FROM 'Banco B' THEN
    RAISE EXCEPTION
      'PORTAL ORG: la cuenta de B recibió la cuenta de cobranza % (esperado Banco B)',
      v_collection_bank;
  END IF;
END;
$$;

ROLLBACK;
