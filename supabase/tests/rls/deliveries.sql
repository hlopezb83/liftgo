-- RLS: deliveries — logística es back-office puro: solo admin/administrativo/dispatcher
-- escriben, auditor lee, y ventas/mecánico/cliente/anon no tienen acceso alguno.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('d0000002-0000-4000-8000-000000000001', 'dispatcher.dl@test.local', now(), now()),
  ('d0000002-0000-4000-8000-000000000002', 'ventas.dl@test.local', now(), now()),
  ('d0000002-0000-4000-8000-000000000003', 'auditor.dl@test.local', now(), now()),
  ('d0000002-0000-4000-8000-000000000004', 'cliente.dl@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d0000002-0000-4000-8000-000000000001', 'dispatcher'),
  ('d0000002-0000-4000-8000-000000000002', 'ventas'),
  ('d0000002-0000-4000-8000-000000000003', 'auditor'),
  ('d0000002-0000-4000-8000-000000000004', 'customer')
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, name, user_id) VALUES
  ('d0000002-0000-4000-8000-0000000000c1', 'Cliente DL', 'd0000002-0000-4000-8000-000000000004');

INSERT INTO public.forklifts (id, name, model) VALUES
  ('d0000002-0000-4000-8000-0000000000f1', 'MC-DL-1', 'Modelo DL');

INSERT INTO public.bookings (id, forklift_id, customer_id, start_date, end_date) VALUES
  ('d0000002-0000-4000-8000-0000000000a1', 'd0000002-0000-4000-8000-0000000000f1',
   'd0000002-0000-4000-8000-0000000000c1', public.today_mty(), public.today_mty() + 30);

INSERT INTO public.deliveries (id, booking_id, forklift_id, type, scheduled_date) VALUES
  ('d0000002-0000-4000-8000-0000000000e1', 'd0000002-0000-4000-8000-0000000000a1',
   'd0000002-0000-4000-8000-0000000000f1', 'delivery', public.today_mty() + 1);

-- 1) anon: sin acceso.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.deliveries) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee deliveries';
  END IF;
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: la logística interna no se expone.
SET LOCAL request.jwt.claims TO '{"sub":"d0000002-0000-4000-8000-000000000004","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.deliveries) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee deliveries';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a deliveries';
END $$;

-- 3) Ventas: sin acceso de lectura ni escritura.
SET LOCAL request.jwt.claims TO '{"sub":"d0000002-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.deliveries) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas lee deliveries';
  END IF;

  BEGIN
    INSERT INTO public.deliveries (booking_id, forklift_id, type, scheduled_date)
    VALUES ('d0000002-0000-4000-8000-0000000000a1', 'd0000002-0000-4000-8000-0000000000f1',
            'pickup', public.today_mty() + 2);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: ventas pudo programar una entrega';
  END IF;
  RAISE NOTICE 'OK: ventas sin acceso a deliveries';
END $$;

-- 4) Auditor: lectura sin escritura.
SET LOCAL request.jwt.claims TO '{"sub":"d0000002-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.deliveries
       WHERE id = 'd0000002-0000-4000-8000-0000000000e1') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: auditor deberia leer deliveries';
  END IF;

  BEGIN
    UPDATE public.deliveries SET status = 'cancelled'
     WHERE id = 'd0000002-0000-4000-8000-0000000000e1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: auditor pudo modificar una entrega';
  END IF;
  RAISE NOTICE 'OK: auditor es de solo lectura en deliveries';
END $$;

-- 5) Dispatcher: acceso completo.
SET LOCAL request.jwt.claims TO '{"sub":"d0000002-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  UPDATE public.deliveries SET notes = 'Ruta RLS'
   WHERE id = 'd0000002-0000-4000-8000-0000000000e1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: dispatcher deberia poder actualizar deliveries';
  END IF;
  RAISE NOTICE 'OK: dispatcher administra deliveries';
END $$;

ROLLBACK;
