-- =====================================================================
-- Multi-organización · Fase 4.1 (aislamiento de lecturas)
--
-- Los permisos por rol existentes siguen definiendo QUÉ puede hacer cada
-- usuario. Esta policy RESTRICTIVE común define a QUÉ organización aplica.
-- Mientras exista una sola organización se conserva la ruta heredada para
-- usuarios sin membresía; con dos o más, la membresía es obligatoria.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.organization_scope_matches(
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_organization_id IS NOT NULL
     AND (
       p_organization_id = public.current_organization_id()
       OR (
         public.current_organization_id() IS NULL
         AND (
           SELECT count(*) = 1
           FROM public.organizations
           WHERE is_active
         )
       )
     )
$$;

REVOKE ALL ON FUNCTION public.organization_scope_matches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organization_scope_matches(uuid)
  TO authenticated, service_role;

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
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'No existe la tabla operativa public.%', v_table;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND p.polname = 'org_scope_isolation'
    ) THEN
      RAISE EXCEPTION
        'La tabla % ya tiene una policy org_scope_isolation; no se reemplaza automáticamente',
        v_table;
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
       USING ((SELECT public.organization_scope_matches(organization_id)))
       WITH CHECK ((SELECT public.organization_scope_matches(organization_id)))',
      'org_scope_isolation',
      v_table
    );
  END LOOP;
END;
$$;
