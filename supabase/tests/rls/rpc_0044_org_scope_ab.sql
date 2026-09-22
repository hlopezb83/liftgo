-- Multiempresa · paso 7: las RPC de lecturas de cliente, ranking de reportes,
-- vínculo por RFC y folio REP (migración Drizzle 0044) no cruzan de empresa
-- ni confunden una identidad de portal con personal interno.
--
--   * Dos empresas reales (A y B) con clientes, reservas, facturas, pagos y
--     reportes propios.
--   * El administrador de A no lee ni muta datos de B.
--   * Una identidad de portal de A con rol administrativo residual sólo
--     obtiene su propio resumen/rentabilidad.
--   * El ranking del portal no expone reporter_id ni nombres internos.
--   * El vínculo por RFC sólo crea la relación en A.
--   * El REP de un pago de B no puede foliarse desde A ni falsificando
--     p_organization_id.
--   * Tras RESET ROLE/claims se verifica que B quedó intacta.
--   * ROLLBACK final: no persiste nada.
BEGIN;

DO $$
DECLARE
  v_org_a uuid := '44000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '44000000-0000-4000-8000-0000000000b0';
  v_admin_a uuid := '44000000-0000-4000-8000-0000000000a1';
  v_admin_b uuid := '44000000-0000-4000-8000-0000000000b1';
  v_portal_a uuid := '44000000-0000-4000-8000-0000000000a9';
  v_cust_a1 uuid := '44000000-0000-4000-8000-0000000000c1';
  v_cust_a2 uuid := '44000000-0000-4000-8000-0000000000c2';
  v_cust_b1 uuid := '44000000-0000-4000-8000-0000000000c3';
  v_cust_rfc uuid := '44000000-0000-4000-8000-0000000000c4';
