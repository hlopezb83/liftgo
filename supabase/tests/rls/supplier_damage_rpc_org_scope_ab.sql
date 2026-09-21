-- Multiempresa · paso 4 lote B: las RPC SECURITY DEFINER de cuentas por pagar,
-- daños, bitácora y sincronizaciones masivas (migración Drizzle 0041) no cruzan
-- de empresa.
--
--   * Dos empresas reales (A y B) con datos equivalentes.
--   * Desde la sesión del administrador de A se invoca cada firma con los UUID
--     de B: todas deben fallar y no dejar ningún cambio en B.
--   * Mezcla de identificadores A/B en los dos overloads de lotes: falla
--     atómicamente y no crea lote alguno.
--   * Operaciones masivas sin ID (release_stale_payment_locks y
--     sync_forklift_rental_status): sólo tocan la empresa A.
--   * Casos positivos representativos dentro de A.
--   * ROLLBACK al final: no persiste nada.
BEGIN;

-- ── 0. Alta de las dos empresas y sus recursos ───────────────────────
DO $$
DECLARE
  v_org_a uuid := '41000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '41000000-0000-4000-8000-0000000000b0';
  v_admin_a uuid := '41000000-0000-4000-8000-0000000000a1';
  v_admin_b uuid := '41000000-0000-4000-8000-0000000000b1';
