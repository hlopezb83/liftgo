-- RLS: booking_extensions — extensiones de renta. Admin/administrativo/dispatcher full;
-- ventas/mecánico/auditor solo lectura; el cliente del portal SOLO ve las extensiones
-- de sus propias rentas y no puede crearlas; anon sin acceso.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('be000008-0000-4000-8000-000000000001', 'dispatcher.be@test.local', now(), now()),
  ('be000008-0000-4000-8000-000000000002', 'ventas.be@test.local', now(), now()),
  ('be000008-0000-4000-8000-000000000003', 'clientea.be@test.local', now(), now()),
  ('be000008-0000-4000-8000-000000000004', 'clienteb.be@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('be000008-0000-4000-8000-000000000001', 'dispatcher'),
  ('be000008-0000-4000-8000-000000000002', 'ventas'),
  ('be000008-0000-4000-8000-000000000003', 'customer'),
  ('be000008-0000-4000-8000-000000000004', 'customer')
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, name, user_id) VALUES
  ('be000008-0000-4000-8000-0000000000c1', 'Cliente A BE', 'be000008-0000-4000-8000-000000000003'),
  ('be000008-0000-4000-8000-0000000000c2', 'Cliente B BE', 'be000008-0000-4000-8000-000000000004');

INSERT INTO public.forklifts (id, name, model) VALUES
  ('be000008-0000-4000-8000-0000000000f1', 'MC-BE-1', 'Modelo BE'),
  ('be000008-0000-4000-8000-0000000000f2', 'MC-BE-2', 'Modelo BE');

INSERT INTO public.bookings (id, forklift_id, customer_id, start_date, end_date) VALUES
  ('be000008-0000-4000-8000-0000000000a1', 'be000008-0000-4000-8000-0000000000f1',
   'be000008-0000-4000-8000-0000000000c1', public.today_mty(), public.today_mty() + 10),
  ('be000008-0000-4000-8000-0000000000a2', 'be000008-0000-4000-8000-0000000000f2',
   'be000008-0000-4000-8000-0000000000c2', public.today_mty(), public.today_mty() + 10);

INSERT INTO public.booking_extensions (id, booking_id, original_end_date, new_end_date) VALUES
  ('be000008-0000-4000-8000-0000000000e1', 'be000008-0000-4000-8000-0000000000a1',
   public.today_mty() + 10, public.today_mty() + 20),
  ('be000008-0000-4000-8000-0000000000e2', 'be000008-0000-4000-8000-0000000000a2',
   public.today_mty() + 10, public.today_mty() + 20);

-- 1) anon: sin acceso.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.booking_extensions) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee booking_extensions';
  END IF;
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente A: solo las extensiones de sus rentas, y no puede crearlas.
SET LOCAL request.jwt.claims TO '{"sub":"be000008-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.booking_extensions) <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente A ve % extensiones (esperado 1)',
      (SELECT COUNT(*) FROM public.booking_extensions);
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_extensions
              WHERE id = 'be000008-0000-4000-8000-0000000000e2') THEN
    RAISE EXCEPTION 'RLS BREACH: cliente A ve la extension del cliente B';
  END IF;

  BEGIN
    INSERT INTO public.booking_extensions (booking_id, original_end_date, new_end_date)
    VALUES ('be000008-0000-4000-8000-0000000000a1',
            public.today_mty() + 20, public.today_mty() + 90);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: el cliente del portal se auto-extendio la renta';
  END IF;
  RAISE NOTICE 'OK: cliente del portal solo lee sus propias extensiones';
END $$;

-- 3) Ventas: lee todo pero no escribe.
SET LOCAL request.jwt.claims TO '{"sub":"be000008-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.booking_extensions) < 2 THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia leer todas las extensiones';
  END IF;

  BEGIN
    UPDATE public.booking_extensions SET new_end_date = public.today_mty() + 365
     WHERE id = 'be000008-0000-4000-8000-0000000000e1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas pudo modificar una extension';
  END IF;
  RAISE NOTICE 'OK: ventas es de solo lectura en booking_extensions';
END $$;

-- 4) Dispatcher: acceso completo.
SET LOCAL request.jwt.claims TO '{"sub":"be000008-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  INSERT INTO public.booking_extensions (booking_id, original_end_date, new_end_date, reason)
  VALUES ('be000008-0000-4000-8000-0000000000a1',
          public.today_mty() + 20, public.today_mty() + 25, 'Extension operativa');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: dispatcher deberia poder registrar extensiones';
  END IF;
  RAISE NOTICE 'OK: dispatcher administra booking_extensions';
END $$;

ROLLBACK;
