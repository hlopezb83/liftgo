-- Multiempresa · paso 5: las doce RPC SECURITY DEFINER del lote 0042 no cruzan
-- de empresa.
--
--   * Dos empresas reales (A y B) con datos equivalentes y un administrador cada una.
--   * Desde la sesión del administrador de A se invoca cada firma con recursos
--     de B: todas deben fallar (o no reclamar nada) sin tocar B.
--   * Mezcla A/B (reserva de A + montacargas de B) falla antes de escribir.
--   * Casos positivos por dominio dentro de A: banca (begin/stage/finalize/match),
--     inspección (complete/correct), mantenimiento, intento de pago, prospectos,
--     roles, secretos y folio de nota de crédito.
--   * Tras RESET ROLE y RESET request.jwt.claims se verifica que B quedó intacta.
--   * ROLLBACK al final: no persiste nada.
BEGIN;

-- ── 0. Alta de las dos empresas y sus recursos ───────────────────────
DO $$
DECLARE
  v_org_a uuid := '42000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '42000000-0000-4000-8000-0000000000b0';
  v_admin_a uuid := '42000000-0000-4000-8000-0000000000a1';
  v_user_a uuid := '42000000-0000-4000-8000-0000000000a2';
  v_admin_b uuid := '42000000-0000-4000-8000-0000000000b1';
  v_user_b uuid := '42000000-0000-4000-8000-0000000000b2';
