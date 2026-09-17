-- Multiempresa · verificación de la cadena productiva 0024 → 0025 → 0026.
--
-- Esta suite corre sobre la base efímera de CI, que aplica el historial
-- Supabase completo y después las migraciones Drizzle en orden (0024, 0025 y
-- 0026 incluidas). Comprueba lo que NINGUNA otra suite cubre hoy:
--
--   1) 0025 no solo instaló helpers: reemplazó las policies globales de
--      profiles/user_roles por policies acotadas a la organización.
--   2) Grants exactos del asignador de folio REP (0026).
--   3) Escenario sintético de 2 organizaciones, 4 usuarios internos y una
--      cuenta de portal con rol operativo residual:
--        - organización fail-closed (sin membresía → NULL);
--        - el portal con rol operativo no pasa como personal interno;
--        - 0026 con SQLSTATE exacto 42501 en los cruces, sin mutar la otra
--          empresa, e idempotencia del caller interno;
--        - reconciliación service_role por el wrapper, idempotente.
--   4) Guard de la brecha de producción: si falta is_internal_member (es
--      decir, si se aplicara 0026 sin 0025), la ruta autenticada del folio
--      falla con 42883. Se demuestra dentro de un SAVEPOINT y se revierte.
--
-- No duplica: portal_account_status_fallback.sql cubre 0024 (respaldo legado y
-- estados suspended/revoked), admin_cross_org.sql cubre el aislamiento
-- administrativo A/B y el invariante de último admin, y rep_folio_org_scope.sql
-- cubre el contrato estático de la función y el cruce A→B genérico.
--
-- Datos 100 % sintéticos. Nada se copia de producción. Termina en ROLLBACK.
BEGIN;

