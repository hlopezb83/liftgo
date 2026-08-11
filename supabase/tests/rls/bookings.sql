-- RLS: bookings — anon sin acceso; cliente del portal solo sus rentas;
-- ventas/mecánico/auditor solo lectura; dispatcher/administrativo/admin escriben.
-- Además: INSERT directo solo lo permite un admin (guard_booking_insert_admin).
-- Convención: chequeo de BREACH fuera del handler (ver invoices.sql).
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('b0000001-0000-4000-8000-000000000001', 'ventas.bk@test.local', now(), now()),
  ('b0000001-0000-4000-8000-000000000002', 'dispatcher.bk@test.local', now(), now()),
  ('b0000001-0000-4000-8000-000000000003', 'clientea.bk@test.local', now(), now()),
  ('b0000001-0000-4000-8000-000000000004', 'clienteb.bk@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('b0000001-0000-4000-8000-000000000001', 'ventas'),
  ('b0000001-0000-4000-8000-000000000002', 'dispatcher'),
  ('b0000001-0000-4000-8000-000000000003', 'customer'),
  ('b0000001-0000-4000-8000-000000000004', 'customer')
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, name, user_id) VALUES
  ('b0000001-0000-4000-8000-0000000000c1', 'Cliente A BK', 'b0000001-0000-4000-8000-000000000003'),
  ('b0000001-0000-4000-8000-0000000000c2', 'Cliente B BK', 'b0000001-0000-4000-8000-000000000004');

INSERT INTO public.forklifts (id, name, model) VALUES
  ('b0000001-0000-4000-8000-0000000000f1', 'MC-BK-1', 'Modelo BK'),
  ('b0000001-0000-4000-8000-0000000000f2', 'MC-BK-2', 'Modelo BK');

INSERT INTO public.bookings (id, forklift_id, customer_id, start_date, end_date) VALUES
  ('b0000001-0000-4000-8000-0000000000a1', 'b0000001-0000-4000-8000-0000000000f1',
   'b0000001-0000-4000-8000-0000000000c1', public.today_mty(), public.today_mty() + 30),
  ('b0000001-0000-4000-8000-0000000000a2', 'b0000001-0000-4000-8000-0000000000f2',
   'b0000001-0000-4000-8000-0000000000c2', public.today_mty(), public.today_mty() + 30);

-- 1) anon: sin sesión no ve nada.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.bookings) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee bookings';
  END IF;
  RAISE NOTICE 'OK: anon no lee bookings';
END $$;

RESET ROLE;

-- 2) Cliente A del portal: solo su renta, y no puede crear ni modificar.
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"b0000001-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE v_rows int; v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.bookings) <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente A ve % reservas (esperado 1)',
      (SELECT COUNT(*) FROM public.bookings);
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings
              WHERE id = 'b0000001-0000-4000-8000-0000000000a2') THEN
    RAISE EXCEPTION 'RLS BREACH: cliente A ve la reserva del cliente B';
  END IF;

  BEGIN
    INSERT INTO public.bookings (forklift_id, customer_id, start_date, end_date)
    VALUES ('b0000001-0000-4000-8000-0000000000f1',
            'b0000001-0000-4000-8000-0000000000c1', public.today_mty(), public.today_mty() + 1);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal pudo crear una reserva';
  END IF;

  BEGIN
    UPDATE public.bookings SET end_date = public.today_mty() + 365
     WHERE id = 'b0000001-0000-4000-8000-0000000000a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal pudo extender su renta';
  END IF;
  RAISE NOTICE 'OK: cliente del portal es de solo lectura y solo ve lo suyo';
END $$;

-- 3) Ventas: lee toda la flota rentada pero no la modifica.
SET LOCAL request.jwt.claims TO '{"sub":"b0000001-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.bookings) < 2 THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia leer todas las reservas';
  END IF;

  BEGIN
    UPDATE public.bookings SET status = 'cancelled'
     WHERE id = 'b0000001-0000-4000-8000-0000000000a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas pudo modificar una reserva';
  END IF;
  RAISE NOTICE 'OK: ventas es de solo lectura en bookings';
END $$;

-- 4) Dispatcher: escribe por policy, pero el INSERT directo sigue reservado a admin.
SET LOCAL request.jwt.claims TO '{"sub":"b0000001-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_rows int; v_blocked boolean := false;
BEGIN
  UPDATE public.bookings SET site_contact_name = 'Contacto RLS'
   WHERE id = 'b0000001-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: dispatcher deberia poder actualizar bookings';
  END IF;

  BEGIN
    INSERT INTO public.bookings (forklift_id, customer_id, start_date, end_date)
    VALUES ('b0000001-0000-4000-8000-0000000000f1',
            'b0000001-0000-4000-8000-0000000000c1', public.today_mty(), public.today_mty() + 1);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'GUARD ROTO: dispatcher creo una reserva por INSERT directo';
  END IF;
  RAISE NOTICE 'OK: dispatcher edita pero no crea reservas por INSERT directo';
END $$;

ROLLBACK;