BEGIN
  IF pg_get_functiondef('public.get_feedback_leaderboard(text)'::regprocedure)
       !~ 'current_portal_customer_id' THEN
    RAISE EXCEPTION 'RPC ORG 0044: la cadena Drizzle 0044 no se aplicó';
  END IF;

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Montacargas Lectura Norte', 'rpc-0044-a'),
    (v_org_b, 'Elevación Lectura Bajío', 'rpc-0044-b');

  -- ══════════════ Empresa A ══════════════
  PERFORM set_config('app.organization_id', v_org_a::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
    (v_admin_a, 'admin.a@lectura-norte.test', now(), now()),
    (v_portal_a, 'portal.a@lectura-norte.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_a, v_admin_a, 'internal'), (v_org_a, v_portal_a, 'portal');
  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin_a, 'admin'::public.app_role),
    (v_portal_a, 'admin'::public.app_role)  -- rol global residual
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.customers (id, name, created_by_organization_id) VALUES
    (v_cust_a1, 'Aceros Portal SA de CV', v_org_a),
    (v_cust_a2, 'Cementos Norte SA de CV', v_org_a),
    (v_cust_rfc, 'Vidrios Compartidos SA de CV', v_org_a);
  UPDATE public.customers SET rfc = 'VCO440101AAA' WHERE id = v_cust_rfc;
  INSERT INTO public.organization_customers (organization_id, customer_id) VALUES
    (v_org_a, v_cust_a1), (v_org_a, v_cust_a2);

  INSERT INTO public.customer_portal_accounts
    (organization_id, customer_id, auth_user_id, email)
  VALUES (v_org_a, v_cust_a1, v_portal_a, 'portal.a@lectura-norte.test');

  INSERT INTO public.forklifts (id, name, model, organization_id)
  VALUES ('44000000-0000-4000-8000-0000000000f1', 'FA01', 'Modelo A', v_org_a);

  INSERT INTO public.bookings
    (id, customer_id, forklift_id, start_date, end_date, booking_number, status, organization_id)
  VALUES ('44000000-0000-4000-8000-0000000000e1', v_cust_a1,
          '44000000-0000-4000-8000-0000000000f1',
          current_date - 10, current_date - 5, 'RES-A-0001', 'confirmed', v_org_a);

  -- validate_invoice_line_items_signs exige partidas coherentes fuera de borrador.
  INSERT INTO public.invoices
    (id, invoice_number, customer_id, status, line_items, subtotal, tax_amount, total, organization_id)
  VALUES ('44000000-0000-4000-8000-0000000000d1', 'FAC-A-0001', v_cust_a1, 'sent',
          '[{"description":"Renta mensual FA01","quantity":1,"unit_price":1000,"amount":1000}]'::jsonb,
          1000, 160, 1160, v_org_a);

  INSERT INTO public.payments (id, invoice_id, amount, organization_id)
  VALUES ('44000000-0000-4000-8000-00000000000a', '44000000-0000-4000-8000-0000000000d1',
          100, v_org_a);

  INSERT INTO public.feedback_reports
    (reporter_id, reporter_type, reporter_name, type, title, description,
     status, points_awarded, organization_id)
  VALUES
    (v_admin_a, 'internal', 'Juan Interno A', 'bug', 'Falla interna A',
     'Descripción suficiente de la falla interna A', 'resolved', 10, v_org_a),
    (v_portal_a, 'customer', 'Cliente Portal A', 'improvement', 'Mejora del portal A',
     'Descripción suficiente de la mejora del portal A', 'resolved', 5, v_org_a);

  -- ══════════════ Empresa B ══════════════
  PERFORM set_config('app.organization_id', v_org_b::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_b, 'admin.b@lectura-bajio.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_b, v_admin_b, 'internal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_b, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.customers (id, name, created_by_organization_id)
  VALUES (v_cust_b1, 'Minera Bajío SA de CV', v_org_b);
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_b, v_cust_b1);

  INSERT INTO public.forklifts (id, name, model, organization_id)
  VALUES ('44000000-0000-4000-8000-0000000000f2', 'FB01', 'Modelo B', v_org_b);

  INSERT INTO public.bookings
    (id, customer_id, forklift_id, start_date, end_date, booking_number, status, organization_id)
  VALUES ('44000000-0000-4000-8000-0000000000e2', v_cust_b1,
          '44000000-0000-4000-8000-0000000000f2',
          current_date - 8, current_date - 2, 'RES-B-0001', 'confirmed', v_org_b);

  INSERT INTO public.invoices
    (id, invoice_number, customer_id, status, line_items, subtotal, tax_amount, total, organization_id)
  VALUES ('44000000-0000-4000-8000-0000000000d2', 'FAC-B-0001', v_cust_b1, 'sent',
          '[{"description":"Renta mensual FB01","quantity":1,"unit_price":5000,"amount":5000}]'::jsonb,
          5000, 800, 5800, v_org_b);

  INSERT INTO public.payments (id, invoice_id, amount, organization_id)
  VALUES ('44000000-0000-4000-8000-00000000000b', '44000000-0000-4000-8000-0000000000d2',
          500, v_org_b);

  INSERT INTO public.feedback_reports
    (reporter_id, reporter_type, reporter_name, type, title, description,
     status, points_awarded, organization_id)
  VALUES (v_admin_b, 'internal', 'Ana Interna B', 'bug', 'Falla interna B',
          'Descripción suficiente de la falla interna B', 'resolved', 7, v_org_b);

  PERFORM set_config('app.organization_id', '', true);
  RAISE NOTICE 'SEED 0044 OK';
END;
$$;

-- ── 1. Sesión del administrador de A ─────────────────────────────────
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"44000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_fallas text[] := '{}';
  v_json jsonb;
  v_uuid uuid;
  v_txt text;
  v_rows int;
BEGIN
  -- Caso positivo interno: A lee a su propio cliente.
  v_json := public.get_customer_summary('44000000-0000-4000-8000-0000000000c1');
  IF jsonb_array_length(v_json -> 'bookings') <> 1
     OR jsonb_array_length(v_json -> 'invoices') <> 1 THEN
    v_fallas := array_append(v_fallas, 'admin A no ve el resumen de su propio cliente');
  END IF;

  -- A no ve datos de B aunque pida el customer_id de B.
  v_json := public.get_customer_summary('44000000-0000-4000-8000-0000000000c3');
  IF jsonb_array_length(v_json -> 'bookings') <> 0
     OR jsonb_array_length(v_json -> 'invoices') <> 0 THEN
    v_fallas := array_append(v_fallas, 'admin A ve reservas/facturas de B');
  END IF;

  v_json := public.get_customer_profitability('44000000-0000-4000-8000-0000000000c3');
  IF (v_json ->> 'revenue')::numeric <> 0 THEN
    v_fallas := array_append(v_fallas, 'admin A ve ingresos de B');
  END IF;

  -- Caso positivo interno de rentabilidad.
  v_json := public.get_customer_profitability('44000000-0000-4000-8000-0000000000c1');
  IF (v_json ->> 'revenue')::numeric <> 1000 THEN
    v_fallas := array_append(v_fallas, 'admin A no ve los ingresos de su propio cliente');
  END IF;

  -- Ranking interno de A: conserva reporter_id y nombres internos, sólo de A.
  SELECT count(*) INTO v_rows FROM public.get_feedback_leaderboard('all');
  IF v_rows <> 2 THEN
    v_fallas := array_append(v_fallas, format('ranking interno de A devolvió %s filas', v_rows));
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_feedback_leaderboard('all') l WHERE l.reporter_id IS NULL) THEN
    v_fallas := array_append(v_fallas, 'ranking interno de A oculta reporter_id');
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_feedback_leaderboard('all') l
              WHERE l.reporter_name = 'Ana Interna B') THEN
    v_fallas := array_append(v_fallas, 'ranking interno de A incluye reportes de B');
  END IF;

  -- Vínculo por RFC: sólo en A.
  v_uuid := public.link_customer_to_organization_by_rfc('VCO440101AAA');
  IF v_uuid IS DISTINCT FROM '44000000-0000-4000-8000-0000000000c4'::uuid THEN
    v_fallas := array_append(v_fallas, 'el vínculo por RFC no devolvió el cliente esperado');
  END IF;

  -- REP de un pago de B: bloqueado, con y sin p_organization_id falsificado.
  BEGIN
    v_txt := public.assign_stamped_rep_number('44000000-0000-4000-8000-00000000000b', '9', NULL);
    v_fallas := array_append(v_fallas, 'admin A folió un pago de B');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    v_txt := public.assign_stamped_rep_number(
      '44000000-0000-4000-8000-00000000000b', '9',
      '44000000-0000-4000-8000-0000000000a0');
    v_fallas := array_append(v_fallas, 'admin A folió un pago de B falsificando la organización');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Caso positivo: REP de un pago propio.
  v_txt := public.assign_stamped_rep_number('44000000-0000-4000-8000-00000000000a', '1', NULL);
  IF v_txt <> 'CP-0001' THEN
    v_fallas := array_append(v_fallas, format('folio REP propio inesperado: %s', v_txt));
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'A/B 0044 FALLA (admin A): %', array_to_string(v_fallas, ' | ');
  END IF;
  RAISE NOTICE 'A/B 0044 admin A OK';
