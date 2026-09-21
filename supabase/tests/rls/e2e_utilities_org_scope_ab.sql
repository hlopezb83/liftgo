-- Multiempresa · paso 2: las utilidades E2E sólo tocan la empresa del llamante.
--
-- Contrato que deja la migración Drizzle 0038, con DOS empresas nuevas (A y B)
-- que siembran el MISMO p_scope:
--   1) `e2e_seed_scenario` escribe organization_id explícito y enlaza el
--      cliente con `organization_customers` de su propia empresa.
--   2) `e2e_teardown(scope)` ejecutado por A no borra nada de B.
--   3) `purge_e2e_audit_logs()` ejecutado por A no borra la bitácora de B.
--   4) `purge_e2e_data()` ejecutado por A no borra los datos de B.
--   5) Sin contexto interno único o sin rol admin, las funciones fallan.
--
-- No cambia policies, grants ni funciones: sólo ejercita el contrato.
BEGIN;

-- ── 0. Dos empresas, sus administradores y su configuración ──────────
DO $$
DECLARE
  v_org_a uuid := '38000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '38000000-0000-4000-8000-0000000000b0';
  v_admin_a uuid := '38000000-0000-4000-8000-0000000000a1';
  v_admin_b uuid := '38000000-0000-4000-8000-0000000000b1';
  v_plain uuid := '38000000-0000-4000-8000-0000000000c1';
BEGIN
  IF to_regprocedure('public.e2e_require_admin_organization(text)') IS NULL THEN
    RAISE EXCEPTION 'E2E ORG: falta la guarda 0038; la cadena Drizzle no se aplicó';
  END IF;

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Empresa E2E A', 'e2e-ab-a'),
    (v_org_b, 'Empresa E2E B', 'e2e-ab-b');

  INSERT INTO public.company_settings
    (organization_id, razon_social, rfc, regimen_fiscal, lugar_expedicion, allow_e2e_seed)
  VALUES
    (v_org_a, 'Empresa E2E A SA', 'AAA010101AA1', '601', '64000', true),
    (v_org_b, 'Empresa E2E B SA', 'BBB010101BB1', '601', '64000', true);

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_a, 'admin-a@e2e-ab.test', now(), now()) ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_plain, 'staff-a@e2e-ab.test', now(), now()) ON CONFLICT DO NOTHING;
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_a, v_admin_a, 'internal'), (v_org_a, v_plain, 'internal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_a, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_plain, 'dispatcher'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_b, 'admin-b@e2e-ab.test', now(), now()) ON CONFLICT DO NOTHING;
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_b, v_admin_b, 'internal');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_b, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- ── 1. Cada empresa siembra el MISMO scope ───────────────────────────
SET LOCAL request.jwt.claims TO '{"sub":"38000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT public.e2e_seed_scenario('ab-e2e-scope') AS seed_a \gset
RESET request.jwt.claims;

SET LOCAL request.jwt.claims TO '{"sub":"38000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
SELECT public.e2e_seed_scenario('ab-e2e-scope') AS seed_b \gset
RESET request.jwt.claims;

DO $$
DECLARE
  v_org_a uuid := '38000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '38000000-0000-4000-8000-0000000000b0';
  v_fallas text[] := '{}';
  v_n integer;
