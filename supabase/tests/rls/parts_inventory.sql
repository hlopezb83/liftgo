-- RLS: parts_inventory — inventario de refacciones.
-- Estado esperado tras la consolidación de policies (v7.299.0):
--   lectura : admin, administrativo, auditor, dispatcher, mechanic (is_inventory_reader)
--   escritura: admin, administrativo, mechanic (is_parts_writer)
--   ventas, customer y anon: sin acceso.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('f1111111-1111-4111-8111-111111111101', 'mecanico.pi@test.local', now(), now()),
  ('f1111111-1111-4111-8111-111111111102', 'dispatcher.pi@test.local', now(), now()),
  ('f1111111-1111-4111-8111-111111111103', 'auditor.pi@test.local', now(), now()),
  ('f1111111-1111-4111-8111-111111111104', 'ventas.pi@test.local', now(), now()),
  ('f1111111-1111-4111-8111-111111111105', 'cliente.pi@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('f1111111-1111-4111-8111-111111111101', 'mechanic'),
  ('f1111111-1111-4111-8111-111111111102', 'dispatcher'),
  ('f1111111-1111-4111-8111-111111111103', 'auditor'),
  ('f1111111-1111-4111-8111-111111111104', 'ventas'),
  ('f1111111-1111-4111-8111-111111111105', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.parts_inventory (id, name, sku, category, stock_quantity, unit_cost) VALUES
  ('f1111111-1111-4111-8111-1111111111a1', 'Filtro RLS', 'SKU-RLS-1', 'Filtros', 10, 250);

-- 1) anon: sin acceso al inventario.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.parts_inventory) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee parts_inventory';
  END IF;
  RAISE NOTICE 'OK: anon sin acceso a parts_inventory';
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: el inventario no es suyo.
SET LOCAL request.jwt.claims TO '{"sub":"f1111111-1111-4111-8111-111111111105","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.parts_inventory) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee parts_inventory';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a parts_inventory';
END $$;

-- 3) Ventas: fuera del set de lectores de inventario.
SET LOCAL request.jwt.claims TO '{"sub":"f1111111-1111-4111-8111-111111111104","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.parts_inventory) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas lee parts_inventory';
  END IF;
  RAISE NOTICE 'OK: ventas sin acceso a parts_inventory';
END $$;

-- 4) Dispatcher: lectura sí, escritura no.
SET LOCAL request.jwt.claims TO '{"sub":"f1111111-1111-4111-8111-111111111102","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.parts_inventory) < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: dispatcher deberia leer parts_inventory';
  END IF;

  BEGIN
    UPDATE public.parts_inventory SET stock_quantity = 0
     WHERE id = 'f1111111-1111-4111-8111-1111111111a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: dispatcher modifico el stock';
  END IF;
  RAISE NOTICE 'OK: dispatcher es de solo lectura en parts_inventory';
END $$;

-- 5) Auditor: lectura sí, borrado no.
SET LOCAL request.jwt.claims TO '{"sub":"f1111111-1111-4111-8111-111111111103","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.parts_inventory) < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: auditor deberia leer parts_inventory';
  END IF;

  BEGIN
    DELETE FROM public.parts_inventory
     WHERE id = 'f1111111-1111-4111-8111-1111111111a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: auditor borro una refaccion';
  END IF;
  RAISE NOTICE 'OK: auditor es de solo lectura en parts_inventory';
END $$;

-- 6) Mecánico: lectura y escritura (es su módulo).
SET LOCAL request.jwt.claims TO '{"sub":"f1111111-1111-4111-8111-111111111101","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.parts_inventory) < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: mecanico deberia leer parts_inventory';
  END IF;

  INSERT INTO public.parts_inventory (name, sku, category, stock_quantity, unit_cost)
  VALUES ('Balata RLS', 'SKU-RLS-2', 'Frenos', 4, 900);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: mecanico deberia poder dar de alta refacciones';
  END IF;

  UPDATE public.parts_inventory SET stock_quantity = 9
   WHERE id = 'f1111111-1111-4111-8111-1111111111a1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: mecanico deberia poder ajustar el stock';
  END IF;
  RAISE NOTICE 'OK: mecanico administra parts_inventory';
END $$;

-- 7) service_role: bypass total de RLS.
RESET ROLE;
SET LOCAL role = 'service_role';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.parts_inventory) < 2 THEN
    RAISE EXCEPTION 'RLS ROTA: service_role deberia ver todo el inventario';
  END IF;
  RAISE NOTICE 'OK: service_role ve todo parts_inventory';
END $$;

RESET ROLE;
ROLLBACK;
