-- RLS: profiles — nadie se auto-reactiva ni cambia su email; ventas no toca perfiles ajenos.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('44444444-0000-4000-8000-000000000001', 'ventas.prof@test.local', now(), now()),
  ('44444444-0000-4000-8000-000000000002', 'mecanico.prof@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('44444444-0000-4000-8000-000000000001', 'ventas'),
  ('44444444-0000-4000-8000-000000000002', 'mechanic')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, email, is_active) VALUES
  ('44444444-0000-4000-8000-000000000001', 'ventas.prof@test.local', false),
  ('44444444-0000-4000-8000-000000000002', 'mecanico.prof@test.local', true);

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"44444444-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  -- 1) No puede auto-reactivarse (usuario desactivado por un admin).
  BEGIN
    UPDATE public.profiles SET is_active = true
     WHERE user_id = '44444444-0000-4000-8000-000000000001';
    IF EXISTS (SELECT 1 FROM public.profiles
                WHERE user_id = '44444444-0000-4000-8000-000000000001' AND is_active) THEN
      RAISE EXCEPTION 'RLS BREACH: usuario se auto-reactivó';
    END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'OK: auto-reactivación bloqueada';
  END;

  -- 2) No puede cambiar su email (suplantación).
  BEGIN
    UPDATE public.profiles SET email = 'admin@test.local'
     WHERE user_id = '44444444-0000-4000-8000-000000000001';
    IF EXISTS (SELECT 1 FROM public.profiles
                WHERE user_id = '44444444-0000-4000-8000-000000000001'
                  AND email = 'admin@test.local') THEN
      RAISE EXCEPTION 'RLS BREACH: usuario cambió su email';
    END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'OK: cambio de email bloqueado';
  END;

  -- 3) No puede editar el perfil de otro usuario.
  BEGIN
    UPDATE public.profiles SET full_name = 'Suplantado'
     WHERE user_id = '44444444-0000-4000-8000-000000000002';
    IF EXISTS (SELECT 1 FROM public.profiles
                WHERE user_id = '44444444-0000-4000-8000-000000000002'
                  AND full_name = 'Suplantado') THEN
      RAISE EXCEPTION 'RLS BREACH: ventas editó un perfil ajeno';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: perfil ajeno protegido';
  END;
END $$;

-- 4) anon: sin GRANT ni policy sobre profiles (endurecimiento v7.302.5).
RESET ROLE;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
DECLARE
  v_count integer;
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.profiles;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'RLS BREACH: anon lee profiles';
    END IF;
    RAISE NOTICE 'OK: anon sin filas en profiles';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: anon sin GRANT sobre profiles';
  END;

  BEGIN
    INSERT INTO public.profiles (user_id, email)
    VALUES ('44444444-0000-4000-8000-00000000000a', 'anon@test.local');
    RAISE EXCEPTION 'RLS BREACH: anon insertó en profiles';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: insert de anon bloqueado';
  END;
END $$;

-- 5) authenticated no conserva DELETE sobre profiles (solo service_role borra).
RESET ROLE;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"44444444-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    DELETE FROM public.profiles WHERE user_id = '44444444-0000-4000-8000-000000000002';
    IF NOT EXISTS (SELECT 1 FROM public.profiles
                    WHERE user_id = '44444444-0000-4000-8000-000000000002') THEN
      RAISE EXCEPTION 'RLS BREACH: usuario borró su propio profile';
    END IF;
    RAISE NOTICE 'OK: delete sin efecto (sin policy)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: delete de profiles denegado a authenticated';
  END;
END $$;

RESET ROLE;
ROLLBACK;

