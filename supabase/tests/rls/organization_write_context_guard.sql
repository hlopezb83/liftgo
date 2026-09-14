-- Multi-organización Fase 3: cada tabla operativa protege su contexto
-- de escritura y conserva compatibilidad transicional con una sola organización.
BEGIN;

DO $$
DECLARE
  v_table text;
  v_trigger_count integer;
  v_only_organization_id uuid;
  v_assigned_organization_id uuid;
  v_second_organization_id uuid := '9c000000-0000-4000-8000-0000000000f2';
  v_tables text[] := ARRAY[
    'activity_feed',
    'audit_logs',
    'bank_accounts',
    'bank_statement_imports',
    'bank_statement_lines',
    'bank_statement_upload_chunks',
    'bank_statement_uploads',
    'billing_secrets',
    'booking_extensions',
    'bookings',
    'cfdi_retry_queue',
    'collection_notes',
    'collection_reminders_log',
    'company_settings',
    'contract_templates',
    'contracts',
    'credit_notes',
    'customer_payment_intents',
    'damage_records',
    'deliveries',
    'documents',
    'drivers',
    'equipment_models',
    'feedback_reports',
    'feedback_status_history',
    'fiscal_periods',
    'forklifts',
    'invoice_bookings',
    'invoice_number_settings',
    'invoices',
    'maintenance_labor',
    'maintenance_logs',
    'maintenance_parts',
    'maintenance_policies',
    'mechanics',
    'notifications',
    'operating_expenses',
    'parts_inventory',
    'payments',
    'prospects',
    'quote_assigned_forklifts',
    'quotes',
    'rate_limits',
    'return_inspections',
    'status_logs',
    'supplier_bank_accounts',
    'supplier_bill_approvals',
    'supplier_bills',
    'supplier_contacts',
    'supplier_payment_batch_items',
    'supplier_payment_batches',
    'supplier_payments',
    'suppliers',
    'user_manual',
    'webhook_events'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    SELECT count(*)
    INTO v_trigger_count
    FROM pg_trigger t
    JOIN pg_class relation ON relation.oid = t.tgrelid
    JOIN pg_namespace relation_ns ON relation_ns.oid = relation.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE relation_ns.nspname = 'public'
      AND relation.relname = v_table
      AND t.tgname = 'trg_organization_write_context'
      AND NOT t.tgisinternal
      AND t.tgenabled = 'O'
      AND p.proname = 'enforce_organization_write_context'
      AND (t.tgtype & 2) = 2 -- BEFORE
      AND (t.tgtype & 4) = 4 -- INSERT
      AND (t.tgtype & 16) = 16; -- UPDATE

    IF v_trigger_count <> 1 THEN
      RAISE EXCEPTION
        'ESCRITURA: % debe tener exactamente un trigger BEFORE INSERT/UPDATE de contexto organizacional',
        v_table;
    END IF;
  END LOOP;

  SELECT id INTO v_only_organization_id
  FROM public.organizations
  WHERE is_active;

  IF v_only_organization_id IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere una organización activa para probar el guardia';
  END IF;

  -- La prueba usa un destino temporal para verificar la semántica real de la
  -- función sin depender de columnas de negocio ni dejar datos persistentes.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('app.organization_id', '', true);

  INSERT INTO public.customers (id, name)
  VALUES (
    '9c000000-0000-4000-8000-0000000000e1',
    'Cliente de prueba de transición'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_customers oc
    WHERE oc.organization_id = v_only_organization_id
      AND oc.customer_id = '9c000000-0000-4000-8000-0000000000e1'::uuid
  ) THEN
    RAISE EXCEPTION
      'ESCRITURA: un cliente nuevo debe crear su relación durante la transición de una organización';
  END IF;

  EXECUTE 'CREATE TEMP TABLE organization_write_guard_probe (
    id uuid PRIMARY KEY,
    organization_id uuid
  ) ON COMMIT DROP';
  EXECUTE 'CREATE TRIGGER trg_organization_write_context
    BEFORE INSERT OR UPDATE ON organization_write_guard_probe
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_organization_write_context()';

  EXECUTE $sql$
    INSERT INTO organization_write_guard_probe (id, organization_id)
    VALUES ('9c000000-0000-4000-8000-0000000000f1', NULL)
  $sql$;

  EXECUTE $sql$
    SELECT organization_id
    FROM organization_write_guard_probe
    WHERE id = '9c000000-0000-4000-8000-0000000000f1'
  $sql$
  INTO v_assigned_organization_id;

  IF v_assigned_organization_id IS DISTINCT FROM v_only_organization_id THEN
    RAISE EXCEPTION
      'ESCRITURA: una inserción sin contexto debe recibir la organización única activa';
  END IF;

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_second_organization_id, 'Organización de prueba', 'test-write-guard-org-2');
  PERFORM set_config('app.organization_id', '', true);

  BEGIN
    EXECUTE $sql$
      INSERT INTO organization_write_guard_probe (id, organization_id)
      VALUES ('9c000000-0000-4000-8000-0000000000f3', NULL)
    $sql$;
    RAISE EXCEPTION
      'ESCRITURA: una inserción sin contexto debía rechazarse con dos organizaciones';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END;
$$;

ROLLBACK;
