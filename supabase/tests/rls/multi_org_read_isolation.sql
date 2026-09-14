-- Multi-organización Fase 4: RLS y portal se aíslan por organización.
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

  INSERT INTO public.user_roles (user_id, role)
  VALUES
    (v_staff_a, 'admin'::public.app_role),
    (v_portal_b, 'customer'::public.app_role);

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

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"e5000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_visible integer;
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
END;
$$;

ROLLBACK;