BEGIN
  IF pg_get_functiondef('public.approve_supplier_bill(uuid, text)'::regprocedure)
       !~ 'current_internal_organization_id' THEN
    RAISE EXCEPTION 'RPC ORG 0041: la cadena Drizzle 0041 no se aplicó';
  END IF;

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Montacargas del Norte', 'rpc-cxp-a'),
    (v_org_b, 'Elevación Industrial del Bajío', 'rpc-cxp-b');

  -- ══════════════ Empresa A ══════════════
  PERFORM set_config('app.organization_id', v_org_a::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_a, 'ana.reyes@montacargasnorte.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_a, v_admin_a, 'internal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_a, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Proveedor con cuenta bancaria válida (CLABE de 18 dígitos).
  INSERT INTO public.suppliers (id, name, rfc, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000a2', 'Refacciones del Norte SA de CV', 'RNO010101AAA', v_org_a);
  INSERT INTO public.supplier_bank_accounts
    (id, supplier_id, bank_name, account_holder, clabe, is_primary, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000a3',
          '41000000-0000-4000-8000-0000000000a2', 'BBVA México',
          'Refacciones del Norte SA de CV', '012345678901234567', true, v_org_a);

  -- Las facturas con approval_status='approved' sólo pueden insertarse bajo el
  -- contexto de RPC de cuentas por pagar.
  PERFORM set_config('app.cxp_rpc', 'on', true);

  -- Factura pendiente de aprobación (approve / reject / reapproval).
  INSERT INTO public.supplier_bills
    (id, supplier_id, bill_number, subtotal, tax_amount, total, status, approval_status, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000a4',
          '41000000-0000-4000-8000-0000000000a2', 'PROV-A-0001',
          10000, 1600, 11600, 'pending', 'pending', v_org_a);

  -- Facturas aprobadas con saldo (pago directo y lotes).
  INSERT INTO public.supplier_bills
    (id, supplier_id, bill_number, subtotal, tax_amount, total, status, approval_status, organization_id)
  VALUES
    ('41000000-0000-4000-8000-0000000000a5',
     '41000000-0000-4000-8000-0000000000a2', 'PROV-A-0002',
     5000, 800, 5800, 'pending', 'approved', v_org_a),
    ('41000000-0000-4000-8000-0000000000a6',
     '41000000-0000-4000-8000-0000000000a2', 'PROV-A-0003',
     2000, 320, 2320, 'pending', 'approved', v_org_a);

  -- Factura con bloqueo de pago añejo (release_stale_payment_locks).
  INSERT INTO public.supplier_bills
    (id, supplier_id, bill_number, subtotal, tax_amount, total, status, approval_status,
     payment_in_progress_at, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000a7',
          '41000000-0000-4000-8000-0000000000a2', 'PROV-A-0004',
          1000, 160, 1160, 'pending', 'approved', now() - interval '48 hours', v_org_a);

  PERFORM set_config('app.cxp_rpc', 'off', true);

  -- El trigger set_supplier_payment_rep_required sólo conserva el REP pendiente
  -- cuando la factura es PPD.
  UPDATE public.supplier_bills SET payment_method_sat = 'PPD'
   WHERE id = '41000000-0000-4000-8000-0000000000a5';

  -- Pago con REP pendiente (mark_supplier_rep_rejected / reset_supplier_rep_pending).
  INSERT INTO public.supplier_payments
    (id, bill_id, payment_date, amount, rep_required, rep_status, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000a8',
          '41000000-0000-4000-8000-0000000000a5', current_date, 1000, true, 'pending', v_org_a);

  -- Montacargas de A.
  INSERT INTO public.forklifts (id, name, model, status, organization_id) VALUES
    ('41000000-0000-4000-8000-00000000fa01', 'MC-A-01', 'Toyota 8FGU25', 'available', v_org_a),
    ('41000000-0000-4000-8000-00000000fa02', 'MC-A-02', 'Hyster H50FT', 'available', v_org_a),
    ('41000000-0000-4000-8000-00000000fa03', 'MC-A-03', 'Yale GLP050', 'available', v_org_a),
    ('41000000-0000-4000-8000-00000000fa04', 'MC-A-04', 'Crown FC5200', 'available', v_org_a),
    ('41000000-0000-4000-8000-00000000fa05', 'MC-A-05', 'Nissan MP1F2', 'available', v_org_a);

  -- Daños de A: reportado, reparado y archivado.
  INSERT INTO public.damage_records
    (id, forklift_id, description, status, previous_forklift_status, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000a9',
          '41000000-0000-4000-8000-00000000fa03',
          'Rueda trasera dañada en maniobra', 'reported', 'available', v_org_a);
  INSERT INTO public.damage_records
    (id, forklift_id, description, status, repaired_at, previous_forklift_status, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000aa',
          '41000000-0000-4000-8000-00000000fa02',
          'Fuga hidráulica reparada', 'repaired', now(), 'available', v_org_a);
  INSERT INTO public.damage_records
    (id, forklift_id, description, status, repaired_at, deleted_at, previous_forklift_status, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000ab',
          '41000000-0000-4000-8000-00000000fa05',
          'Golpe en torre ya reparado', 'repaired', now(), now(), 'available', v_org_a);

  -- Bitácora de A: alta de un montacargas propio (revert la elimina).
  INSERT INTO public.audit_logs (id, table_name, record_id, action, old_data, new_data, user_id, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000ac', 'forklifts',
          '41000000-0000-4000-8000-00000000fa04', 'INSERT', NULL,
          '{"name":"MC-A-04"}'::jsonb, v_admin_a, v_org_a);
  -- Bitácora de A que apunta a una fila de B (no debe poder revertirse).
  INSERT INTO public.audit_logs (id, table_name, record_id, action, old_data, new_data, user_id, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000ad', 'forklifts',
          '41000000-0000-4000-8000-00000000fb04', 'INSERT', NULL,
          '{"name":"MC-B-04"}'::jsonb, v_admin_a, v_org_a);

  -- Cliente, reserva recurrente, entrega completada y factura de A.
  INSERT INTO public.customers (id, name, created_by_organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000af', 'Aceros de Apodaca SA de CV', v_org_a);
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_a, '41000000-0000-4000-8000-0000000000af');

  INSERT INTO public.bookings
    (id, booking_number, forklift_id, customer_id, start_date, end_date,
     status, recurring_billing, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000c1', 'RES-A-0001',
          '41000000-0000-4000-8000-00000000fa01',
          '41000000-0000-4000-8000-0000000000af',
          current_date - 30, current_date + 30, 'confirmed', true, v_org_a);

  INSERT INTO public.deliveries
    (id, booking_id, forklift_id, type, status, scheduled_date, completed_no_evidence_reason, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000c3',
          '41000000-0000-4000-8000-0000000000c1',
          '41000000-0000-4000-8000-00000000fa01', 'delivery', 'completed',
          current_date - 30,
          'Entrega de prueba autorizada por coordinación operativa', v_org_a);

  INSERT INTO public.invoices
    (id, invoice_number, customer_id, status, line_items, subtotal, tax_amount, total, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000ae', 'FAC-A-0001',
          '41000000-0000-4000-8000-0000000000af', 'sent',
          '[{"description":"Renta mensual Toyota 8FGU25","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
          10000, 1600, 11600, v_org_a);

  -- ══════════════ Empresa B ══════════════
  PERFORM set_config('app.organization_id', v_org_b::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_b, 'bruno.salas@elevacionbajio.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_b, v_admin_b, 'internal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_b, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.suppliers (id, name, rfc, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000b2', 'Hidráulica Irapuato SA de CV', 'HIR020202BBB', v_org_b);
  INSERT INTO public.supplier_bank_accounts
    (id, supplier_id, bank_name, account_holder, clabe, is_primary, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000b3',
          '41000000-0000-4000-8000-0000000000b2', 'Banorte',
          'Hidráulica Irapuato SA de CV', '098765432109876543', true, v_org_b);

  PERFORM set_config('app.cxp_rpc', 'on', true);

  INSERT INTO public.supplier_bills
    (id, supplier_id, bill_number, subtotal, tax_amount, total, status, approval_status, organization_id)
  VALUES
    ('41000000-0000-4000-8000-0000000000b4',
     '41000000-0000-4000-8000-0000000000b2', 'PROV-B-0001',
     10000, 1600, 11600, 'pending', 'pending', v_org_b),
    ('41000000-0000-4000-8000-0000000000b5',
     '41000000-0000-4000-8000-0000000000b2', 'PROV-B-0002',
     5000, 800, 5800, 'pending', 'approved', v_org_b);

  INSERT INTO public.supplier_bills
    (id, supplier_id, bill_number, subtotal, tax_amount, total, status, approval_status,
     payment_in_progress_at, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000b7',
          '41000000-0000-4000-8000-0000000000b2', 'PROV-B-0004',
          1000, 160, 1160, 'pending', 'approved', now() - interval '48 hours', v_org_b);

  PERFORM set_config('app.cxp_rpc', 'off', true);

  UPDATE public.supplier_bills SET payment_method_sat = 'PPD'
   WHERE id = '41000000-0000-4000-8000-0000000000b5';

  INSERT INTO public.supplier_payments
    (id, bill_id, payment_date, amount, rep_required, rep_status, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000b8',
          '41000000-0000-4000-8000-0000000000b5', current_date, 1000, true, 'pending', v_org_b);

  INSERT INTO public.forklifts (id, name, model, status, organization_id) VALUES
    ('41000000-0000-4000-8000-00000000fb01', 'MC-B-01', 'Toyota 8FGU25', 'available', v_org_b),
    ('41000000-0000-4000-8000-00000000fb02', 'MC-B-02', 'Hyster H50FT', 'available', v_org_b),
    ('41000000-0000-4000-8000-00000000fb03', 'MC-B-03', 'Yale GLP050', 'available', v_org_b),
    ('41000000-0000-4000-8000-00000000fb04', 'MC-B-04', 'Crown FC5200', 'available', v_org_b),
    ('41000000-0000-4000-8000-00000000fb05', 'MC-B-05', 'Nissan MP1F2', 'available', v_org_b);

  INSERT INTO public.damage_records
    (id, forklift_id, description, status, previous_forklift_status, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000b9',
          '41000000-0000-4000-8000-00000000fb03',
          'Rueda trasera dañada en maniobra', 'reported', 'available', v_org_b);
  INSERT INTO public.damage_records
    (id, forklift_id, description, status, repaired_at, previous_forklift_status, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000ba',
          '41000000-0000-4000-8000-00000000fb02',
          'Fuga hidráulica reparada', 'repaired', now(), 'available', v_org_b);
  INSERT INTO public.damage_records
    (id, forklift_id, description, status, repaired_at, deleted_at, previous_forklift_status, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000bb',
          '41000000-0000-4000-8000-00000000fb05',
          'Golpe en torre ya reparado', 'repaired', now(), now(), 'available', v_org_b);

  INSERT INTO public.audit_logs (id, table_name, record_id, action, old_data, new_data, user_id, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000bc', 'forklifts',
          '41000000-0000-4000-8000-00000000fb04', 'INSERT', NULL,
          '{"name":"MC-B-04"}'::jsonb, v_admin_b, v_org_b);

  INSERT INTO public.customers (id, name, created_by_organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000bf', 'Cerámica del Bajío SA de CV', v_org_b);
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_b, '41000000-0000-4000-8000-0000000000bf');

  INSERT INTO public.bookings
    (id, booking_number, forklift_id, customer_id, start_date, end_date,
     status, recurring_billing, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000c2', 'RES-B-0001',
          '41000000-0000-4000-8000-00000000fb01',
          '41000000-0000-4000-8000-0000000000bf',
          current_date - 30, current_date + 30, 'confirmed', true, v_org_b);

  INSERT INTO public.deliveries
    (id, booking_id, forklift_id, type, status, scheduled_date, completed_no_evidence_reason, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000c4',
          '41000000-0000-4000-8000-0000000000c2',
          '41000000-0000-4000-8000-00000000fb01', 'delivery', 'completed',
          current_date - 30,
          'Entrega de prueba autorizada por coordinación operativa', v_org_b);

  INSERT INTO public.invoices
    (id, invoice_number, customer_id, status, line_items, subtotal, tax_amount, total, organization_id)
  VALUES ('41000000-0000-4000-8000-0000000000be', 'FAC-B-0001',
          '41000000-0000-4000-8000-0000000000bf', 'sent',
          '[{"description":"Renta mensual Toyota 8FGU25","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
          10000, 1600, 11600, v_org_b);

  -- Los triggers de entregas completadas dejan FA01/FB01 en 'rented', por lo
  -- que la aserción final sobre FB01='available' fallaría antes de probar
  -- aislamiento y FA01='rented' no demostraría una transición de la RPC.
  -- Se reinician ambos a 'available' bajo el contexto de RPC de montacargas y
  -- se restaura el contexto; la precondición se verifica a continuación.
  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts SET status = 'available'
   WHERE id IN ('41000000-0000-4000-8000-00000000fa01',
                '41000000-0000-4000-8000-00000000fb01');
  PERFORM set_config('app.forklift_rpc', 'off', true);

  -- Precondición determinista: ambos montacargas deben iniciar en 'available'
  -- antes de invocar sync_forklift_rental_status.
  IF (SELECT status FROM public.forklifts
       WHERE id = '41000000-0000-4000-8000-00000000fa01') <> 'available'
     OR (SELECT status FROM public.forklifts
       WHERE id = '41000000-0000-4000-8000-00000000fb01') <> 'available' THEN
    RAISE EXCEPTION 'RPC ORG 0041: precondición falló — FA01/FB01 no inician en available';
  END IF;
END;
$$;

-- ── 1. Sesión del administrador de A contra recursos de B ────────────
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"41000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_fallas text[] := '{}';
  v_uuid uuid;
BEGIN
  BEGIN
    PERFORM public.approve_supplier_bill('41000000-0000-4000-8000-0000000000b4', 'cross-org');
    v_fallas := array_append(v_fallas, 'approve_supplier_bill: A aprobó una factura de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.reject_supplier_bill('41000000-0000-4000-8000-0000000000b4', 'cross-org');
    v_fallas := array_append(v_fallas, 'reject_supplier_bill: A rechazó una factura de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.request_bill_reapproval('41000000-0000-4000-8000-0000000000b4', 'cross-org');
    v_fallas := array_append(v_fallas, 'request_bill_reapproval: A reactivó una factura de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_uuid := public.register_supplier_payment(
      '41000000-0000-4000-8000-0000000000b5', 100, current_date,
      'transfer', NULL, NULL, NULL, NULL, NULL);
    v_fallas := array_append(v_fallas, 'register_supplier_payment/9: A pagó una factura de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.mark_supplier_rep_rejected('41000000-0000-4000-8000-0000000000b8', 'cross-org');
    v_fallas := array_append(v_fallas, 'mark_supplier_rep_rejected: A rechazó el REP de un pago de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.reset_supplier_rep_pending('41000000-0000-4000-8000-0000000000b8');
    v_fallas := array_append(v_fallas, 'reset_supplier_rep_pending: A reinició el REP de un pago de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_uuid := public.create_supplier_payment_batch(
      ARRAY['41000000-0000-4000-8000-0000000000b5']::uuid[], current_date, 'transfer', 'cross-org');
    v_fallas := array_append(v_fallas, 'create_supplier_payment_batch/array: A agrupó una factura de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_uuid := public.create_supplier_payment_batch(
      '[{"bill_id":"41000000-0000-4000-8000-0000000000b5","amount":100}]'::jsonb, 'cross-org');
    v_fallas := array_append(v_fallas, 'create_supplier_payment_batch/jsonb: A agrupó una factura de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Mezcla A/B: debe fallar de forma atómica y no crear ningún lote.
  BEGIN
    v_uuid := public.create_supplier_payment_batch(
      ARRAY['41000000-0000-4000-8000-0000000000a5',
            '41000000-0000-4000-8000-0000000000b5']::uuid[], current_date, 'transfer', 'mezcla');
    v_fallas := array_append(v_fallas, 'create_supplier_payment_batch/array: aceptó una mezcla A/B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_uuid := public.create_supplier_payment_batch(
      '[{"bill_id":"41000000-0000-4000-8000-0000000000a5","amount":100},
        {"bill_id":"41000000-0000-4000-8000-0000000000b5","amount":100}]'::jsonb, 'mezcla');
    v_fallas := array_append(v_fallas, 'create_supplier_payment_batch/jsonb: aceptó una mezcla A/B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.soft_delete_damage_record('41000000-0000-4000-8000-0000000000ba');
    v_fallas := array_append(v_fallas, 'soft_delete_damage_record: A archivó un daño de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.restore_damage_record('41000000-0000-4000-8000-0000000000bb');
    v_fallas := array_append(v_fallas, 'restore_damage_record: A restauró un daño de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_uuid := public.start_repair_work_order('41000000-0000-4000-8000-0000000000b9', 'reparacion', NULL, 100);
    v_fallas := array_append(v_fallas, 'start_repair_work_order: A abrió una OT sobre un daño de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_uuid := public.revert_audit_log('41000000-0000-4000-8000-0000000000bc');
    v_fallas := array_append(v_fallas, 'revert_audit_log: A revirtió una bitácora de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Bitácora propia de A pero con una fila objetivo de B.
  BEGIN
    v_uuid := public.revert_audit_log('41000000-0000-4000-8000-0000000000ad');
    v_fallas := array_append(v_fallas, 'revert_audit_log: A revirtió sobre una fila de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    PERFORM public.sync_invoice_status('41000000-0000-4000-8000-0000000000be');
    v_fallas := array_append(v_fallas, 'sync_invoice_status: A sincronizó una factura de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.create_recurring_invoice(
      ARRAY['41000000-0000-4000-8000-0000000000c2']::uuid[],
      '41000000-0000-4000-8000-0000000000bf', 'Cerámica del Bajío SA de CV',
      '[{"description":"Renta","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
      10000, 0.16, 1600, 11600, current_date - 30, current_date,
      'CBA030303CCC', 'Cerámica del Bajío SA de CV', '601', '36500', 'G03', 'MXN', 1);
    v_fallas := array_append(v_fallas, 'create_recurring_invoice: A facturó una reserva de B');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Mezcla A/B de reservas: falla antes de escribir.
  BEGIN
    PERFORM public.create_recurring_invoice(
      ARRAY['41000000-0000-4000-8000-0000000000c1',
            '41000000-0000-4000-8000-0000000000c2']::uuid[],
      '41000000-0000-4000-8000-0000000000af', 'Aceros de Apodaca SA de CV',
      '[{"description":"Renta","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
      10000, 0.16, 1600, 11600, current_date - 30, current_date,
      'AAP040404DDD', 'Aceros de Apodaca SA de CV', '601', '66600', 'G03', 'MXN', 1);
    v_fallas := array_append(v_fallas, 'create_recurring_invoice: aceptó una mezcla A/B de reservas');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- UUID inexistente: mismo trato que un UUID ajeno.
  BEGIN
    PERFORM public.approve_supplier_bill('41000000-0000-4000-8000-0000deadbeef', 'inexistente');
    v_fallas := array_append(v_fallas, 'approve_supplier_bill: un UUID inexistente no falló');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC ORG 0041: la empresa A pudo operar recursos de B:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: ninguna RPC del lote B alcanzó recursos de la empresa B';
END;
$$;

-- ── 2. Operaciones masivas sin ID desde A ────────────────────────────
DO $$
DECLARE
  v_fallas text[] := '{}';
  v_liberados integer;
BEGIN
  v_liberados := public.release_stale_payment_locks(24);
  IF v_liberados <> 1 THEN
    v_fallas := array_append(v_fallas, format('release_stale_payment_locks: liberó %s bloqueos en lugar de 1', v_liberados));
  END IF;
  IF (SELECT payment_in_progress_at FROM public.supplier_bills
       WHERE id = '41000000-0000-4000-8000-0000000000a7') IS NOT NULL THEN
    v_fallas := array_append(v_fallas, 'release_stale_payment_locks: no liberó el bloqueo de A');
  END IF;

  PERFORM public.sync_forklift_rental_status();
  IF (SELECT status FROM public.forklifts WHERE id = '41000000-0000-4000-8000-00000000fa01')
     <> 'rented' THEN
    v_fallas := array_append(v_fallas, 'sync_forklift_rental_status: no sincronizó el montacargas de A');
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC ORG 0041: las operaciones masivas cruzaron de empresa:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: las operaciones masivas sólo tocaron la empresa A';
END;
$$;

-- ── 3. Casos positivos representativos dentro de A ───────────────────
DO $$
DECLARE
  v_fallas text[] := '{}';
  v_uuid uuid;
  v_batch uuid;
BEGIN
  PERFORM public.approve_supplier_bill('41000000-0000-4000-8000-0000000000a4', 'Aprobada en A');
  IF (SELECT approval_status FROM public.supplier_bills
       WHERE id = '41000000-0000-4000-8000-0000000000a4') <> 'approved' THEN
    v_fallas := array_append(v_fallas, 'approve_supplier_bill: A no pudo aprobar su propia factura');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_bill_approvals
     WHERE bill_id = '41000000-0000-4000-8000-0000000000a4'
       AND organization_id = '41000000-0000-4000-8000-0000000000a0'
  ) THEN
    v_fallas := array_append(v_fallas, 'approve_supplier_bill: la bitácora no heredó la organización');
  END IF;

  v_uuid := public.register_supplier_payment(
    '41000000-0000-4000-8000-0000000000a5', 1000, current_date,
    'transfer', NULL, NULL, NULL, NULL, NULL);
  IF v_uuid IS NULL
     OR (SELECT organization_id FROM public.supplier_payments WHERE id = v_uuid)
        <> '41000000-0000-4000-8000-0000000000a0' THEN
    v_fallas := array_append(v_fallas, 'register_supplier_payment: el pago no quedó en la empresa A');
  END IF;

  PERFORM public.mark_supplier_rep_rejected('41000000-0000-4000-8000-0000000000a8', 'REP ilegible');
  IF (SELECT rep_status FROM public.supplier_payments
       WHERE id = '41000000-0000-4000-8000-0000000000a8') <> 'rejected' THEN
    v_fallas := array_append(v_fallas, 'mark_supplier_rep_rejected: A no pudo rechazar su propio REP');
  END IF;
  PERFORM public.reset_supplier_rep_pending('41000000-0000-4000-8000-0000000000a8');
  IF (SELECT rep_status FROM public.supplier_payments
       WHERE id = '41000000-0000-4000-8000-0000000000a8') <> 'pending' THEN
    v_fallas := array_append(v_fallas, 'reset_supplier_rep_pending: A no pudo reiniciar su propio REP');
  END IF;

  v_batch := public.create_supplier_payment_batch(
    ARRAY['41000000-0000-4000-8000-0000000000a6']::uuid[], current_date, 'transfer', 'Lote A');
  IF v_batch IS NULL
     OR (SELECT organization_id FROM public.supplier_payment_batches WHERE id = v_batch)
        <> '41000000-0000-4000-8000-0000000000a0' THEN
    v_fallas := array_append(v_fallas, 'create_supplier_payment_batch/array: el lote no quedó en la empresa A');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_payment_batch_items
     WHERE batch_id = v_batch
       AND organization_id = '41000000-0000-4000-8000-0000000000a0'
  ) THEN
    v_fallas := array_append(v_fallas, 'create_supplier_payment_batch/array: las partidas no heredaron la organización');
  END IF;

  v_uuid := public.start_repair_work_order(
    '41000000-0000-4000-8000-0000000000a9', 'reparacion', 'Cambio de rueda', 1500);
  IF v_uuid IS NULL
     OR (SELECT organization_id FROM public.maintenance_logs WHERE id = v_uuid)
        <> '41000000-0000-4000-8000-0000000000a0' THEN
    v_fallas := array_append(v_fallas, 'start_repair_work_order: la OT no quedó en la empresa A');
  END IF;

  PERFORM public.soft_delete_damage_record('41000000-0000-4000-8000-0000000000aa');
  IF (SELECT deleted_at FROM public.damage_records
       WHERE id = '41000000-0000-4000-8000-0000000000aa') IS NULL THEN
    v_fallas := array_append(v_fallas, 'soft_delete_damage_record: A no pudo archivar su propio daño');
  END IF;

  PERFORM public.restore_damage_record('41000000-0000-4000-8000-0000000000ab');
  IF (SELECT deleted_at FROM public.damage_records
       WHERE id = '41000000-0000-4000-8000-0000000000ab') IS NOT NULL THEN
    v_fallas := array_append(v_fallas, 'restore_damage_record: A no pudo restaurar su propio daño');
  END IF;

  PERFORM public.sync_invoice_status('41000000-0000-4000-8000-0000000000ae');

  v_uuid := public.revert_audit_log('41000000-0000-4000-8000-0000000000ac');
  IF v_uuid IS NULL THEN
    v_fallas := array_append(v_fallas, 'revert_audit_log: A no pudo revertir su propia bitácora');
  END IF;
  IF EXISTS (SELECT 1 FROM public.forklifts WHERE id = '41000000-0000-4000-8000-00000000fa04') THEN
    v_fallas := array_append(v_fallas, 'revert_audit_log: no revirtió el alta en la empresa A');
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC ORG 0041: los flujos propios de A dejaron de funcionar:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: los flujos dentro de la empresa A siguen funcionando';
END;
$$;

-- ── 4. La empresa B quedó intacta ────────────────────────────────────
-- Fuera de la sesión de A: RLS de A ocultaría las filas de B y produciría
-- falsos positivos.
RESET role;
RESET request.jwt.claims;

DO $$
DECLARE
  v_fallas text[] := '{}';
BEGIN
  IF (SELECT approval_status FROM public.supplier_bills
       WHERE id = '41000000-0000-4000-8000-0000000000b4') <> 'pending' THEN
    v_fallas := array_append(v_fallas, 'la factura pendiente de B cambió de estado de aprobación');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.supplier_payments
     WHERE bill_id = '41000000-0000-4000-8000-0000000000b5'
       AND id <> '41000000-0000-4000-8000-0000000000b8'
  ) THEN
    v_fallas := array_append(v_fallas, 'se registraron pagos sobre una factura de B');
  END IF;
  IF (SELECT rep_status FROM public.supplier_payments
       WHERE id = '41000000-0000-4000-8000-0000000000b8') <> 'pending' THEN
    v_fallas := array_append(v_fallas, 'el REP de B cambió de estado');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.supplier_payment_batches
     WHERE organization_id = '41000000-0000-4000-8000-0000000000b0'
  ) THEN
    v_fallas := array_append(v_fallas, 'se creó un lote de pago en B');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.supplier_payment_batch_items
     WHERE bill_id = '41000000-0000-4000-8000-0000000000b5'
  ) THEN
    v_fallas := array_append(v_fallas, 'una factura de B quedó dentro de un lote de A');
  END IF;
  IF (SELECT deleted_at FROM public.damage_records
       WHERE id = '41000000-0000-4000-8000-0000000000ba') IS NOT NULL THEN
    v_fallas := array_append(v_fallas, 'se archivó un daño de B');
  END IF;
  IF (SELECT deleted_at FROM public.damage_records
       WHERE id = '41000000-0000-4000-8000-0000000000bb') IS NULL THEN
    v_fallas := array_append(v_fallas, 'se restauró un daño de B');
  END IF;
  IF (SELECT status FROM public.damage_records
       WHERE id = '41000000-0000-4000-8000-0000000000b9') <> 'reported' THEN
    v_fallas := array_append(v_fallas, 'se abrió una orden de trabajo sobre un daño de B');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.maintenance_logs
     WHERE organization_id = '41000000-0000-4000-8000-0000000000b0'
  ) THEN
    v_fallas := array_append(v_fallas, 'se creó una orden de trabajo en B');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoices
     WHERE organization_id = '41000000-0000-4000-8000-0000000000b0'
       AND id <> '41000000-0000-4000-8000-0000000000be'
  ) THEN
    v_fallas := array_append(v_fallas, 'se generó una factura recurrente en B');
  END IF;
  IF (SELECT status FROM public.invoices
       WHERE id = '41000000-0000-4000-8000-0000000000be') <> 'sent' THEN
    v_fallas := array_append(v_fallas, 'cambió el estatus de la factura de B');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.forklifts
     WHERE id = '41000000-0000-4000-8000-00000000fb04'
  ) THEN
    v_fallas := array_append(v_fallas, 'se eliminó un montacargas de B');
  END IF;
  IF (SELECT payment_in_progress_at FROM public.supplier_bills
       WHERE id = '41000000-0000-4000-8000-0000000000b7') IS NULL THEN
    v_fallas := array_append(v_fallas, 'release_stale_payment_locks: liberó el bloqueo de B');
  END IF;
  IF (SELECT status FROM public.forklifts WHERE id = '41000000-0000-4000-8000-00000000fb01')
     <> 'available' THEN
    v_fallas := array_append(v_fallas, 'sync_forklift_rental_status: modificó un montacargas de B');
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC ORG 0041: la empresa B sufrió cambios:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: la empresa B quedó intacta (validation_0041_complete)';
END;
$$;

ROLLBACK;
