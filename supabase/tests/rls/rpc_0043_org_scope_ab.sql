-- Multiempresa · paso 6: las RPC de bloqueos de pago, estado de secretos de
-- facturación y folios internos (migración Drizzle 0043) no cruzan de empresa.
--
--   * Dos empresas reales (A y B) con bloqueos liberables, secretos y
--     contadores de documentos propios.
--   * A sólo cuenta sus bloqueos liberables y sólo ve el estado de sus secretos.
--   * next/peek de A consumen y leen exclusivamente los contadores de A.
--   * Una identidad de portal con rol global residual queda bloqueada.
--   * Casos positivos de cada formato de folio.
--   * Tras RESET ROLE/claims se verifica que B quedó intacta.
--   * ROLLBACK final: no persiste nada.
BEGIN;

-- ── 0. Alta de las dos empresas y sus recursos ───────────────────────
DO $$
DECLARE
  v_org_a uuid := '43000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '43000000-0000-4000-8000-0000000000b0';
  v_admin_a uuid := '43000000-0000-4000-8000-0000000000a1';
  v_admin_b uuid := '43000000-0000-4000-8000-0000000000b1';
  v_portal_a uuid := '43000000-0000-4000-8000-0000000000a9';
BEGIN
  IF pg_get_functiondef('public.count_releasable_payment_locks(integer)'::regprocedure)
       !~ 'current_internal_organization_id' THEN
    RAISE EXCEPTION 'RPC ORG 0043: la cadena Drizzle 0043 no se aplicó';
  END IF;

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Montacargas Folio Norte', 'rpc-0043-a'),
    (v_org_b, 'Elevación Folio Bajío', 'rpc-0043-b');

  -- ══════════════ Empresa A ══════════════
  PERFORM set_config('app.organization_id', v_org_a::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
    (v_admin_a, 'admin.a@folio-norte.test', now(), now()),
    (v_portal_a, 'portal.a@folio-norte.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_a, v_admin_a, 'internal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_a, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Identidad de portal de A con rol global residual: is_staff()/has_role()
  -- la aceptarían, pero no es miembro interno.
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_a, v_portal_a, 'portal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_portal_a, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.customers (id, name, created_by_organization_id)
  VALUES ('43000000-0000-4000-8000-0000000000af', 'Aceros Folio SA de CV', v_org_a);
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_a, '43000000-0000-4000-8000-0000000000af');
  INSERT INTO public.customer_portal_accounts
    (organization_id, customer_id, auth_user_id, email)
  VALUES (v_org_a, '43000000-0000-4000-8000-0000000000af', v_portal_a,
          'portal.a@folio-norte.test');

  INSERT INTO public.suppliers (id, name, rfc, organization_id)
  VALUES ('43000000-0000-4000-8000-0000000000a2', 'Refacciones Folio SA de CV', 'RFO010101AAA', v_org_a);

  PERFORM set_config('app.cxp_rpc', 'on', true);
  -- Un único bloqueo añejo liberable en A.
  INSERT INTO public.supplier_bills
    (id, supplier_id, bill_number, subtotal, tax_amount, total, status, approval_status,
     payment_in_progress_at, organization_id)
  VALUES ('43000000-0000-4000-8000-0000000000a7',
          '43000000-0000-4000-8000-0000000000a2', 'PROV-A-0001',
          1000, 160, 1160, 'pending', 'approved', now() - interval '48 hours', v_org_a);
  PERFORM set_config('app.cxp_rpc', 'off', true);

  INSERT INTO public.billing_secrets (organization_id, facturapi_test_key, facturapi_live_key)
  VALUES (v_org_a, 'sk_test_a', NULL);

  INSERT INTO public.organization_document_counters (organization_id, document_type, next_value) VALUES
    (v_org_a, 'contract', 7),
    (v_org_a, 'quote', 201),
    (v_org_a, 'supplier_bill', 11),
    (v_org_a, 'draft_invoice', 33),
    (v_org_a, 'draft_credit_note', 44),
    (v_org_a, 'invoice', 55);

  -- ══════════════ Empresa B ══════════════
  PERFORM set_config('app.organization_id', v_org_b::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_b, 'admin.b@folio-bajio.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_b, v_admin_b, 'internal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_b, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.suppliers (id, name, rfc, organization_id)
  VALUES ('43000000-0000-4000-8000-0000000000b2', 'Refacciones Bajío SA de CV', 'RBA010101AAA', v_org_b);

  PERFORM set_config('app.cxp_rpc', 'on', true);
  -- Tres bloqueos añejos liberables en B: el conteo de A debe ignorarlos.
  INSERT INTO public.supplier_bills
    (id, supplier_id, bill_number, subtotal, tax_amount, total, status, approval_status,
     payment_in_progress_at, organization_id)
  VALUES
    ('43000000-0000-4000-8000-0000000000b7',
     '43000000-0000-4000-8000-0000000000b2', 'PROV-B-0001',
     1000, 160, 1160, 'pending', 'approved', now() - interval '48 hours', v_org_b),
    ('43000000-0000-4000-8000-0000000000b8',
     '43000000-0000-4000-8000-0000000000b2', 'PROV-B-0002',
     2000, 320, 2320, 'pending', 'approved', now() - interval '72 hours', v_org_b),
    ('43000000-0000-4000-8000-0000000000b9',
     '43000000-0000-4000-8000-0000000000b2', 'PROV-B-0003',
     3000, 480, 3480, 'pending', 'approved', now() - interval '96 hours', v_org_b);
  PERFORM set_config('app.cxp_rpc', 'off', true);

  INSERT INTO public.billing_secrets (organization_id, facturapi_test_key, facturapi_live_key)
  VALUES (v_org_b, 'sk_test_b', 'sk_live_b');

  INSERT INTO public.organization_document_counters (organization_id, document_type, next_value) VALUES
    (v_org_b, 'contract', 900),
    (v_org_b, 'quote', 901),
    (v_org_b, 'supplier_bill', 902),
    (v_org_b, 'draft_invoice', 903),
    (v_org_b, 'draft_credit_note', 904),
    (v_org_b, 'invoice', 905);

  PERFORM set_config('app.organization_id', '', true);
  RAISE NOTICE 'SEED 0043 OK';
END;
$$;

-- ── 1. Sesión del administrador de A ─────────────────────────────────
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"43000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_fallas text[] := '{}';
  v_int integer;
  v_txt text;
  v_rows integer;
BEGIN
  -- Bloqueos liberables: sólo el de A, aunque B tenga tres.
  v_int := public.count_releasable_payment_locks(24);
  IF v_int <> 1 THEN
    v_fallas := array_append(v_fallas,
      format('count_releasable_payment_locks devolvió %s en vez de 1 (fuga global)', v_int));
  END IF;

  -- Estado de secretos: sólo el de A (test sí, live no).
  SELECT count(*) INTO v_rows FROM public.get_billing_secrets_status();
  IF v_rows <> 1 THEN
    v_fallas := array_append(v_fallas,
      format('get_billing_secrets_status devolvió %s filas en vez de 1', v_rows));
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_billing_secrets_status() s WHERE s.has_live_key) THEN
    v_fallas := array_append(v_fallas, 'get_billing_secrets_status expuso el secreto vigente de B');
  END IF;

  -- Folios: formato correcto y consumo del contador de A.
  v_txt := public.next_contract_number();
  IF v_txt <> 'CTR-0007' THEN
    v_fallas := array_append(v_fallas, format('next_contract_number devolvió %s', v_txt));
  END IF;
  v_txt := public.next_quote_number();
  IF v_txt <> 'COT-0201' THEN
    v_fallas := array_append(v_fallas, format('next_quote_number devolvió %s', v_txt));
  END IF;
  v_txt := public.next_supplier_bill_number();
  IF v_txt <> 'CXP-0011' THEN
    v_fallas := array_append(v_fallas, format('next_supplier_bill_number devolvió %s', v_txt));
  END IF;
  v_txt := public.next_draft_invoice_number();
  IF v_txt <> 'BORRADOR-0033' THEN
    v_fallas := array_append(v_fallas, format('next_draft_invoice_number devolvió %s', v_txt));
  END IF;
  v_txt := public.next_draft_credit_note_number();
  IF v_txt <> 'BORRADOR-NC-0044' THEN
    v_fallas := array_append(v_fallas, format('next_draft_credit_note_number devolvió %s', v_txt));
  END IF;
  v_txt := public.peek_next_draft_invoice_number();
  IF v_txt <> 'BORRADOR-0034' THEN
    v_fallas := array_append(v_fallas, format('peek_next_draft_invoice_number devolvió %s', v_txt));
  END IF;
  v_txt := public.peek_next_draft_credit_note_number();
  IF v_txt <> 'BORRADOR-NC-0045' THEN
    v_fallas := array_append(v_fallas, format('peek_next_draft_credit_note_number devolvió %s', v_txt));
  END IF;
  v_txt := public.peek_next_invoice_number();
  IF v_txt <> 'FAC-0055' THEN
    v_fallas := array_append(v_fallas, format('peek_next_invoice_number devolvió %s', v_txt));
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'RPC ORG 0043 (empresa A): %', array_to_string(v_fallas, ' | ');
  END IF;
  RAISE NOTICE 'OK: la empresa A sólo ve y consume lo suyo';
END;
$$;

-- ── 2. Identidad de portal con rol global residual ───────────────────
SET LOCAL request.jwt.claims TO
  '{"sub":"43000000-0000-4000-8000-0000000000a9","role":"authenticated"}';

DO $$
DECLARE
  v_fallas text[] := '{}';
  v_rows integer;
  v_int integer;
  v_txt text;
BEGIN
  v_int := public.count_releasable_payment_locks(24);
  IF v_int <> 0 THEN
    v_fallas := array_append(v_fallas, 'el portal contó bloqueos de pago internos');
  END IF;

  SELECT count(*) INTO v_rows FROM public.get_billing_secrets_status();
  IF v_rows <> 0 THEN
    v_fallas := array_append(v_fallas, 'el portal leyó el estado de secretos de facturación');
  END IF;

  BEGIN
    v_txt := public.next_contract_number();
    v_fallas := array_append(v_fallas, 'el portal consumió el folio de contrato');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    v_txt := public.next_quote_number();
    v_fallas := array_append(v_fallas, 'el portal consumió el folio de cotización');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    v_txt := public.next_supplier_bill_number();
    v_fallas := array_append(v_fallas, 'el portal consumió el folio de cuentas por pagar');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    v_txt := public.next_draft_invoice_number();
    v_fallas := array_append(v_fallas, 'el portal consumió el folio de factura borrador');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    v_txt := public.next_draft_credit_note_number();
    v_fallas := array_append(v_fallas, 'el portal consumió el folio de nota de crédito borrador');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    v_txt := public.peek_next_draft_invoice_number();
    v_fallas := array_append(v_fallas, 'el portal leyó el siguiente folio de factura borrador');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    v_txt := public.peek_next_draft_credit_note_number();
    v_fallas := array_append(v_fallas, 'el portal leyó el siguiente folio de nota de crédito borrador');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    v_txt := public.peek_next_invoice_number();
    v_fallas := array_append(v_fallas, 'el portal leyó el siguiente folio de factura');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'RPC ORG 0043 (portal): %', array_to_string(v_fallas, ' | ');
  END IF;
  RAISE NOTICE 'OK: la identidad de portal con rol residual queda bloqueada';
END;
$$;

-- ── 3. La empresa B quedó intacta ────────────────────────────────────
RESET role;
RESET request.jwt.claims;

DO $$
DECLARE
  v_fallas text[] := '{}';
  v_org_b uuid := '43000000-0000-4000-8000-0000000000b0';
  v_org_a uuid := '43000000-0000-4000-8000-0000000000a0';
BEGIN
  IF (SELECT next_value FROM public.organization_document_counters
       WHERE organization_id = v_org_b AND document_type = 'contract') <> 900
     OR (SELECT next_value FROM public.organization_document_counters
       WHERE organization_id = v_org_b AND document_type = 'quote') <> 901
     OR (SELECT next_value FROM public.organization_document_counters
       WHERE organization_id = v_org_b AND document_type = 'supplier_bill') <> 902
     OR (SELECT next_value FROM public.organization_document_counters
       WHERE organization_id = v_org_b AND document_type = 'draft_invoice') <> 903
     OR (SELECT next_value FROM public.organization_document_counters
       WHERE organization_id = v_org_b AND document_type = 'draft_credit_note') <> 904
     OR (SELECT next_value FROM public.organization_document_counters
       WHERE organization_id = v_org_b AND document_type = 'invoice') <> 905 THEN
    v_fallas := array_append(v_fallas, 'los contadores de B cambiaron');
  END IF;

  -- Los contadores de A avanzaron exactamente un paso donde corresponde.
  IF (SELECT next_value FROM public.organization_document_counters
       WHERE organization_id = v_org_a AND document_type = 'contract') <> 8
     OR (SELECT next_value FROM public.organization_document_counters
       WHERE organization_id = v_org_a AND document_type = 'invoice') <> 55 THEN
    v_fallas := array_append(v_fallas, 'los contadores de A no avanzaron como se esperaba');
  END IF;

  IF (SELECT facturapi_live_key FROM public.billing_secrets
       WHERE organization_id = v_org_b) IS DISTINCT FROM 'sk_live_b' THEN
    v_fallas := array_append(v_fallas, 'los secretos de B cambiaron');
  END IF;

  IF (SELECT count(*) FROM public.supplier_bills
       WHERE organization_id = v_org_b AND payment_in_progress_at IS NOT NULL) <> 3 THEN
    v_fallas := array_append(v_fallas, 'los bloqueos de pago de B cambiaron');
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'RPC ORG 0043 (empresa B): %', array_to_string(v_fallas, ' | ');
  END IF;
  RAISE NOTICE 'OK: la empresa B quedó intacta';
END;
$$;

ROLLBACK;
