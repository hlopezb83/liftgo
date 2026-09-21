-- Multiempresa · paso 4 lote A: las RPC SECURITY DEFINER que mutan datos por
-- UUID (migración Drizzle 0040) no cruzan de empresa.
--
--   * Dos empresas reales (A y B) con datos equivalentes.
--   * Desde la sesión del administrador de A se invoca cada función con los
--     UUID de B: todas deben fallar y no dejar ningún cambio en B.
--   * Casos positivos mínimos dentro de A para demostrar que los flujos
--     siguen funcionando.
--   * ROLLBACK al final: no persiste nada.
BEGIN;

-- ── 0. Alta de las dos empresas y sus recursos ───────────────────────
DO $$
DECLARE
  v_org_a uuid := '40000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '40000000-0000-4000-8000-0000000000b0';
  v_admin_a uuid := '40000000-0000-4000-8000-0000000000a1';
  v_admin_b uuid := '40000000-0000-4000-8000-0000000000b1';
BEGIN
  IF pg_get_functiondef('public.delete_forklift(uuid)'::regprocedure)
       !~ 'current_internal_organization_id' THEN
    RAISE EXCEPTION 'RPC ORG 0040: la cadena Drizzle 0040 no se aplicó';
  END IF;

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Montacargas del Norte', 'rpc-mut-a'),
    (v_org_b, 'Elevación Industrial del Bajío', 'rpc-mut-b');

  -- ── Empresa A ──
  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_a, 'ana.reyes@montacargasnorte.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_a, v_admin_a, 'internal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_a, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.forklifts (id, name, model, status, organization_id) VALUES
    ('40000000-0000-4000-8000-00000000fa01', 'MC-A-01', 'Toyota 8FGU25', 'available', v_org_a),
    ('40000000-0000-4000-8000-00000000fa02', 'MC-A-02', 'Toyota 8FGU25', 'available', v_org_a),
    ('40000000-0000-4000-8000-00000000fa04', 'MC-A-04', 'Hyster H50FT', 'available', v_org_a);
  INSERT INTO public.forklifts (id, name, model, status, organization_id, deleted_at)
  VALUES ('40000000-0000-4000-8000-00000000fa03', 'MC-A-03', 'Yale GLP050', 'available', v_org_a, now());

  INSERT INTO public.suppliers (id, name, organization_id, deleted_at) VALUES
    ('40000000-0000-4000-8000-0000000000a5', 'Refacciones del Norte SA de CV', v_org_a, now());
  INSERT INTO public.suppliers (id, name, organization_id) VALUES
    ('40000000-0000-4000-8000-0000000000a6', 'Llantas Industriales Monterrey', v_org_a);

  INSERT INTO public.customers (id, name, created_by_organization_id, deleted_at)
  VALUES ('40000000-0000-4000-8000-0000000000ac', 'Aceros de Apodaca SA de CV', v_org_a, now());
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_a, '40000000-0000-4000-8000-0000000000ac');
  INSERT INTO public.customers (id, name, created_by_organization_id)
  VALUES ('40000000-0000-4000-8000-0000000000ad', 'Logística Santa Catarina', v_org_a);
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_a, '40000000-0000-4000-8000-0000000000ad');

  INSERT INTO public.maintenance_logs
    (id, forklift_id, service_type, work_status, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000a7',
    '40000000-0000-4000-8000-00000000fa04', 'preventivo', 'in_progress', v_org_a
  );

  INSERT INTO public.feedback_reports
    (id, reporter_id, reporter_type, reporter_name, type, title, description,
     status, points_awarded, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000a8', v_admin_a, 'staff', 'Ana Reyes',
    'bug', 'Reporte en A', 'Creado en la empresa A', 'new', 0, v_org_a
  );

  INSERT INTO public.invoices
    (id, invoice_number, customer_id, status, line_items, subtotal, tax_amount, total, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000a9', 'FAC-A-0001',
    '40000000-0000-4000-8000-0000000000ad', 'sent',
    '[{"description":"Renta mensual Toyota 8FGU25","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
    10000, 1600, 11600, v_org_a
  );

  INSERT INTO public.payments (id, invoice_id, amount, rep_cfdi_status, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000aa',
    '40000000-0000-4000-8000-0000000000a9', 1160, 'pending', v_org_a
  );

  INSERT INTO public.customer_payment_intents
    (id, invoice_id, customer_id, amount, transfer_date, status, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000ab',
    '40000000-0000-4000-8000-0000000000a9',
    '40000000-0000-4000-8000-0000000000ad',
    1000, current_date, 'pending_review'::public.payment_intent_status, v_org_a
  );

  INSERT INTO public.supplier_bills
    (id, supplier_id, bill_number, total, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000ae',
    '40000000-0000-4000-8000-0000000000a6', 'PROV-A-0001', 5800, v_org_a
  );
  INSERT INTO public.supplier_payment_batches (id, organization_id)
  VALUES ('40000000-0000-4000-8000-0000000000af', v_org_a);
  INSERT INTO public.supplier_payment_batch_items
    (batch_id, bill_id, bill_number, supplier_name, reference, amount, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000af',
    '40000000-0000-4000-8000-0000000000ae', 'PROV-A-0001',
    'Llantas Industriales Monterrey', 'REF-A-0001', 5800, v_org_a
  );

  -- ── Empresa B ──
  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_b, 'bruno.salas@elevacionbajio.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_b, v_admin_b, 'internal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_b, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.forklifts (id, name, model, status, organization_id)
  VALUES ('40000000-0000-4000-8000-00000000fb01', 'MC-B-01', 'Toyota 8FGU25', 'available', v_org_b);
  INSERT INTO public.forklifts (id, name, model, status, organization_id, deleted_at)
  VALUES ('40000000-0000-4000-8000-00000000fb03', 'MC-B-03', 'Yale GLP050', 'available', v_org_b, now());

  INSERT INTO public.suppliers (id, name, organization_id, deleted_at)
  VALUES ('40000000-0000-4000-8000-0000000000b5', 'Refacciones del Bajío SA de CV', v_org_b, now());
  INSERT INTO public.suppliers (id, name, organization_id)
  VALUES ('40000000-0000-4000-8000-0000000000b6', 'Hidráulica Irapuato', v_org_b);

  INSERT INTO public.customers (id, name, created_by_organization_id, deleted_at)
  VALUES ('40000000-0000-4000-8000-0000000000bc', 'Aceros del Bajío SA de CV', v_org_b, now());
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_b, '40000000-0000-4000-8000-0000000000bc');
  INSERT INTO public.customers (id, name, created_by_organization_id)
  VALUES ('40000000-0000-4000-8000-0000000000bd', 'Transportes Celaya', v_org_b);
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_b, '40000000-0000-4000-8000-0000000000bd');

  -- OT archivada (restore) y OT activa cerrada (soft delete / reopen).
  INSERT INTO public.maintenance_logs
    (id, forklift_id, service_type, work_status, organization_id, deleted_at)
  VALUES (
    '40000000-0000-4000-8000-0000000000b7',
    '40000000-0000-4000-8000-00000000fb01', 'correctivo', 'completed', v_org_b, now()
  );
  INSERT INTO public.maintenance_logs
    (id, forklift_id, service_type, work_status, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000b8',
    '40000000-0000-4000-8000-00000000fb01', 'preventivo', 'completed', v_org_b
  );

  INSERT INTO public.feedback_reports
    (id, reporter_id, reporter_type, reporter_name, type, title, description,
     status, points_awarded, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000ba', v_admin_b, 'staff', 'Bruno Salas',
    'bug', 'Reporte en B', 'Creado en la empresa B', 'new', 0, v_org_b
  );

  INSERT INTO public.invoices
    (id, invoice_number, customer_id, status, line_items, subtotal, tax_amount, total, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000b9', 'FAC-B-0001',
    '40000000-0000-4000-8000-0000000000bd', 'sent',
    '[{"description":"Renta mensual Toyota 8FGU25","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
    10000, 1600, 11600, v_org_b
  );
  INSERT INTO public.payments (id, invoice_id, amount, rep_cfdi_status, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000bb',
    '40000000-0000-4000-8000-0000000000b9', 1160, 'pending', v_org_b
  );
  INSERT INTO public.customer_payment_intents
    (id, invoice_id, customer_id, amount, transfer_date, status, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000be',
    '40000000-0000-4000-8000-0000000000b9',
    '40000000-0000-4000-8000-0000000000bd',
    1000, current_date, 'pending_review'::public.payment_intent_status, v_org_b
  );

  INSERT INTO public.supplier_bills
    (id, supplier_id, bill_number, total, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000bf',
    '40000000-0000-4000-8000-0000000000b6', 'PROV-B-0001', 4640, v_org_b
  );
  INSERT INTO public.supplier_payment_batches (id, organization_id)
  VALUES ('40000000-0000-4000-8000-0000000000c0', v_org_b);
  INSERT INTO public.supplier_payment_batch_items
    (batch_id, bill_id, bill_number, supplier_name, reference, amount, organization_id)
  VALUES (
    '40000000-0000-4000-8000-0000000000c0',
    '40000000-0000-4000-8000-0000000000bf', 'PROV-B-0001',
    'Hidráulica Irapuato', 'REF-B-0001', 4640, v_org_b
  );
