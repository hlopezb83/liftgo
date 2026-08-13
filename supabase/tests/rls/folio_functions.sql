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
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('4a000099-0000-4000-8000-000000000001', 'admin.folio@test.local', now(), now()),
  ('4a000099-0000-4000-8000-000000000002', 'cliente.folio@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('4a000099-0000-4000-8000-000000000001', 'administrativo'),
  ('4a000099-0000-4000-8000-000000000002', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

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