END;
$$;

-- ── 2. Sesión de portal de A con rol administrativo residual ─────────
SET LOCAL request.jwt.claims TO
  '{"sub":"44000000-0000-4000-8000-0000000000a9","role":"authenticated"}';

DO $$
DECLARE
  v_fallas text[] := '{}';
  v_json jsonb;
  v_uuid uuid;
BEGIN
  -- Caso positivo portal: su propio cliente.
  v_json := public.get_customer_summary('44000000-0000-4000-8000-0000000000c1');
  IF jsonb_array_length(v_json -> 'invoices') <> 1 THEN
    v_fallas := array_append(v_fallas, 'el portal no ve su propia factura');
  END IF;
  v_json := public.get_customer_profitability('44000000-0000-4000-8000-0000000000c1');
  IF (v_json ->> 'revenue')::numeric <> 1000 THEN
    v_fallas := array_append(v_fallas, 'el portal no ve su propia rentabilidad');
  END IF;

  -- Otro cliente de su misma empresa: bloqueado pese al rol residual.
  BEGIN
    v_json := public.get_customer_summary('44000000-0000-4000-8000-0000000000c2');
    v_fallas := array_append(v_fallas, 'el portal con rol residual leyó otro cliente de A');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    v_json := public.get_customer_profitability('44000000-0000-4000-8000-0000000000c2');
    v_fallas := array_append(v_fallas, 'el portal con rol residual leyó la rentabilidad de otro cliente de A');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Cliente de B: bloqueado.
  BEGIN
    v_json := public.get_customer_summary('44000000-0000-4000-8000-0000000000c3');
    v_fallas := array_append(v_fallas, 'el portal leyó un cliente de B');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Ranking del portal: sin reporter_id ni nombres internos.
  IF EXISTS (SELECT 1 FROM public.get_feedback_leaderboard('all') l
              WHERE l.reporter_id IS NOT NULL) THEN
    v_fallas := array_append(v_fallas, 'el ranking del portal expone reporter_id');
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_feedback_leaderboard('all') l
              WHERE l.reporter_name = 'Juan Interno A') THEN
    v_fallas := array_append(v_fallas, 'el ranking del portal expone nombres internos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_feedback_leaderboard('all') l
                  WHERE l.reporter_name = 'Equipo LiftGo') THEN
    v_fallas := array_append(v_fallas, 'el ranking del portal no agrupa al personal interno');
  END IF;

  -- Vínculo por RFC: canal exclusivamente interno.
  BEGIN
    v_uuid := public.link_customer_to_organization_by_rfc('VCO440101AAA');
    v_fallas := array_append(v_fallas, 'el portal con rol residual vinculó un cliente por RFC');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Folio REP: canal exclusivamente interno.
  BEGIN
    PERFORM public.assign_stamped_rep_number('44000000-0000-4000-8000-00000000000a', '2', NULL);
    v_fallas := array_append(v_fallas, 'el portal con rol residual folió un pago');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
    WHEN unique_violation THEN
      v_fallas := array_append(v_fallas, 'el portal con rol residual alcanzó la lógica de folios');
  END;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'A/B 0044 FALLA (portal A): %', array_to_string(v_fallas, ' | ');
  END IF;
  RAISE NOTICE 'A/B 0044 portal A OK';