END;
$$;

-- ── 1. Sesión del administrador de A contra recursos de B ────────────
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"40000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_fallas text[] := '{}';
  v_texto text;
  v_uuid uuid;
BEGIN
  BEGIN
    v_uuid := public.approve_payment_intent('40000000-0000-4000-8000-0000000000be', '03', 'cross-org');
    v_fallas := v_fallas || 'approve_payment_intent: A aprobó un reporte de pago de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_texto := public.assign_stamped_invoice_number('40000000-0000-4000-8000-0000000000b9', 'A', '9999');
    v_fallas := v_fallas || 'assign_stamped_invoice_number: A refolió una factura de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.cancel_supplier_payment_batch('40000000-0000-4000-8000-0000000000c0');
    v_fallas := v_fallas || 'cancel_supplier_payment_batch: A canceló un lote de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.change_feedback_status('40000000-0000-4000-8000-0000000000ba', 'resolved', 'cross-org');
    v_fallas := v_fallas || 'change_feedback_status: A resolvió un reporte de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.change_forklift_status('40000000-0000-4000-8000-00000000fb01', 'maintenance', 'cross-org');
    v_fallas := v_fallas || 'change_forklift_status: A cambió el estado de un montacargas de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Esta conserva el canal interno: desde una sesión autenticada debe
  -- comportarse como si el pago no existiera.
  v_texto := public.claim_payment_rep_stamping('40000000-0000-4000-8000-0000000000bb', 5);
  IF v_texto <> 'not_found' THEN
    v_fallas := v_fallas ||
      format('claim_payment_rep_stamping: A obtuvo "%s" sobre un pago de B', v_texto);
  END IF;

  BEGIN
    PERFORM public.delete_forklift('40000000-0000-4000-8000-00000000fb01');
    v_fallas := v_fallas || 'delete_forklift: A archivó un montacargas de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.reopen_work_order('40000000-0000-4000-8000-0000000000b8', 'cross-org');
    v_fallas := v_fallas || 'reopen_work_order: A reabrió una OT de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.restore_customer('40000000-0000-4000-8000-0000000000bc');
    v_fallas := v_fallas || 'restore_customer: A restauró un cliente de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.restore_forklift('40000000-0000-4000-8000-00000000fb03');
    v_fallas := v_fallas || 'restore_forklift: A restauró un montacargas de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.restore_maintenance_log('40000000-0000-4000-8000-0000000000b7');
    v_fallas := v_fallas || 'restore_maintenance_log: A restauró una OT de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.restore_supplier('40000000-0000-4000-8000-0000000000b5');
    v_fallas := v_fallas || 'restore_supplier: A restauró un proveedor de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.soft_delete_maintenance_log('40000000-0000-4000-8000-0000000000b8');
    v_fallas := v_fallas || 'soft_delete_maintenance_log: A archivó una OT de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.soft_delete_supplier('40000000-0000-4000-8000-0000000000b6');
    v_fallas := v_fallas || 'soft_delete_supplier: A archivó un proveedor de B';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- UUID inexistente: mismo trato que un UUID ajeno.
  BEGIN
    PERFORM public.delete_forklift('40000000-0000-4000-8000-0000deadbeef');
    v_fallas := v_fallas || 'delete_forklift: un UUID inexistente no falló';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC ORG 0040: la empresa A pudo mutar recursos de B:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: ninguna RPC mutante de A alcanzó recursos de B';
