-- =====================================================================
-- Multi-organización · Fase 1
-- Añade organization_id nullable a todas las tablas operativas y asigna
-- los datos históricos a la única organización existente.
--
-- Esta migración es deliberadamente aditiva: no cambia consultas, RLS,
-- funciones ni obliga al cliente a enviar organization_id todavía.
-- =====================================================================

DO $$
DECLARE
  v_table text;
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
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT',
      v_table
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_organization_id uuid;
  v_organization_count integer;
  v_table text;
  v_has_data boolean;
  v_has_null_organization boolean;
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
  SELECT count(*), min(id)
  INTO v_organization_count, v_organization_id
  FROM public.organizations;

  IF v_organization_count = 0 THEN
    FOREACH v_table IN ARRAY v_tables LOOP
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', v_table)
      INTO v_has_data;

      IF v_has_data THEN
        RAISE EXCEPTION
          'No hay organización para asignar los datos existentes de la tabla %',
          v_table
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  ELSIF v_organization_count = 1 THEN
    FOREACH v_table IN ARRAY v_tables LOOP
      EXECUTE format(
        'UPDATE public.%I SET organization_id = $1 WHERE organization_id IS NULL',
        v_table
      )
      USING v_organization_id;
    END LOOP;

    FOREACH v_table IN ARRAY v_tables LOOP
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM public.%I WHERE organization_id IS NULL)',
        v_table
      )
      INTO v_has_null_organization;

      IF v_has_null_organization THEN
        RAISE EXCEPTION
          'Quedaron filas sin organization_id en la tabla %',
          v_table
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  ELSE
    RAISE EXCEPTION
      'Fase 1 requiere exactamente una organización antes de habilitar datos multi-organización; se encontraron %',
      v_organization_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

DO $$
DECLARE
  v_table text;
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
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id)',
      'idx_' || v_table || '_organization_id',
      v_table
    );
  END LOOP;
END;
$$;