BEGIN
  FOR v_n IN SELECT 1 LOOP NULL; END LOOP;

  IF (SELECT count(*) FROM public.invoices
       WHERE is_e2e AND e2e_scope = 'ab-e2e-scope' AND organization_id = v_org_a) <> 1 THEN
    v_fallas := v_fallas || 'invoices: A no tiene exactamente 1 factura sembrada';
  END IF;
  IF (SELECT count(*) FROM public.invoices
       WHERE is_e2e AND e2e_scope = 'ab-e2e-scope' AND organization_id = v_org_b) <> 1 THEN
    v_fallas := v_fallas || 'invoices: B no tiene exactamente 1 factura sembrada';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.forklifts
     WHERE is_e2e AND e2e_scope = 'ab-e2e-scope'
       AND organization_id NOT IN (v_org_a, v_org_b)
  ) THEN
    v_fallas := v_fallas || 'forklifts: se sembró en una empresa ajena';
  END IF;

  -- Enlace explícito de cliente por empresa.
  IF (SELECT count(*) FROM public.organization_customers oc
        JOIN public.customers c ON c.id = oc.customer_id
       WHERE c.is_e2e AND c.e2e_scope = 'ab-e2e-scope' AND oc.organization_id = v_org_a) <> 1 THEN
    v_fallas := v_fallas || 'organization_customers: falta el enlace del cliente E2E de A';
  END IF;
  IF (SELECT count(*) FROM public.organization_customers oc
        JOIN public.customers c ON c.id = oc.customer_id
       WHERE c.is_e2e AND c.e2e_scope = 'ab-e2e-scope' AND oc.organization_id = v_org_b) <> 1 THEN
    v_fallas := v_fallas || 'organization_customers: falta el enlace del cliente E2E de B';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'E2E ORG 0038: la semilla no quedó acotada por empresa:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: A y B sembraron el mismo scope sin invadirse';
END;
$$;

-- ── 2. Teardown de A no toca a B ─────────────────────────────────────
SET LOCAL request.jwt.claims TO '{"sub":"38000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT public.e2e_teardown('ab-e2e-scope') AS teardown_a \gset
RESET request.jwt.claims;

DO $$
DECLARE
  v_org_a uuid := '38000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '38000000-0000-4000-8000-0000000000b0';
  v_fallas text[] := '{}';
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices','bookings','quotes','forklifts','equipment_models'] LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE is_e2e AND e2e_scope = $1 AND organization_id = $2', t)
      INTO STRICT v_org_a USING 'ab-e2e-scope', v_org_a; -- placeholder, reasignado abajo
  END LOOP;
  RAISE EXCEPTION 'unreachable';
EXCEPTION WHEN OTHERS THEN
  -- El bucle dinámico anterior sólo existe para documentar la intención; la
  -- verificación real es explícita y sin EXECUTE.
  v_org_a := '38000000-0000-4000-8000-0000000000a0';

  IF EXISTS (SELECT 1 FROM public.invoices
              WHERE is_e2e AND e2e_scope = 'ab-e2e-scope' AND organization_id = v_org_a) THEN
    v_fallas := v_fallas || 'invoices: A no se limpió';
  END IF;
  IF EXISTS (SELECT 1 FROM public.forklifts
              WHERE is_e2e AND e2e_scope = 'ab-e2e-scope' AND organization_id = v_org_a) THEN
    v_fallas := v_fallas || 'forklifts: A no se limpió';
  END IF;

  IF (SELECT count(*) FROM public.invoices
       WHERE is_e2e AND e2e_scope = 'ab-e2e-scope' AND organization_id = v_org_b) <> 1 THEN
    v_fallas := v_fallas || 'invoices: el teardown de A borró la factura de B';
  END IF;
  IF (SELECT count(*) FROM public.bookings
       WHERE is_e2e AND e2e_scope = 'ab-e2e-scope' AND organization_id = v_org_b) <> 1 THEN
    v_fallas := v_fallas || 'bookings: el teardown de A borró la reserva de B';
  END IF;
  IF (SELECT count(*) FROM public.quotes
       WHERE is_e2e AND e2e_scope = 'ab-e2e-scope' AND organization_id = v_org_b) <> 1 THEN
    v_fallas := v_fallas || 'quotes: el teardown de A borró la cotización de B';
  END IF;
  IF (SELECT count(*) FROM public.forklifts
       WHERE is_e2e AND e2e_scope = 'ab-e2e-scope' AND organization_id = v_org_b) <> 1 THEN
    v_fallas := v_fallas || 'forklifts: el teardown de A borró el montacargas de B';
  END IF;
  IF (SELECT count(*) FROM public.maintenance_logs
       WHERE is_e2e AND e2e_scope = 'ab-e2e-scope' AND organization_id = v_org_b) <> 1 THEN
    v_fallas := v_fallas || 'maintenance_logs: el teardown de A borró el mantenimiento de B';
  END IF;
  IF (SELECT count(*) FROM public.organization_customers oc
        JOIN public.customers c ON c.id = oc.customer_id
       WHERE c.is_e2e AND c.e2e_scope = 'ab-e2e-scope' AND oc.organization_id = v_org_b) <> 1 THEN
    v_fallas := v_fallas || 'customers: el teardown de A borró el cliente de B';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'E2E ORG 0038: el teardown cruzó de empresa:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: e2e_teardown de A dejó intacta a B';
