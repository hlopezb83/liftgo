-- Multiempresa · Tramo 8.1: el asignador de folio REP debe estar acotado a la
-- organización del propio pago.
--
-- Esta prueba FALLA si la migración del tramo 8.1 no está aplicada en el
-- entorno donde corre. La migración forma parte del cambio, así que un NOTICE
-- que la convirtiera en no-op ocultaría exactamente el riesgo que se audita.
BEGIN;

DO $$
DECLARE
  v_strict oid;
  v_legacy oid;
  v_def text;
  v_legacy_def text;
BEGIN
  -- 1. Firma estricta de tres parámetros (obligatoria).
  SELECT p.oid INTO v_strict
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'assign_stamped_rep_number'
    AND p.pronargs = 3;

  IF v_strict IS NULL THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: falta assign_stamped_rep_number(uuid, text, uuid); aplicar la migración del tramo 8.1 antes de desplegar Edge Functions';
  END IF;

  v_def := pg_get_functiondef(v_strict);

  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_strict AND p.prosecdef) THEN
    RAISE EXCEPTION 'REP FOLIO ORG: la función estricta debe ser SECURITY DEFINER';
  END IF;

  -- search_path EXACTAMENTE "public": no basta con que la palabra aparezca.
  SELECT p.proconfig INTO v_config FROM pg_proc p WHERE p.oid = v_strict;
  IF v_config IS NULL OR NOT ('search_path=public' = ANY (v_config)) THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: la función estricta debe fijar search_path exactamente a "public" (proconfig actual: %)',
      coalesce(array_to_string(v_config, ','), '<sin proconfig>');
  END IF;

  -- La organización se lee de payments ANTES del UPDATE y condiciona el UPDATE.
  IF v_def !~ 'FROM public\.payments' AND v_def !~ 'FROM payments' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: la organización debe leerse de payments antes del UPDATE';
  END IF;

  IF v_def !~ 'organization_id\s*=\s*v_payment_org' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el UPDATE debe filtrar por la organización leída del pago';
  END IF;

  IF v_def !~ 'p_organization_id' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: la función debe contrastar p_organization_id contra el pago';
  END IF;

  IF v_def !~ 'v_payment_org IS NULL' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: un pago sin organización debe rechazarse explícitamente';
  END IF;

  -- El rol no basta: un caller autenticado debe pertenecer a la organización
  -- del pago (contexto verificado en base, no parámetro del llamante).
  IF v_def !~ 'current_organization_id' OR v_def !~ 'is_internal_member' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: la función debe validar el contexto del llamante autenticado (current_organization_id + is_internal_member)';
  END IF;

  -- 2. Wrapper de compatibilidad de dos parámetros: OBLIGATORIO (lo usa el
  --    canal interno de reconciliación) y restringido a service_role.
  SELECT p.oid INTO v_legacy
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'assign_stamped_rep_number'
    AND p.pronargs = 2;

  IF v_legacy IS NULL THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: falta el wrapper assign_stamped_rep_number(uuid, text); el canal interno de reconciliación quedaría sin ruta';
  END IF;

  v_legacy_def := pg_get_functiondef(v_legacy);

  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_legacy AND p.prosecdef) THEN
    RAISE EXCEPTION 'REP FOLIO ORG: el wrapper debe ser SECURITY DEFINER';
  END IF;

  SELECT p.proconfig INTO v_config FROM pg_proc p WHERE p.oid = v_legacy;
  IF v_config IS NULL OR NOT ('search_path=public' = ANY (v_config)) THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el wrapper debe fijar search_path exactamente a "public" (proconfig actual: %)',
      coalesce(array_to_string(v_config, ','), '<sin proconfig>');
  END IF;

  IF v_legacy_def !~ 'assign_stamped_rep_number\s*\(' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el wrapper de dos parámetros debe delegar en la función estricta';
  END IF;

  IF v_legacy_def ~* 'UPDATE\s+(public\.)?payments' THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el wrapper no debe actualizar payments por su cuenta';
  END IF;

  -- Grants exactos del wrapper: solo service_role.
  IF NOT has_function_privilege('service_role', v_legacy, 'EXECUTE') THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el wrapper debe seguir disponible para service_role';
  END IF;

  IF has_function_privilege('authenticated', v_legacy, 'EXECUTE') THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el wrapper de dos parámetros NO debe ser ejecutable por authenticated';
  END IF;

  IF has_function_privilege('anon', v_legacy, 'EXECUTE') THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el wrapper de dos parámetros NO debe ser ejecutable por anon';
  END IF;

  SELECT p.proacl INTO v_acl FROM pg_proc p WHERE p.oid = v_legacy;
  IF v_acl IS NULL OR EXISTS (
    SELECT 1 FROM aclexplode(v_acl) a
    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'REP FOLIO ORG: el wrapper NO debe tener EXECUTE para PUBLIC';
  END IF;

  -- Grants exactos de la firma estricta: authenticated y service_role; nunca
  -- anon ni PUBLIC.
  IF NOT has_function_privilege('authenticated', v_strict, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_strict, 'EXECUTE') THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: la firma estricta debe ser ejecutable por authenticated y service_role';
  END IF;

  IF has_function_privilege('anon', v_strict, 'EXECUTE') THEN
    RAISE EXCEPTION 'REP FOLIO ORG: la firma estricta NO debe ser ejecutable por anon';
  END IF;

  SELECT p.proacl INTO v_acl FROM pg_proc p WHERE p.oid = v_strict;
  IF v_acl IS NULL OR EXISTS (
    SELECT 1 FROM aclexplode(v_acl) a
    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'REP FOLIO ORG: la firma estricta NO debe tener EXECUTE para PUBLIC';
  END IF;

  -- 3. El índice global se conserva en este tramo (el Lote 2 no se aplica).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND indexname = 'payments_rep_number_uidx'
  ) THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: payments_rep_number_uidx debe conservarse en el tramo 8.1';
  END IF;

  RAISE NOTICE 'REP FOLIO ORG: contrato estático OK';
END $$;

-- =====================================================================
-- 4. Prueba conductual A/B: un admin autenticado de A no puede folear un
--    pago de B, ni pasando la organización de B ni pasando NULL, ni por el
--    wrapper histórico. El pago de B no debe cambiar.
-- =====================================================================

DO $$
DECLARE
  v_org_a uuid;
  v_org_b uuid := 'a8100000-0000-4000-8000-0000000000b1';
  v_admin_a uuid := 'a8100000-0000-4000-8000-0000000000a1';
  v_cust_a uuid := 'a8100000-0000-4000-8000-0000000000c1';
  v_cust_b uuid := 'a8100000-0000-4000-8000-0000000000c2';
  v_inv_a uuid := 'a8100000-0000-4000-8000-0000000000d1';
  v_inv_b uuid := 'a8100000-0000-4000-8000-0000000000d2';
  v_pay_a uuid := 'a8100000-0000-4000-8000-0000000000e1';
  v_pay_b uuid := 'a8100000-0000-4000-8000-0000000000e2';
BEGIN
  SELECT id INTO v_org_a
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  IF v_org_a IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere la organización inicial';
  END IF;

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_b, 'Organización B de folio REP', 'rep-folio-org-b');

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_a, 'rep-admin-a@rls.test', now(), now());

  INSERT INTO public.organization_memberships (
    organization_id, auth_user_id, member_type
  )
  VALUES (v_org_a, v_admin_a, 'internal');

  INSERT INTO public.profiles (user_id, full_name, is_active)
  VALUES (v_admin_a, 'Admin A folio REP', true)
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_a, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.customers (id, name) VALUES (v_cust_a, 'Cliente A folio REP');
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_a, v_cust_a) ON CONFLICT DO NOTHING;

  INSERT INTO public.invoices (
    id, invoice_number, customer_id, customer_name,
    subtotal, tax_amount, total, status, line_items
  )
  VALUES (
    v_inv_a, 'FAC-REP-A', v_cust_a, 'Cliente A folio REP',
    1000, 0, 1000, 'sent',
    '[{"description":"Renta A","quantity":1,"unit_price":1000,"amount":1000}]'::jsonb
  );

  INSERT INTO public.payments (id, invoice_id, amount)
  VALUES (v_pay_a, v_inv_a, 500);

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.customers (id, name) VALUES (v_cust_b, 'Cliente B folio REP');
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_b, v_cust_b) ON CONFLICT DO NOTHING;

  INSERT INTO public.invoices (
    id, invoice_number, customer_id, customer_name,
    subtotal, tax_amount, total, status, line_items
  )
  VALUES (
    v_inv_b, 'FAC-REP-B', v_cust_b, 'Cliente B folio REP',
    900, 0, 900, 'sent',
    '[{"description":"Renta B","quantity":1,"unit_price":900,"amount":900}]'::jsonb
  );

  INSERT INTO public.payments (id, invoice_id, amount)
  VALUES (v_pay_b, v_inv_b, 900);

  PERFORM set_config('app.organization_id', v_org_a::text, true);