BEGIN
  IF pg_get_functiondef('public.reject_payment_intent(uuid, text)'::regprocedure)
       !~ 'current_internal_organization_id' THEN
    RAISE EXCEPTION 'RPC ORG 0042: la cadena Drizzle 0042 no se aplicó';
  END IF;

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Montacargas del Norte 0042', 'rpc-0042-a'),
    (v_org_b, 'Elevación Industrial del Bajío 0042', 'rpc-0042-b');

  -- ══════════════ Empresa A ══════════════
  PERFORM set_config('app.organization_id', v_org_a::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
    (v_admin_a, 'ana.reyes.0042@montacargasnorte.test', now(), now()),
    (v_user_a, 'luis.vega.0042@montacargasnorte.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
    (v_org_a, v_admin_a, 'internal'),
    (v_org_a, v_user_a, 'internal');
  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin_a, 'admin'::public.app_role),
    (v_user_a, 'ventas'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.customers (id, name, created_by_organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000a3', 'Aceros de Apodaca SA de CV', v_org_a);
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_a, '42000000-0000-4000-8000-0000000000a3');

  INSERT INTO public.invoices
    (id, invoice_number, customer_id, status, line_items, subtotal, tax_amount, total, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000a4', 'FAC-A-0042',
          '42000000-0000-4000-8000-0000000000a3', 'sent',
          '[{"description":"Renta mensual Toyota 8FGU25","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
          10000, 1600, 11600, v_org_a);

  INSERT INTO public.credit_notes
    (id, credit_note_number, invoice_id, customer_id, motive, reason_text,
     subtotal, tax_amount, total, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000a5', 'NC-BORRADOR-A',
          '42000000-0000-4000-8000-0000000000a4',
          '42000000-0000-4000-8000-0000000000a3', 'discount',
          'Descuento comercial autorizado', 1000, 160, 1160, v_org_a);

  INSERT INTO public.bank_accounts (id, name, bank, currency, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000a6', 'Cuenta operativa A', 'BBVA México', 'MXN', v_org_a);

  INSERT INTO public.forklifts (id, name, model, status, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000a7', 'MC-A-0042', 'Toyota 8FGU25', 'available', v_org_a);

  INSERT INTO public.bookings
    (id, booking_number, forklift_id, customer_id, start_date, end_date, status, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000a8', 'RES-A-0042',
          '42000000-0000-4000-8000-0000000000a7',
          '42000000-0000-4000-8000-0000000000a3',
          current_date - 30, current_date + 30, 'confirmed', v_org_a);

  INSERT INTO public.deliveries
    (id, booking_id, forklift_id, type, status, scheduled_date,
     completed_no_evidence_reason, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000a9',
          '42000000-0000-4000-8000-0000000000a8',
          '42000000-0000-4000-8000-0000000000a7', 'delivery', 'completed',
          current_date - 30,
          'Entrega de prueba autorizada por coordinación operativa', v_org_a);

  INSERT INTO public.maintenance_policies
    (id, forklift_id, provider_name, monthly_cost, is_active, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000aa',
          '42000000-0000-4000-8000-0000000000a7', 'Servicio Integral A', 2500, true, v_org_a);

  INSERT INTO public.customer_payment_intents
    (id, invoice_id, customer_id, amount, transfer_date, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000ab',
          '42000000-0000-4000-8000-0000000000a4',
          '42000000-0000-4000-8000-0000000000a3', 5000, current_date, v_org_a);

  INSERT INTO public.prospects (id, company_name, stage, stage_order, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000ac', 'Prospecto A 0042', 'nuevo_prospecto', 0, v_org_a);

  INSERT INTO public.billing_secrets (id, facturapi_test_key, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000ad', 'sk_test_a_original', v_org_a);

  -- ══════════════ Empresa B ══════════════
  PERFORM set_config('app.organization_id', v_org_b::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
    (v_admin_b, 'bruno.salas.0042@elevacionbajio.test', now(), now()),
    (v_user_b, 'sofia.luna.0042@elevacionbajio.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
    (v_org_b, v_admin_b, 'internal'),
    (v_org_b, v_user_b, 'internal');
  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin_b, 'admin'::public.app_role),
    (v_user_b, 'ventas'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.customers (id, name, created_by_organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000b3', 'Cerámica del Bajío SA de CV', v_org_b);
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_b, '42000000-0000-4000-8000-0000000000b3');

  INSERT INTO public.invoices
    (id, invoice_number, customer_id, status, line_items, subtotal, tax_amount, total, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000b4', 'FAC-B-0042',
          '42000000-0000-4000-8000-0000000000b3', 'sent',
          '[{"description":"Renta mensual Toyota 8FGU25","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
          10000, 1600, 11600, v_org_b);

  INSERT INTO public.credit_notes
    (id, credit_note_number, invoice_id, customer_id, motive, reason_text,
     subtotal, tax_amount, total, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000b5', 'NC-BORRADOR-B',
          '42000000-0000-4000-8000-0000000000b4',
          '42000000-0000-4000-8000-0000000000b3', 'discount',
          'Descuento comercial autorizado', 1000, 160, 1160, v_org_b);

  INSERT INTO public.bank_accounts (id, name, bank, currency, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000b6', 'Cuenta operativa B', 'Banorte', 'MXN', v_org_b);

  INSERT INTO public.forklifts (id, name, model, status, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000b7', 'MC-B-0042', 'Hyster H50FT', 'available', v_org_b);

  INSERT INTO public.bookings
    (id, booking_number, forklift_id, customer_id, start_date, end_date, status, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000b8', 'RES-B-0042',
          '42000000-0000-4000-8000-0000000000b7',
          '42000000-0000-4000-8000-0000000000b3',
          current_date - 30, current_date + 30, 'confirmed', v_org_b);

  INSERT INTO public.deliveries
    (id, booking_id, forklift_id, type, status, scheduled_date,
     completed_no_evidence_reason, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000b9',
          '42000000-0000-4000-8000-0000000000b8',
          '42000000-0000-4000-8000-0000000000b7', 'delivery', 'completed',
          current_date - 30,
          'Entrega de prueba autorizada por coordinación operativa', v_org_b);

  INSERT INTO public.maintenance_policies
    (id, forklift_id, provider_name, monthly_cost, is_active, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000ba',
          '42000000-0000-4000-8000-0000000000b7', 'Servicio Integral B', 2500, true, v_org_b);

  INSERT INTO public.customer_payment_intents
    (id, invoice_id, customer_id, amount, transfer_date, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000bb',
          '42000000-0000-4000-8000-0000000000b4',
          '42000000-0000-4000-8000-0000000000b3', 5000, current_date, v_org_b);

  INSERT INTO public.prospects (id, company_name, stage, stage_order, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000bc', 'Prospecto B 0042', 'nuevo_prospecto', 0, v_org_b);

  INSERT INTO public.billing_secrets (id, facturapi_test_key, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000bd', 'sk_test_b_original', v_org_b);

  -- Carga bancaria e importación de B (stage/finalize/match cross-org).
  INSERT INTO public.bank_statement_uploads
    (id, created_by, bank_account_id, file_name, expected_count, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000be', v_admin_b,
          '42000000-0000-4000-8000-0000000000b6', 'estado-b.csv', 1, v_org_b);

  INSERT INTO public.bank_statement_imports
    (id, bank_account_id, file_name, lines_count, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000bf',
          '42000000-0000-4000-8000-0000000000b6', 'estado-b.csv', 1, v_org_b);

  -- Inspección de devolución de B (correct_return_inspection cross-org).
  INSERT INTO public.return_inspections
    (id, booking_id, forklift_id, condition, fuel_level, organization_id)
  VALUES ('42000000-0000-4000-8000-0000000000c0',
          '42000000-0000-4000-8000-0000000000b8',
          '42000000-0000-4000-8000-0000000000b7', 'good', 'Full', v_org_b);
END $$;

-- ── 1. Sesión del administrador de A contra recursos de B ────────────
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"42000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_fallas text[] := '{}';
  v_txt text;
  v_uuid uuid;
  v_int integer;
  v_bool boolean;
  v_rec record;
BEGIN
  BEGIN
    v_txt := public.assign_stamped_credit_note_number('42000000-0000-4000-8000-0000000000b5', '7777');
    v_fallas := array_append(v_fallas, 'assign_stamped_credit_note_number: A folió una nota de crédito de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.begin_bank_statement_upload(
      gen_random_uuid(), '42000000-0000-4000-8000-0000000000b6',
      'cross.csv', current_date - 10, current_date, 1);
    v_fallas := array_append(v_fallas, 'begin_bank_statement_upload: A abrió carga en cuenta de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_int := public.stage_bank_statement_chunk(
      '42000000-0000-4000-8000-0000000000be', 0, '[]'::jsonb);
    v_fallas := array_append(v_fallas, 'stage_bank_statement_chunk: A cargó bloques en una carga de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.finalize_bank_statement_upload('42000000-0000-4000-8000-0000000000be');
    v_fallas := array_append(v_fallas, 'finalize_bank_statement_upload: A finalizó una carga de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.match_bank_statement_lines('42000000-0000-4000-8000-0000000000bf');
    v_fallas := array_append(v_fallas, 'match_bank_statement_lines: A concilió una importación de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_bool := public.claim_maintenance_policy_month(
      '42000000-0000-4000-8000-0000000000ba', '2026-12');
    IF v_bool THEN
      v_fallas := array_append(v_fallas, 'claim_maintenance_policy_month: A reclamó una póliza de B');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_uuid := public.complete_return_inspection(
      '42000000-0000-4000-8000-0000000000b8', '42000000-0000-4000-8000-0000000000b7',
      'good', NULL, 0, NULL, 'Full', 'Ana Reyes', now());
    v_fallas := array_append(v_fallas, 'complete_return_inspection: A cerró una devolución de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Mezcla A/B: reserva de A con montacargas de B.
  BEGIN
    v_uuid := public.complete_return_inspection(
      '42000000-0000-4000-8000-0000000000a8', '42000000-0000-4000-8000-0000000000b7',
      'good', NULL, 0, NULL, 'Full', 'Ana Reyes', now());
    v_fallas := array_append(v_fallas, 'complete_return_inspection: aceptó mezcla A/B');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  IF EXISTS (
    SELECT 1 FROM public.return_inspections
     WHERE booking_id = '42000000-0000-4000-8000-0000000000a8'
  ) THEN
    v_fallas := array_append(v_fallas, 'complete_return_inspection: la mezcla A/B escribió una inspección');
  END IF;

  BEGIN
    v_uuid := public.correct_return_inspection(
      '42000000-0000-4000-8000-0000000000c0', 'cross-org', 'minor_damage', 'daño', 500, NULL, 'Full');
    v_fallas := array_append(v_fallas, 'correct_return_inspection: A corrigió una inspección de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_uuid := public.reject_payment_intent('42000000-0000-4000-8000-0000000000bb', 'cross-org');
    v_fallas := array_append(v_fallas, 'reject_payment_intent: A rechazó un intento de pago de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.reorder_prospect_stage('42000000-0000-4000-8000-0000000000bc', 'negociacion', 0);
    v_fallas := array_append(v_fallas, 'reorder_prospect_stage: A movió un prospecto de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.update_user_role_safe(
      '42000000-0000-4000-8000-0000000000b2', 'dispatcher'::public.app_role);
    v_fallas := array_append(v_fallas, 'update_user_role_safe: A cambió el rol de un usuario de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_uuid := public.upsert_billing_secret(
      '42000000-0000-4000-8000-0000000000bd', 'sk_test_intruso', NULL);
    v_fallas := array_append(v_fallas, 'upsert_billing_secret: A modificó los secretos de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- UUID inexistente: mismo resultado genérico que el UUID ajeno.
  BEGIN
    v_uuid := public.reject_payment_intent('42000000-0000-4000-8000-00000000dead', 'inexistente');
    v_fallas := array_append(v_fallas, 'reject_payment_intent: aceptó un UUID inexistente');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF array_length(v_fallas, 1) > 0 THEN
    RAISE EXCEPTION 'RPC ORG 0042 (cross-org): %', array_to_string(v_fallas, ' | ');
  END IF;
  RAISE NOTICE 'OK: ninguna de las 12 RPC alcanzó recursos de B';
END $$;

-- ── 2. Casos positivos dentro de la empresa A ────────────────────────
DO $$
DECLARE
  v_fallas text[] := '{}';
  v_upload uuid := gen_random_uuid();
  v_import uuid;
  v_inspection uuid;
  v_txt text;
  v_uuid uuid;
  v_int integer;
  v_bool boolean;
BEGIN
  -- Banca: begin → stage → finalize → match.
  PERFORM public.begin_bank_statement_upload(
    v_upload, '42000000-0000-4000-8000-0000000000a6',
    'estado-a.csv', current_date - 30, current_date, 1);

  v_int := public.stage_bank_statement_chunk(v_upload, 0,
    jsonb_build_array(jsonb_build_object(
      'posted_date', to_char(current_date - 1, 'YYYY-MM-DD'),
      'description', 'Depósito cliente Aceros',
      'signed_amount', 1000,
      'reference', 'REF-A-0042')));
  IF v_int <> 1 THEN
    v_fallas := array_append(v_fallas, 'stage_bank_statement_chunk: no quedó una línea en staging');
  END IF;

  SELECT f.import_id INTO v_import
    FROM public.finalize_bank_statement_upload(v_upload) f;
  IF v_import IS NULL THEN
    v_fallas := array_append(v_fallas, 'finalize_bank_statement_upload: no creó la importación de A');
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.bank_statement_imports
       WHERE id = v_import
         AND organization_id = '42000000-0000-4000-8000-0000000000a0'
    ) THEN
      v_fallas := array_append(v_fallas, 'finalize_bank_statement_upload: la importación no heredó la organización');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.bank_statement_lines
       WHERE import_id = v_import
         AND organization_id = '42000000-0000-4000-8000-0000000000a0'
    ) THEN
      v_fallas := array_append(v_fallas, 'finalize_bank_statement_upload: las líneas no heredaron la organización');
    END IF;
    PERFORM public.match_bank_statement_lines(v_import);
  END IF;

  -- Mantenimiento.
  v_bool := public.claim_maintenance_policy_month(
    '42000000-0000-4000-8000-0000000000aa', '2026-12');
  IF NOT v_bool THEN
    v_fallas := array_append(v_fallas, 'claim_maintenance_policy_month: A no pudo reclamar su propia póliza');
  END IF;

  -- Inspección: completar y corregir.
  v_inspection := public.complete_return_inspection(
    '42000000-0000-4000-8000-0000000000a8', '42000000-0000-4000-8000-0000000000a7',
    'good', NULL, 0, NULL, 'Full', 'Ana Reyes', now());
  IF v_inspection IS NULL THEN
    v_fallas := array_append(v_fallas, 'complete_return_inspection: A no pudo cerrar su propia devolución');
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.return_inspections
       WHERE id = v_inspection
         AND organization_id = '42000000-0000-4000-8000-0000000000a0'
    ) THEN
      v_fallas := array_append(v_fallas, 'complete_return_inspection: la inspección no heredó la organización');
    END IF;
    v_uuid := public.correct_return_inspection(
      v_inspection, 'Corrección autorizada por coordinación', 'good', NULL, NULL, NULL, '3/4');
    IF v_uuid IS DISTINCT FROM v_inspection THEN
      v_fallas := array_append(v_fallas, 'correct_return_inspection: no devolvió la inspección corregida');
    END IF;
  END IF;

  -- Intento de pago.
  v_uuid := public.reject_payment_intent('42000000-0000-4000-8000-0000000000ab', 'Comprobante ilegible');
  IF v_uuid IS DISTINCT FROM '42000000-0000-4000-8000-0000000000ab'::uuid THEN
    v_fallas := array_append(v_fallas, 'reject_payment_intent: A no pudo rechazar su propio intento');
  END IF;

  -- Prospectos.
  PERFORM public.reorder_prospect_stage('42000000-0000-4000-8000-0000000000ac', 'negociacion', 0);
  IF NOT EXISTS (
    SELECT 1 FROM public.prospects
     WHERE id = '42000000-0000-4000-8000-0000000000ac' AND stage = 'negociacion'
  ) THEN
    v_fallas := array_append(v_fallas, 'reorder_prospect_stage: A no pudo mover su propio prospecto');
  END IF;

  -- Roles.
  PERFORM public.update_user_role_safe(
    '42000000-0000-4000-8000-0000000000a2', 'dispatcher'::public.app_role);
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = '42000000-0000-4000-8000-0000000000a2'
       AND role = 'dispatcher'::public.app_role
  ) THEN
    v_fallas := array_append(v_fallas, 'update_user_role_safe: A no pudo cambiar el rol de su propio usuario');
  END IF;

  -- Secretos de facturación.
  v_uuid := public.upsert_billing_secret(
    '42000000-0000-4000-8000-0000000000ad', 'sk_test_a_nuevo', NULL);
  IF v_uuid IS DISTINCT FROM '42000000-0000-4000-8000-0000000000ad'::uuid THEN
    v_fallas := array_append(v_fallas, 'upsert_billing_secret: A no pudo actualizar su propio secreto');
  END IF;

  -- Folio de nota de crédito.
  v_txt := public.assign_stamped_credit_note_number(
    '42000000-0000-4000-8000-0000000000a5', '12');
  IF v_txt <> 'NC-0012' THEN
    v_fallas := array_append(v_fallas, 'assign_stamped_credit_note_number: folio inesperado ' || coalesce(v_txt, 'NULL'));
  END IF;

  IF array_length(v_fallas, 1) > 0 THEN
    RAISE EXCEPTION 'RPC ORG 0042 (positivos A): %', array_to_string(v_fallas, ' | ');
  END IF;
  RAISE NOTICE 'OK: los ocho dominios funcionan dentro de la empresa A';
END $$;

-- ── 3. Fuera de la sesión de A: la empresa B quedó intacta ───────────
RESET ROLE;
RESET request.jwt.claims;

DO $$
DECLARE
  v_fallas text[] := '{}';
BEGIN
  IF (SELECT credit_note_number FROM public.credit_notes
       WHERE id = '42000000-0000-4000-8000-0000000000b5') <> 'NC-BORRADOR-B' THEN
    v_fallas := array_append(v_fallas, 'B: el folio de la nota de crédito cambió');
  END IF;

  IF (SELECT state FROM public.bank_statement_uploads
       WHERE id = '42000000-0000-4000-8000-0000000000be') <> 'staging'
     OR (SELECT staged_count FROM public.bank_statement_uploads
          WHERE id = '42000000-0000-4000-8000-0000000000be') <> 0 THEN
    v_fallas := array_append(v_fallas, 'B: la carga bancaria cambió de estado');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bank_statement_lines
     WHERE organization_id = '42000000-0000-4000-8000-0000000000b0'
  ) THEN
    v_fallas := array_append(v_fallas, 'B: aparecieron líneas bancarias');
  END IF;

  IF (SELECT last_generated_month FROM public.maintenance_policies
       WHERE id = '42000000-0000-4000-8000-0000000000ba') IS NOT NULL THEN
    v_fallas := array_append(v_fallas, 'B: la póliza de mantenimiento fue reclamada');
  END IF;

  IF (SELECT condition FROM public.return_inspections
       WHERE id = '42000000-0000-4000-8000-0000000000c0') <> 'good' THEN
    v_fallas := array_append(v_fallas, 'B: la inspección de devolución fue corregida');
  END IF;

  IF (SELECT status FROM public.bookings
       WHERE id = '42000000-0000-4000-8000-0000000000b8') <> 'confirmed' THEN
    v_fallas := array_append(v_fallas, 'B: la reserva cambió de estado');
  END IF;

  IF (SELECT status FROM public.customer_payment_intents
       WHERE id = '42000000-0000-4000-8000-0000000000bb') <> 'pending_review'::public.payment_intent_status THEN
    v_fallas := array_append(v_fallas, 'B: el intento de pago fue revisado');
  END IF;

  IF (SELECT stage FROM public.prospects
       WHERE id = '42000000-0000-4000-8000-0000000000bc') <> 'nuevo_prospecto' THEN
    v_fallas := array_append(v_fallas, 'B: el prospecto cambió de etapa');
  END IF;

  IF (SELECT role FROM public.user_roles
       WHERE user_id = '42000000-0000-4000-8000-0000000000b2') <> 'ventas'::public.app_role THEN
    v_fallas := array_append(v_fallas, 'B: el rol del usuario cambió');
  END IF;

  IF (SELECT facturapi_test_key FROM public.billing_secrets
       WHERE id = '42000000-0000-4000-8000-0000000000bd') <> 'sk_test_b_original' THEN
    v_fallas := array_append(v_fallas, 'B: el secreto de facturación cambió');
  END IF;

  IF array_length(v_fallas, 1) > 0 THEN
    RAISE EXCEPTION 'RPC ORG 0042 (B intacta): %', array_to_string(v_fallas, ' | ');
  END IF;
  RAISE NOTICE 'OK: la empresa B quedó intacta';
END $$;

ROLLBACK;
