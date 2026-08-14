-- RLS: status_logs — bitácora de estatus de flota. Admin full; mecánico solo
-- lectura (escribe vía la RPC change_forklift_status, SECURITY DEFINER);
-- dispatcher/administrativo leen y registran; ventas SOLO registra (no lee);
-- cliente del portal y anon sin acceso.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('50000004-0000-4000-8000-000000000001', 'mecanico.sl@test.local', now(), now()),
  ('50000004-0000-4000-8000-000000000002', 'ventas.sl@test.local', now(), now()),
  ('50000004-0000-4000-8000-000000000003', 'dispatcher.sl@test.local', now(), now()),
  ('50000004-0000-4000-8000-000000000004', 'cliente.sl@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('50000004-0000-4000-8000-000000000001', 'mechanic'),
  ('50000004-0000-4000-8000-000000000002', 'ventas'),
  ('50000004-0000-4000-8000-000000000003', 'dispatcher'),
  ('50000004-0000-4000-8000-000000000004', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.forklifts (id, name, model) VALUES
  ('50000004-0000-4000-8000-0000000000f1', 'MC-SL-1', 'Modelo SL');

INSERT INTO public.status_logs (id, forklift_id, from_status, to_status) VALUES
  ('50000004-0000-4000-8000-0000000000a1', '50000004-0000-4000-8000-0000000000f1',
   'available', 'maintenance');

-- 1) anon: sin acceso.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.status_logs) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee status_logs';
  END IF;
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: sin acceso a la bitácora interna.
SET LOCAL request.jwt.claims TO '{"sub":"50000004-0000-4000-8000-000000000004","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.status_logs) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee status_logs';
  END IF;

  BEGIN
    INSERT INTO public.status_logs (forklift_id, to_status)
    VALUES ('50000004-0000-4000-8000-0000000000f1', 'available');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal escribio en status_logs';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a status_logs';
END $$;

-- 3) Ventas: puede registrar un cambio, pero NO leer la bitácora.
SET LOCAL request.jwt.claims TO '{"sub":"50000004-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.status_logs) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas lee status_logs (no tiene policy SELECT)';
  END IF;

  INSERT INTO public.status_logs (forklift_id, to_status)
  VALUES ('50000004-0000-4000-8000-0000000000f1', 'rented');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia poder registrar en status_logs';
  END IF;
  RAISE NOTICE 'OK: ventas escribe pero no lee status_logs';
END $$;

-- 4) Dispatcher: lee y registra, pero no borra (solo admin/mecánico tienen ALL).
SET LOCAL request.jwt.claims TO '{"sub":"50000004-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.status_logs
       WHERE id = '50000004-0000-4000-8000-0000000000a1') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: dispatcher deberia leer status_logs';
  END IF;

  BEGIN
    DELETE FROM public.status_logs WHERE id = '50000004-0000-4000-8000-0000000000a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: dispatcher borro la bitacora de estatus';
  END IF;
  RAISE NOTICE 'OK: dispatcher no borra status_logs';
END $$;

-- 5) Mecánico: acceso completo.
SET LOCAL request.jwt.claims TO '{"sub":"50000004-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.status_logs
       WHERE id = '50000004-0000-4000-8000-0000000000a1') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: mecanico deberia leer status_logs';
  END IF;
  RAISE NOTICE 'OK: mecanico lee status_logs';
END $$;

ROLLBACK;