-- =====================================================================
-- 1. 0025 aplicada: policies org-scoped en lugar de las globales
-- =====================================================================
DO $$
DECLARE
  v_legacy text[] := ARRAY[
    'Staff can view all profiles',
    'Admins update any profile',
    'Administrativo update any profile',
    'Auditor read profiles',
    'Ventas read profiles',
    'Admins can manage all roles',
    'Only admins can modify roles',
    'Only admins can update roles',
    'Only admins can delete roles',
    'Auditor read user_roles'
  ];
  v_expected text[] := ARRAY[
    'Staff can view org profiles',
    'Auditor read org profiles',
    'Ventas read org profiles',
    'Admins update org profiles',
    'Administrativo update org profiles',
    'Admins insert org roles',
    'Admins update org roles',
    'Admins delete org roles',
    'Admins read org roles',
    'Auditor read org user_roles'
  ];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_legacy LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('profiles', 'user_roles')
        AND policyname = v_name
    ) THEN
      RAISE EXCEPTION
        'CADENA 0025: la policy global "%" sigue viva; 0025 no está aplicada o fue revertida',
        v_name;
    END IF;
  END LOOP;

  FOREACH v_name IN ARRAY v_expected LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('profiles', 'user_roles')
        AND policyname = v_name
    ) THEN
      RAISE EXCEPTION 'CADENA 0025: falta la policy acotada por organización "%"', v_name;
    END IF;
  END LOOP;

  -- Helpers que 0026 necesita en tiempo de ejecución.
  IF to_regprocedure('public.is_internal_member(uuid)') IS NULL
     OR to_regprocedure('public.user_in_current_organization(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'CADENA 0025: faltan is_internal_member/user_in_current_organization; 0026 fallaría en la ruta autenticada';
  END IF;

  RAISE NOTICE 'CADENA 0025: policies y helpers OK';
END $$;

-- =====================================================================
-- 2. 0026 aplicada: grants exactos de ambas firmas
-- =====================================================================
DO $$
DECLARE
  v_strict oid := to_regprocedure('public.assign_stamped_rep_number(uuid, text, uuid)');
  v_legacy oid := to_regprocedure('public.assign_stamped_rep_number(uuid, text)');
BEGIN
  IF v_strict IS NULL THEN
    RAISE EXCEPTION 'CADENA 0026: falta la firma estricta de tres parámetros';
  END IF;

  IF NOT has_function_privilege('authenticated', v_strict, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_strict, 'EXECUTE') THEN
    RAISE EXCEPTION
      'CADENA 0026: la firma estricta debe ser ejecutable por authenticated y service_role';
  END IF;

  IF v_legacy IS NOT NULL THEN
    IF has_function_privilege('authenticated', v_legacy, 'EXECUTE') THEN
      RAISE EXCEPTION
        'CADENA 0026: el wrapper de dos parámetros NO debe ser ejecutable por authenticated';
    END IF;
    IF NOT has_function_privilege('service_role', v_legacy, 'EXECUTE') THEN
      RAISE EXCEPTION
        'CADENA 0026: el wrapper de dos parámetros debe seguir disponible para service_role';
    END IF;
  END IF;

  RAISE NOTICE 'CADENA 0026: grants OK';
END $$;

-- =====================================================================
-- 3. Escenario sintético: 2 organizaciones, 4 internos, 1 portal residual
-- =====================================================================
DO $$
DECLARE
  v_org_a   uuid := 'ac000000-0000-4000-8000-0000000000a0';
  v_org_b   uuid := 'ac000000-0000-4000-8000-0000000000b0';
  v_admin_a uuid := 'ac000000-0000-4000-8000-0000000000a1';
  v_staff_a uuid := 'ac000000-0000-4000-8000-0000000000a2';
  v_admin_b uuid := 'ac000000-0000-4000-8000-0000000000b1';
  v_staff_b uuid := 'ac000000-0000-4000-8000-0000000000b2';
  v_portal  uuid := 'ac000000-0000-4000-8000-0000000000a3';
  v_huerf   uuid := 'ac000000-0000-4000-8000-0000000000a4';
  v_cust_a  uuid := 'ac000000-0000-4000-8000-0000000000c1';
  v_cust_b  uuid := 'ac000000-0000-4000-8000-0000000000c2';
  v_inv_a   uuid := 'ac000000-0000-4000-8000-0000000000d1';
  v_inv_b   uuid := 'ac000000-0000-4000-8000-0000000000d2';
BEGIN
  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_a, 'Cadena Org A', 'cadena-org-a');

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_b, 'Cadena Org B', 'cadena-org-b');

  INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
    (v_admin_a, 'cadena-admin-a@rls.test', now(), now()),
    (v_staff_a, 'cadena-staff-a@rls.test', now(), now()),
    (v_admin_b, 'cadena-admin-b@rls.test', now(), now()),
    (v_staff_b, 'cadena-staff-b@rls.test', now(), now()),
    (v_portal,  'cadena-portal-a@rls.test', now(), now()),
    (v_huerf,   'cadena-sin-membresia@rls.test', now(), now());

  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
    (v_org_a, v_admin_a, 'internal'),
    (v_org_a, v_staff_a, 'internal'),
    (v_org_b, v_admin_b, 'internal'),
    (v_org_b, v_staff_b, 'internal');

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.profiles (user_id, full_name, is_active) VALUES
    (v_admin_a, 'Cadena Admin A', true),
    (v_staff_a, 'Cadena Staff A', true),
    (v_portal,  'Cadena Portal A', true)
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.profiles (user_id, full_name, is_active) VALUES
    (v_admin_b, 'Cadena Admin B', true),
    (v_staff_b, 'Cadena Staff B', true)
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- La cuenta de portal conserva un rol OPERATIVO residual ('administrativo'):
  -- es el caso real observado en producción.
  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin_a, 'admin'::public.app_role),
    (v_staff_a, 'dispatcher'::public.app_role),
    (v_admin_b, 'admin'::public.app_role),
    (v_staff_b, 'dispatcher'::public.app_role),
    (v_portal,  'administrativo'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Clientes, facturas y pagos por organización.
  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.customers (id, name) VALUES (v_cust_a, 'Cadena Cliente A');
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_a, v_cust_a) ON CONFLICT DO NOTHING;

  INSERT INTO public.customer_portal_accounts
    (organization_id, customer_id, auth_user_id, email, status)
  VALUES (v_org_a, v_cust_a, v_portal, 'cadena-portal-a@rls.test', 'active');

  INSERT INTO public.invoices (
    id, invoice_number, customer_id, customer_name,
    subtotal, tax_amount, total, status, line_items
  ) VALUES (
    v_inv_a, 'FAC-CAD-A', v_cust_a, 'Cadena Cliente A',
    1000, 0, 1000, 'sent',
    '[{"description":"Renta A","quantity":1,"unit_price":1000,"amount":1000}]'::jsonb
  );

  INSERT INTO public.payments (id, invoice_id, amount) VALUES
    ('ac000000-0000-4000-8000-0000000000e1', v_inv_a, 400),
    ('ac000000-0000-4000-8000-0000000000e3', v_inv_a, 300);

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.customers (id, name) VALUES (v_cust_b, 'Cadena Cliente B');
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_b, v_cust_b) ON CONFLICT DO NOTHING;

  INSERT INTO public.invoices (
    id, invoice_number, customer_id, customer_name,
    subtotal, tax_amount, total, status, line_items
  ) VALUES (
    v_inv_b, 'FAC-CAD-B', v_cust_b, 'Cadena Cliente B',
    900, 0, 900, 'sent',
    '[{"description":"Renta B","quantity":1,"unit_price":900,"amount":900}]'::jsonb
  );

  INSERT INTO public.payments (id, invoice_id, amount)
  VALUES ('ac000000-0000-4000-8000-0000000000e2', v_inv_b, 900);

  PERFORM set_config('app.organization_id', v_org_a::text, true);