END;
$$;

-- ── 2. Casos positivos dentro de la propia empresa A ─────────────────
DO $$
DECLARE
  v_fallas text[] := '{}';
  v_texto text;
  v_uuid uuid;
BEGIN
  PERFORM public.change_forklift_status(
    '40000000-0000-4000-8000-00000000fa01', 'maintenance', 'Mantenimiento programado');
  IF (SELECT status FROM public.forklifts WHERE id = '40000000-0000-4000-8000-00000000fa01')
     <> 'maintenance' THEN
    v_fallas := v_fallas || 'change_forklift_status: A no pudo mover su propio montacargas';
  END IF;

  PERFORM public.delete_forklift('40000000-0000-4000-8000-00000000fa02');
  IF (SELECT deleted_at FROM public.forklifts WHERE id = '40000000-0000-4000-8000-00000000fa02')
     IS NULL THEN
    v_fallas := v_fallas || 'delete_forklift: A no pudo archivar su propio montacargas';
  END IF;

  PERFORM public.restore_forklift('40000000-0000-4000-8000-00000000fa03');
  IF (SELECT deleted_at FROM public.forklifts WHERE id = '40000000-0000-4000-8000-00000000fa03')
     IS NOT NULL THEN
    v_fallas := v_fallas || 'restore_forklift: A no pudo restaurar su propio montacargas';
  END IF;

  PERFORM public.restore_supplier('40000000-0000-4000-8000-0000000000a5');
  IF (SELECT deleted_at FROM public.suppliers WHERE id = '40000000-0000-4000-8000-0000000000a5')
     IS NOT NULL THEN
    v_fallas := v_fallas || 'restore_supplier: A no pudo restaurar su propio proveedor';
  END IF;

  PERFORM public.restore_customer('40000000-0000-4000-8000-0000000000ac');
  IF (SELECT deleted_at FROM public.customers WHERE id = '40000000-0000-4000-8000-0000000000ac')
     IS NOT NULL THEN
    v_fallas := v_fallas || 'restore_customer: A no pudo restaurar su propio cliente';
  END IF;

  PERFORM public.soft_delete_maintenance_log('40000000-0000-4000-8000-0000000000a7');
  IF (SELECT deleted_at FROM public.maintenance_logs WHERE id = '40000000-0000-4000-8000-0000000000a7')
     IS NULL THEN
    v_fallas := v_fallas || 'soft_delete_maintenance_log: A no pudo archivar su propia OT';
  END IF;

  PERFORM public.restore_maintenance_log('40000000-0000-4000-8000-0000000000a7');
  IF (SELECT deleted_at FROM public.maintenance_logs WHERE id = '40000000-0000-4000-8000-0000000000a7')
     IS NOT NULL THEN
    v_fallas := v_fallas || 'restore_maintenance_log: A no pudo restaurar su propia OT';
  END IF;

  PERFORM public.change_feedback_status('40000000-0000-4000-8000-0000000000a8', 'accepted', 'Aceptado');
  IF (SELECT status FROM public.feedback_reports WHERE id = '40000000-0000-4000-8000-0000000000a8')
     <> 'accepted' THEN
    v_fallas := v_fallas || 'change_feedback_status: A no pudo aceptar su propio reporte';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.feedback_status_history h
    WHERE h.report_id = '40000000-0000-4000-8000-0000000000a8'
      AND h.organization_id = '40000000-0000-4000-8000-0000000000a0'
  ) THEN
    v_fallas := v_fallas || 'change_feedback_status: la bitácora no heredó la organización';
  END IF;

  v_texto := public.claim_payment_rep_stamping('40000000-0000-4000-8000-0000000000aa', 5);
  IF v_texto <> 'claimed' THEN
    v_fallas := v_fallas ||
      format('claim_payment_rep_stamping: A obtuvo "%s" sobre su propio pago', v_texto);
  END IF;

  v_texto := public.assign_stamped_invoice_number('40000000-0000-4000-8000-0000000000a9', 'A', '0777');
  IF v_texto <> 'FAC-0777' THEN
    v_fallas := v_fallas ||
      format('assign_stamped_invoice_number: A obtuvo "%s"', v_texto);
  END IF;

  v_uuid := public.approve_payment_intent('40000000-0000-4000-8000-0000000000ab', '03', 'Aprobado');
  IF v_uuid IS NULL
     OR (SELECT organization_id FROM public.payments WHERE id = v_uuid)
        <> '40000000-0000-4000-8000-0000000000a0' THEN
    v_fallas := v_fallas || 'approve_payment_intent: el pago derivado no quedó en la empresa A';
  END IF;

  PERFORM public.cancel_supplier_payment_batch('40000000-0000-4000-8000-0000000000af');
  IF EXISTS (
    SELECT 1 FROM public.supplier_payment_batches
    WHERE id = '40000000-0000-4000-8000-0000000000af'
  ) THEN
    v_fallas := v_fallas || 'cancel_supplier_payment_batch: A no pudo cancelar su propio lote';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC ORG 0040: la empresa A perdió su propia operación:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: la empresa A conserva todos sus flujos';