END $$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"a8100000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_org_a uuid := public.current_organization_id();
  v_org_b uuid := 'a8100000-0000-4000-8000-0000000000b1';
  v_pay_a uuid := 'a8100000-0000-4000-8000-0000000000e1';
  v_pay_b uuid := 'a8100000-0000-4000-8000-0000000000e2';
  v_blocked boolean;
  v_result text;
BEGIN
  IF v_org_a IS NULL THEN
    RAISE EXCEPTION 'CONTEXTO: el admin interno debe resolver la organización A';
  END IF;

  -- a) Firma estricta con la organización de B.
  v_blocked := false;
  BEGIN
    PERFORM public.assign_stamped_rep_number(v_pay_b, '9001', v_org_b);
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el admin de A pudo folear un pago de B pasando la organización de B';
  END IF;

  -- b) Firma estricta con NULL (el caso auditado: el parámetro no protege).
  v_blocked := false;
  BEGIN
    PERFORM public.assign_stamped_rep_number(v_pay_b, '9002', NULL::uuid);
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el admin de A pudo folear un pago de B pasando NULL';
  END IF;

  -- c) Wrapper histórico de dos parámetros desde sesión autenticada.
  --    Debe fallar, ya sea por falta de EXECUTE o por el chequeo de contexto.
  v_blocked := false;
  BEGIN
    PERFORM public.assign_stamped_rep_number(v_pay_b, '9003');
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el wrapper de dos parámetros permitió folear un pago de B';
  END IF;

  -- d) Flujo válido dentro de la propia organización + idempotencia.
  v_result := public.assign_stamped_rep_number(v_pay_a, '7', v_org_a);
  IF v_result <> 'CP-0007' THEN
    RAISE EXCEPTION 'REP FOLIO ORG: flujo válido devolvió % en vez de CP-0007', v_result;
  END IF;

  IF public.assign_stamped_rep_number(v_pay_a, '7', v_org_a) <> 'CP-0007' THEN
    RAISE EXCEPTION 'REP FOLIO ORG: la reasignación del mismo folio debe ser idempotente';
  END IF;
END $$;

RESET role;
RESET request.jwt.claims;

DO $$
BEGIN
  -- El pago de B no cambió por ninguno de los intentos anteriores.
  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE id = 'a8100000-0000-4000-8000-0000000000e2'
      AND (rep_number IS NOT NULL OR rep_folio IS NOT NULL)
  ) THEN
    RAISE EXCEPTION
      'REP FOLIO ORG: el pago de B fue modificado por un admin de A';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE id = 'a8100000-0000-4000-8000-0000000000e1'
      AND rep_number = 'CP-0007'
  ) THEN
    RAISE EXCEPTION 'REP FOLIO ORG: el pago de A debió quedar con CP-0007';
  END IF;

  RAISE NOTICE 'REP FOLIO ORG: OK';
END $$;

ROLLBACK;