END $$;

-- ── 3.a Fail-closed y portal con rol operativo residual ───────────────
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"ac000000-0000-4000-8000-0000000000a4","role":"authenticated"}';

DO $$
BEGIN
  IF public.current_organization_id() IS NOT NULL THEN
    RAISE EXCEPTION
      'CADENA 0025: un usuario sin membresía debe resolver NULL (fail-closed)';
  END IF;
  IF public.is_internal_member(auth.uid()) THEN
    RAISE EXCEPTION 'CADENA 0025: un usuario sin membresía no es miembro interno';
  END IF;
END $$;

SET LOCAL request.jwt.claims TO
  '{"sub":"ac000000-0000-4000-8000-0000000000a3","role":"authenticated"}';

DO $$
BEGIN
  IF public.is_internal_member(auth.uid()) THEN
    RAISE EXCEPTION
      'CADENA 0025: la cuenta de portal con rol operativo residual no debe contar como interna';
  END IF;
  IF public.is_ops_staff() THEN
    RAISE EXCEPTION
      'CADENA 0025: la cuenta de portal con rol operativo residual no debe pasar como personal operativo';
  END IF;
END $$;

-- ── 3.b Folio REP: cruce con SQLSTATE exacto y flujo válido ───────────
DO $$
DECLARE
  v_state text;