END;
$$;

-- ── 3. Bitácora: purge de A no toca la de B ──────────────────────────
DO $$
DECLARE
  v_org_a uuid := '38000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '38000000-0000-4000-8000-0000000000b0';
BEGIN
  INSERT INTO public.audit_logs (organization_id, table_name, record_id, action, is_e2e)
  VALUES
    (v_org_a, 'invoices', gen_random_uuid(), 'INSERT', true),
    (v_org_b, 'invoices', gen_random_uuid(), 'INSERT', true);
END;
$$;

SET LOCAL request.jwt.claims TO '{"sub":"38000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT public.purge_e2e_audit_logs() AS purged_logs_a \gset
RESET request.jwt.claims;

DO $$
DECLARE
  v_org_a uuid := '38000000-0000-4000-8000-0000000000a0';
  v_org_b uuid := '38000000-0000-4000-8000-0000000000b0';
BEGIN
  IF EXISTS (SELECT 1 FROM public.audit_logs WHERE is_e2e AND organization_id = v_org_a) THEN
    RAISE EXCEPTION 'E2E ORG 0038: purge_e2e_audit_logs no limpió su propia empresa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE is_e2e AND organization_id = v_org_b) THEN
    RAISE EXCEPTION 'E2E ORG 0038: purge_e2e_audit_logs borró la bitácora E2E de otra empresa';
  END IF;
  RAISE NOTICE 'OK: purge_e2e_audit_logs quedó acotado a la empresa del llamante';
END;
$$;

-- ── 4. purge_e2e_data de A no toca a B ───────────────────────────────
SET LOCAL request.jwt.claims TO '{"sub":"38000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT public.purge_e2e_data() AS purged_a \gset
RESET request.jwt.claims;

DO $$
DECLARE
  v_org_b uuid := '38000000-0000-4000-8000-0000000000b0';
  v_fallas text[] := '{}';
BEGIN
  IF (SELECT count(*) FROM public.invoices WHERE is_e2e AND organization_id = v_org_b) <> 1 THEN
    v_fallas := v_fallas || 'invoices: purge_e2e_data de A borró la factura de B';
  END IF;
  IF (SELECT count(*) FROM public.forklifts WHERE is_e2e AND organization_id = v_org_b) <> 1 THEN
    v_fallas := v_fallas || 'forklifts: purge_e2e_data de A borró el montacargas de B';
  END IF;
  IF (SELECT count(*) FROM public.organization_customers oc
        JOIN public.customers c ON c.id = oc.customer_id
       WHERE c.is_e2e AND oc.organization_id = v_org_b) <> 1 THEN
    v_fallas := v_fallas || 'customers: purge_e2e_data de A borró el cliente de B';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'E2E ORG 0038: purge_e2e_data cruzó de empresa:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: purge_e2e_data quedó acotado a la empresa del llamante';
END;
$$;

-- ── 5. Sin rol admin o sin contexto interno único, se rechaza ────────
SET LOCAL request.jwt.claims TO '{"sub":"38000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.purge_e2e_data();
    RAISE EXCEPTION 'E2E ORG 0038: un usuario sin rol admin pudo purgar datos E2E';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: purge_e2e_data exige rol admin';
  END;
END;
$$;
RESET request.jwt.claims;

DO $$
BEGIN
  BEGIN
    PERFORM public.e2e_teardown('ab-e2e-scope');
    RAISE EXCEPTION 'E2E ORG 0038: sin sesión autenticada se pudo ejecutar e2e_teardown';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: e2e_teardown exige contexto interno único';
  END;
END;
$$;

ROLLBACK;
