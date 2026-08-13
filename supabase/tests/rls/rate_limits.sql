-- RLS: rate_limits — tabla de control de abuso. NADIE la toca desde el cliente
-- (policy "No client access": USING false / WITH CHECK false, para anon y
-- authenticated, incluido admin). Solo el service_role la usa vía
-- check_and_record_rate_limit (SECURITY DEFINER).
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('4a000011-0000-4000-8000-000000000001', 'admin.rl@test.local', now(), now()),
  ('4a000011-0000-4000-8000-000000000002', 'cliente.rl@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('4a000011-0000-4000-8000-000000000001', 'admin'),
  ('4a000011-0000-4000-8000-000000000002', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.rate_limits (bucket, identifier) VALUES
  ('rls-test-bucket', 'rls-test-identifier');

-- 1) anon: ni lee ni escribe.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.rate_limits) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee rate_limits';
  END IF;

  BEGIN
    INSERT INTO public.rate_limits (bucket, identifier) VALUES ('hack', 'anon');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: anon escribio en rate_limits';
  END IF;
  RAISE NOTICE 'OK: anon sin acceso a rate_limits';
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: sin acceso (no puede borrar su propio contador).
SET LOCAL request.jwt.claims TO '{"sub":"4a000011-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.rate_limits) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee rate_limits';
  END IF;

  BEGIN
    DELETE FROM public.rate_limits WHERE bucket = 'rls-test-bucket';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: el cliente borro su contador de rate limit';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a rate_limits';
END $$;

-- 3) Admin: tampoco tiene acceso — la tabla es exclusivamente de servidor.
SET LOCAL request.jwt.claims TO '{"sub":"4a000011-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.rate_limits) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: admin lee rate_limits desde el cliente';
  END IF;

  BEGIN
    INSERT INTO public.rate_limits (bucket, identifier) VALUES ('admin', 'admin');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: admin escribio en rate_limits desde el cliente';
  END IF;
  RAISE NOTICE 'OK: ni el admin toca rate_limits desde el cliente';
END $$;

-- 4) service_role: sí administra los contadores (bypass de RLS).
RESET ROLE;
SET LOCAL role = 'service_role';
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.rate_limits WHERE bucket = 'rls-test-bucket') <> 1 THEN
    RAISE EXCEPTION 'ROTO: service_role deberia ver los contadores de rate_limits';
  END IF;
  RAISE NOTICE 'OK: service_role administra rate_limits';
END $$;

ROLLBACK;