BEGIN
  -- El portal residual tiene rol 'administrativo', pero no es interno: 42501.
  v_state := NULL;
  BEGIN
    PERFORM public.assign_stamped_rep_number(
      'ac000000-0000-4000-8000-0000000000e1'::uuid, '11',
      public.current_organization_id()
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION
      'CADENA 0026: el portal residual obtuvo % (esperado 42501)', coalesce(v_state, '<sin error>');
  END IF;
END $$;

SET LOCAL request.jwt.claims TO
  '{"sub":"ac000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_org_a uuid := public.current_organization_id();
  v_org_b uuid := 'ac000000-0000-4000-8000-0000000000b0';
  v_pay_a uuid := 'ac000000-0000-4000-8000-0000000000e1';
  v_pay_b uuid := 'ac000000-0000-4000-8000-0000000000e2';
  v_state text;
  v_result text;
BEGIN
  IF v_org_a <> 'ac000000-0000-4000-8000-0000000000a0'::uuid THEN
    RAISE EXCEPTION 'CONTEXTO: el admin interno debe resolver la organización A';
  END IF;

  -- Cruce A → pago de B, con la organización de B y con NULL: 42501 exacto.
  v_state := NULL;
  BEGIN
    PERFORM public.assign_stamped_rep_number(v_pay_b, '21', v_org_b);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION
      'CADENA 0026: cruce con organización de B obtuvo % (esperado 42501)',
      coalesce(v_state, '<sin error>');
  END IF;

  v_state := NULL;
  BEGIN
    PERFORM public.assign_stamped_rep_number(v_pay_b, '22', NULL::uuid);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION
      'CADENA 0026: cruce con NULL obtuvo % (esperado 42501)',
      coalesce(v_state, '<sin error>');
  END IF;

  -- Flujo válido dentro de A + idempotencia.
  v_result := public.assign_stamped_rep_number(v_pay_a, '31', v_org_a);
  IF v_result <> 'CP-0031' THEN
    RAISE EXCEPTION 'CADENA 0026: flujo válido devolvió % (esperado CP-0031)', v_result;
  END IF;
  IF public.assign_stamped_rep_number(v_pay_a, '31', v_org_a) <> 'CP-0031' THEN
    RAISE EXCEPTION 'CADENA 0026: la reasignación del mismo folio debe ser idempotente';
  END IF;
END $$;

-- ── 3.c Reconciliación por service_role (canal interno, idempotente) ──
RESET request.jwt.claims;
SET LOCAL role = 'service_role';

DO $$
DECLARE
  v_pay_c uuid := 'ac000000-0000-4000-8000-0000000000e3';
BEGIN
  IF public.assign_stamped_rep_number(v_pay_c, '32') <> 'CP-0032' THEN
    RAISE EXCEPTION 'CADENA 0026: service_role no pudo reconciliar el folio pendiente';
  END IF;
  IF public.assign_stamped_rep_number(v_pay_c, '32') <> 'CP-0032' THEN
    RAISE EXCEPTION 'CADENA 0026: la reconciliación de service_role debe ser idempotente';
  END IF;
END $$;

RESET role;
RESET request.jwt.claims;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE id = 'ac000000-0000-4000-8000-0000000000e2'
      AND (rep_number IS NOT NULL OR rep_folio IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'CADENA 0026: el pago de B fue mutado por un caller de A';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE id = 'ac000000-0000-4000-8000-0000000000e1' AND rep_number = 'CP-0031'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE id = 'ac000000-0000-4000-8000-0000000000e3' AND rep_number = 'CP-0032'
  ) THEN
    RAISE EXCEPTION 'CADENA 0026: los pagos de A no quedaron con su folio';
  END IF;

  RAISE NOTICE 'CADENA 0026: comportamiento A/B y reconciliación OK';
END $$;

-- =====================================================================
-- 4. Guard de la brecha: 0026 sin 0025 rompe la ruta autenticada
-- =====================================================================
-- Se simula el estado actual de producción (0026 aplicada, 0025 ausente)
-- eliminando el helper dentro de un SAVEPOINT. La llamada autenticada debe
-- fallar con 42883 (función inexistente). Todo se revierte enseguida.
SAVEPOINT sin_0025;

DROP FUNCTION public.is_internal_member(uuid) CASCADE;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"ac000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_state text;
BEGIN
  v_state := NULL;
  BEGIN
    PERFORM public.assign_stamped_rep_number(
      'ac000000-0000-4000-8000-0000000000e3'::uuid, '41',
      'ac000000-0000-4000-8000-0000000000a0'::uuid
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42883' THEN
    RAISE EXCEPTION
      'CADENA 0025→0026: se esperaba 42883 (helper ausente) y se obtuvo %',
      coalesce(v_state, '<sin error>');
  END IF;

  RAISE NOTICE
    'CADENA 0025→0026: confirmada la brecha; aplicar 0026 sin 0025 rompe el caller autenticado';
END $$;

RESET role;
RESET request.jwt.claims;
ROLLBACK TO SAVEPOINT sin_0025;

DO $$
BEGIN
  IF to_regprocedure('public.is_internal_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'CADENA: el savepoint no restauró is_internal_member';
  END IF;
  RAISE NOTICE 'CADENA 0024→0026: OK';
END $$;

ROLLBACK;