END;
$$;

-- ── 3. Verificación de que B quedó intacta ───────────────────────────
RESET ROLE;
RESET request.jwt.claims;

DO $$
DECLARE
  v_fallas text[] := '{}';
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments
              WHERE id = '44000000-0000-4000-8000-00000000000b'
                AND (rep_number IS NOT NULL OR rep_folio IS NOT NULL)) THEN
    v_fallas := array_append(v_fallas, 'el pago de B recibió folio REP');
  END IF;

  IF EXISTS (SELECT 1 FROM public.organization_customers
              WHERE organization_id = '44000000-0000-4000-8000-0000000000b0'
                AND customer_id = '44000000-0000-4000-8000-0000000000c4') THEN
    v_fallas := array_append(v_fallas, 'el vínculo por RFC alcanzó a B');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organization_customers
                  WHERE organization_id = '44000000-0000-4000-8000-0000000000a0'
                    AND customer_id = '44000000-0000-4000-8000-0000000000c4'
                    AND status = 'active') THEN
    v_fallas := array_append(v_fallas, 'el vínculo por RFC no quedó en A');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payments
                  WHERE id = '44000000-0000-4000-8000-00000000000a'
                    AND rep_number = 'CP-0001') THEN
    v_fallas := array_append(v_fallas, 'el folio REP de A no se aplicó');
  END IF;

  IF (SELECT count(*) FROM public.invoices
       WHERE organization_id = '44000000-0000-4000-8000-0000000000b0') <> 1 THEN
    v_fallas := array_append(v_fallas, 'las facturas de B cambiaron');
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'A/B 0044 FALLA (estado final): %', array_to_string(v_fallas, ' | ');
  END IF;
  RAISE NOTICE 'A/B 0044 OK';
END;
$$;

ROLLBACK;
