-- RLS: maintenance_parts — refacciones consumidas en una orden de mantenimiento.
-- Estado esperado tras la consolidación de policies (v7.299.0):
--   lectura : admin, administrativo, auditor, mechanic (is_maintenance_reader)
--             + cualquiera con permiso de matriz 'Mantenimiento'/'read'.
--   escritura: admin, administrativo, mechanic (is_parts_writer)
--   customer y anon: sin acceso.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('f2222222-2222-4222-8222-222222222201', 'mecanico.mp@test.local', now(), now()),
  ('f2222222-2222-4222-8222-222222222202', 'auditor.mp@test.local', now(), now()),
  ('f2222222-2222-4222-8222-222222222203', 'admin.mp@test.local', now(), now()),
  ('f2222222-2222-4222-8222-222222222204', 'cliente.mp@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('f2222222-2222-4222-8222-222222222201', 'mechanic'),
  ('f2222222-2222-4222-8222-222222222202', 'auditor'),
  ('f2222222-2222-4222-8222-222222222203', 'admin'),
  ('f2222222-2222-4222-8222-222222222204', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.forklifts (id, name, model) VALUES
  ('f2222222-2222-4222-8222-2222222222f1', 'Montacargas MP', 'MP-100');

INSERT INTO public.parts_inventory (id, name, sku, category, stock_quantity, unit_cost) VALUES
  ('f2222222-2222-4222-8222-2222222222a1', 'Aceite RLS', 'SKU-MP-1', 'Lubricantes', 20, 400);

INSERT INTO public.maintenance_logs (id, forklift_id, service_type, description) VALUES
  ('f2222222-2222-4222-8222-2222222222b1', 'f2222222-2222-4222-8222-2222222222f1',
   'preventivo', 'Servicio RLS');

INSERT INTO public.maintenance_parts (id, maintenance_log_id, part_id, quantity_used, cost_at_time) VALUES
  ('f2222222-2222-4222-8222-2222222222c1', 'f2222222-2222-4222-8222-2222222222b1',
   'f2222222-2222-4222-8222-2222222222a1', 2, 400);

-- 1) anon: sin acceso.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.maintenance_parts) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee maintenance_parts';
  END IF;
  RAISE NOTICE 'OK: anon sin acceso a maintenance_parts';
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: el consumo de refacciones es interno.
SET LOCAL request.jwt.claims TO '{"sub":"f2222222-2222-4222-8222-222222222204","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.maintenance_parts) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee maintenance_parts';
  END IF;

  BEGIN
    INSERT INTO public.maintenance_parts (maintenance_log_id, part_id, quantity_used, cost_at_time)
    VALUES ('f2222222-2222-4222-8222-2222222222b1', 'f2222222-2222-4222-8222-2222222222a1', 1, 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal inserto maintenance_parts';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a maintenance_parts';
END $$;

-- 3) Auditor: lectura sí, escritura no.
SET LOCAL request.jwt.claims TO '{"sub":"f2222222-2222-4222-8222-222222222202","role":"authenticated"}';

DO $$
DECLARE v_rows int; v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.maintenance_parts) < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: auditor deberia leer maintenance_parts';
  END IF;

  BEGIN
    INSERT INTO public.maintenance_parts (maintenance_log_id, part_id, quantity_used, cost_at_time)
    VALUES ('f2222222-2222-4222-8222-2222222222b1', 'f2222222-2222-4222-8222-2222222222a1', 5, 5);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: auditor inserto maintenance_parts';
  END IF;

  BEGIN
    DELETE FROM public.maintenance_parts
     WHERE id = 'f2222222-2222-4222-8222-2222222222c1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: auditor borro maintenance_parts';
  END IF;
  RAISE NOTICE 'OK: auditor es de solo lectura en maintenance_parts';
END $$;

-- 4) Mecánico: lectura y escritura completas.
SET LOCAL request.jwt.claims TO '{"sub":"f2222222-2222-4222-8222-222222222201","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.maintenance_parts) < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: mecanico deberia leer maintenance_parts';
  END IF;

  INSERT INTO public.maintenance_parts (maintenance_log_id, part_id, quantity_used, cost_at_time)
  VALUES ('f2222222-2222-4222-8222-2222222222b1', 'f2222222-2222-4222-8222-2222222222a1', 1, 400);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: mecanico deberia poder registrar consumo de refacciones';
  END IF;

  UPDATE public.maintenance_parts SET quantity_used = 3
   WHERE id = 'f2222222-2222-4222-8222-2222222222c1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: mecanico deberia poder corregir el consumo';
  END IF;
  RAISE NOTICE 'OK: mecanico administra maintenance_parts';
END $$;

-- 5) Admin: puede borrar.
SET LOCAL request.jwt.claims TO '{"sub":"f2222222-2222-4222-8222-222222222203","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  DELETE FROM public.maintenance_parts
   WHERE id = 'f2222222-2222-4222-8222-2222222222c1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: admin deberia poder borrar maintenance_parts';
  END IF;
  RAISE NOTICE 'OK: admin borra maintenance_parts';
END $$;

-- 6) service_role: bypass total de RLS.
RESET ROLE;
SET LOCAL role = 'service_role';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.maintenance_parts) < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: service_role deberia ver maintenance_parts';
  END IF;
  RAISE NOTICE 'OK: service_role ve todo maintenance_parts';
END $$;

RESET ROLE;
ROLLBACK;