END;
$$;

RESET ROLE;
RESET request.jwt.claims;

-- ── 3. La empresa B quedó intacta ────────────────────────────────────
DO $$
DECLARE
  v_fallas text[] := '{}';
BEGIN
  IF (SELECT status FROM public.forklifts WHERE id = '40000000-0000-4000-8000-00000000fb01')
     <> 'available' THEN
    v_fallas := v_fallas || 'el montacargas de B cambió de estado';
  END IF;
  IF (SELECT deleted_at FROM public.forklifts WHERE id = '40000000-0000-4000-8000-00000000fb01')
     IS NOT NULL THEN
    v_fallas := v_fallas || 'el montacargas de B quedó archivado';
  END IF;
  IF (SELECT deleted_at FROM public.forklifts WHERE id = '40000000-0000-4000-8000-00000000fb03')
     IS NULL THEN
    v_fallas := v_fallas || 'el montacargas archivado de B fue restaurado';
  END IF;
  IF (SELECT deleted_at FROM public.suppliers WHERE id = '40000000-0000-4000-8000-0000000000b5')
     IS NULL THEN
    v_fallas := v_fallas || 'el proveedor archivado de B fue restaurado';
  END IF;
  IF (SELECT deleted_at FROM public.suppliers WHERE id = '40000000-0000-4000-8000-0000000000b6')
     IS NOT NULL THEN
    v_fallas := v_fallas || 'el proveedor activo de B fue archivado';
  END IF;
  IF (SELECT deleted_at FROM public.customers WHERE id = '40000000-0000-4000-8000-0000000000bc')
     IS NULL THEN
    v_fallas := v_fallas || 'el cliente archivado de B fue restaurado';
  END IF;
  IF (SELECT deleted_at FROM public.maintenance_logs WHERE id = '40000000-0000-4000-8000-0000000000b7')
     IS NULL THEN
    v_fallas := v_fallas || 'la OT archivada de B fue restaurada';
  END IF;
  IF (SELECT deleted_at FROM public.maintenance_logs WHERE id = '40000000-0000-4000-8000-0000000000b8')
     IS NOT NULL THEN
    v_fallas := v_fallas || 'la OT activa de B fue archivada';
  END IF;
  IF (SELECT work_status FROM public.maintenance_logs WHERE id = '40000000-0000-4000-8000-0000000000b8')
     <> 'completed' THEN
    v_fallas := v_fallas || 'la OT de B fue reabierta';
  END IF;
  IF (SELECT status FROM public.feedback_reports WHERE id = '40000000-0000-4000-8000-0000000000ba')
     <> 'new'
     OR (SELECT points_awarded FROM public.feedback_reports WHERE id = '40000000-0000-4000-8000-0000000000ba')
        <> 0 THEN
    v_fallas := v_fallas || 'el reporte de B cambió de estado o de puntos';
  END IF;
  IF (SELECT invoice_number FROM public.invoices WHERE id = '40000000-0000-4000-8000-0000000000b9')
     <> 'FAC-B-0001' THEN
    v_fallas := v_fallas || 'el folio de la factura de B cambió';
  END IF;
  IF (SELECT rep_cfdi_status FROM public.payments WHERE id = '40000000-0000-4000-8000-0000000000bb')
     <> 'pending' THEN
    v_fallas := v_fallas || 'el pago de B fue reclamado para timbrado';
  END IF;
  IF (SELECT status FROM public.customer_payment_intents WHERE id = '40000000-0000-4000-8000-0000000000be')
     <> 'pending_review'::public.payment_intent_status THEN
    v_fallas := v_fallas || 'el reporte de pago de B fue aprobado';
  END IF;
  IF (SELECT count(*) FROM public.payments WHERE organization_id = '40000000-0000-4000-8000-0000000000b0')
     <> 1 THEN
    v_fallas := v_fallas || 'se crearon pagos adicionales en B';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_payment_batches WHERE id = '40000000-0000-4000-8000-0000000000c0'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.supplier_payment_batch_items WHERE batch_id = '40000000-0000-4000-8000-0000000000c0'
  ) THEN
    v_fallas := v_fallas || 'el lote de pago de B fue cancelado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.status_logs
    WHERE organization_id = '40000000-0000-4000-8000-0000000000b0'
  ) THEN
    v_fallas := v_fallas || 'se escribió bitácora en B';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'RPC ORG 0040: la empresa B sufrió cambios:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: la empresa B quedó intacta';
END;
$$;

ROLLBACK;
