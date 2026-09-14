-- =====================================================================
-- Multi-organización · Fase 3 (guardia transicional de escritura)
-- Atribuye las nuevas filas a la organización de la membresía. Mientras
-- exista una sola organización, conserva compatibilidad con los writers
-- de sistema que todavía no reciben contexto de usuario.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.enforce_organization_write_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_organization_id uuid;
  v_organization_count integer;
  v_only_organization_id uuid;
BEGIN
  -- La organización forma parte de la identidad inmutable de una fila.
  IF TG_OP = 'UPDATE'
     AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'La organización de un registro no se puede cambiar'
      USING ERRCODE = '23514';
  END IF;

  v_member_organization_id := public.current_organization_id();

  -- Un usuario autenticado siempre escribe exclusivamente en su propia
  -- organización. La columna se rellena si el cliente aún no la envía.
  IF v_member_organization_id IS NOT NULL THEN
    IF NEW.organization_id IS NULL THEN
      NEW.organization_id := v_member_organization_id;
    ELSIF NEW.organization_id IS DISTINCT FROM v_member_organization_id THEN
      RAISE EXCEPTION 'La organización indicada no corresponde al usuario autenticado'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  -- Las funciones de sistema usan service_role y no tienen auth.uid(). En la
  -- instalación histórica de una organización pueden seguir insertando sin
  -- contexto; en cuanto haya más de una deben proporcionar organization_id.
  IF NEW.organization_id IS NULL THEN
    SELECT count(*) INTO v_organization_count
    FROM public.organizations
    WHERE is_active;

    IF v_organization_count <> 1 THEN
      RAISE EXCEPTION
        'organization_id es obligatorio para operaciones sin membresía cuando hay % organizaciones activas',
        v_organization_count
        USING ERRCODE = '23514';
    END IF;

    SELECT id INTO v_only_organization_id
    FROM public.organizations
    WHERE is_active;

    NEW.organization_id := v_only_organization_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_organization_write_context() FROM PUBLIC;

DO $$
DECLARE
  v_table text;
  v_existing_function text;
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
    SELECT p.proname
    INTO v_existing_function
    FROM pg_trigger t
    JOIN pg_class relation ON relation.oid = t.tgrelid
    JOIN pg_namespace relation_ns ON relation_ns.oid = relation.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE relation_ns.nspname = 'public'
      AND relation.relname = v_table
      AND t.tgname = 'trg_organization_write_context'
      AND NOT t.tgisinternal;

    IF v_existing_function IS NULL THEN
      EXECUTE format(
        'CREATE TRIGGER %I
           BEFORE INSERT OR UPDATE ON public.%I
           FOR EACH ROW
           EXECUTE FUNCTION public.enforce_organization_write_context()',
        'trg_organization_write_context',
        v_table
      );
    ELSIF v_existing_function <> 'enforce_organization_write_context' THEN
      RAISE EXCEPTION
        'El trigger de contexto de organización en % ya apunta a %, no se reemplaza automáticamente',
        v_table, v_existing_function;
    END IF;
  END LOOP;
END;
$$;
