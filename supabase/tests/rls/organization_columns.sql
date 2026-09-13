-- Multi-organización Fase 1: cobertura completa de organization_id.
-- La migración debe mantener estas columnas nullable hasta que el código
-- escriba organización explícitamente, sin contaminar las identidades globales.
BEGIN;

DO $$
DECLARE
  v_table text;
  v_column_count integer;
  v_has_fk boolean;
  v_has_index boolean;
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
    INTO v_column_count
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = v_table
      AND c.column_name = 'organization_id'
      AND c.data_type = 'uuid'
      AND c.is_nullable = 'YES';

    IF v_column_count <> 1 THEN
      RAISE EXCEPTION
        'SCHEMA: %.organization_id debe existir como uuid nullable',
        v_table;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint fk
      JOIN pg_class child ON child.oid = fk.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_class parent ON parent.oid = fk.confrelid
      JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
      WHERE fk.contype = 'f'
        AND child_ns.nspname = 'public'
        AND child.relname = v_table
        AND parent_ns.nspname = 'public'
        AND parent.relname = 'organizations'
        AND fk.conkey @> ARRAY[
          (
            SELECT a.attnum
            FROM pg_attribute a
            WHERE a.attrelid = child.oid
              AND a.attname = 'organization_id'
              AND NOT a.attisdropped
          )
        ]::smallint[]
    )
    INTO v_has_fk;

    IF NOT v_has_fk THEN
      RAISE EXCEPTION
        'SCHEMA: %.organization_id debe referenciar organizations(id)',
        v_table;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_class idx
      JOIN pg_index i ON i.indexrelid = idx.oid
      JOIN pg_class child ON child.oid = i.indrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      WHERE child_ns.nspname = 'public'
        AND child.relname = v_table
        AND idx.relname = 'idx_' || v_table || '_organization_id'
    )
    INTO v_has_index;

    IF NOT v_has_index THEN
      RAISE EXCEPTION
        'SCHEMA: %.organization_id debe tener su índice por organización',
        v_table;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY['customers', 'profiles', 'user_roles', 'role_permissions'] LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = v_table
        AND c.column_name = 'organization_id'
    ) THEN
      RAISE EXCEPTION
        'SCHEMA: %.organization_id no corresponde a una entidad global',
        v_table;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;
