-- Folios (v7.300.1): regresión del bug DB_PERMISSION_DENIED al registrar una
-- factura de proveedor.
--
-- Contexto: la v7.294.0 revocó EXECUTE a `authenticated` en TODAS las funciones
-- de folio. Tres de ellas se llaman desde la sesión del usuario (RPC directo) y
-- tres triggers las invocaban sin SECURITY DEFINER → "permission denied for
-- function next_supplier_bill_number".
--
-- Esta suite fija el contrato:
--   1) staff puede pedir folio de proveedor / contrato / cotización
--   2) cliente del portal recibe acceso denegado
--   3) anon no tiene EXECUTE
--   4) insertar en supplier_bills / deliveries / return_inspections como staff
--      asigna folio automáticamente (trigger SECURITY DEFINER)
--
-- Multiempresa (0043): los folios exigen `current_internal_organization_id()`
-- e `is_internal_member()`, así que el staff necesita membresía interna real y
-- el cliente del portal una membresía de portal. El contrato de ejecución no
-- cambia: staff obtiene CXP/CTR/COT, portal bloqueado, anon sin EXECUTE.
BEGIN;

DO $$
DECLARE
  v_org uuid := '4a000099-0000-4000-8000-0000000000f0';
  v_staff uuid := '4a000099-0000-4000-8000-000000000001';
  v_portal uuid := '4a000099-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO public.organizations (id, name, slug, is_active)
  VALUES (v_org, 'Organización folios de prueba', 'rls-folio-functions', true);

  PERFORM set_config('app.organization_id', v_org::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
    (v_staff, 'admin.folio@test.local', now(), now()),
    (v_portal, 'cliente.folio@test.local', now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_staff, 'administrativo'::public.app_role),
    (v_portal, 'customer'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.organization_memberships (
    organization_id, auth_user_id, member_type
  ) VALUES
    (v_org, v_staff, 'internal'),
    (v_org, v_portal, 'portal');
END $$;

-- 1) anon: sin EXECUTE en las funciones de folio expuestas.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.next_supplier_bill_number()',
    'public.next_contract_number()',
    'public.next_quote_number()'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'BREACH: anon puede ejecutar %', fn;
    END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'REGRESION v7.294.0: authenticated no puede ejecutar % (esto rompe la app)', fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK: folios ejecutables por authenticated y no por anon';
END $$;

-- 2) Staff (administrativo): obtiene folio de las tres funciones.
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"4a000099-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v text;
BEGIN
  v := public.next_supplier_bill_number();
  IF v NOT LIKE 'CXP-%' THEN RAISE EXCEPTION 'folio proveedor invalido: %', v; END IF;
  v := public.next_contract_number();
  IF v NOT LIKE 'CTR-%' THEN RAISE EXCEPTION 'folio contrato invalido: %', v; END IF;
  v := public.next_quote_number();
  IF v NOT LIKE 'COT-%' THEN RAISE EXCEPTION 'folio cotizacion invalido: %', v; END IF;
  RAISE NOTICE 'OK: staff obtiene folios CXP/CTR/COT';
END $$;

-- 3) Cliente del portal: acceso denegado en las tres.
SET LOCAL request.jwt.claims TO '{"sub":"4a000099-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean;
BEGIN
  v_blocked := false;
  BEGIN PERFORM public.next_supplier_bill_number();
  EXCEPTION WHEN others THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'BREACH: cliente del portal obtuvo folio de proveedor'; END IF;

  v_blocked := false;
  BEGIN PERFORM public.next_contract_number();
  EXCEPTION WHEN others THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'BREACH: cliente del portal obtuvo folio de contrato'; END IF;

  v_blocked := false;
  BEGIN PERFORM public.next_quote_number();
  EXCEPTION WHEN others THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'BREACH: cliente del portal obtuvo folio de cotizacion'; END IF;

  RAISE NOTICE 'OK: cliente del portal bloqueado en las 3 funciones de folio';
END $$;

-- 4) Los triggers de folio son SECURITY DEFINER (si no, el INSERT del usuario
--    hereda la falta de permiso — bug original).
RESET ROLE;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, p.prosecdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('set_supplier_bill_number','set_delivery_number','set_inspection_number')
  LOOP
    IF NOT r.prosecdef THEN
      RAISE EXCEPTION 'REGRESION: %() no es SECURITY DEFINER — los INSERT de staff fallaran', r.proname;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK: triggers de folio con SECURITY DEFINER';
END $$;

ROLLBACK;
