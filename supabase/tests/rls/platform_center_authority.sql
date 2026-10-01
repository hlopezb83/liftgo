-- Centro de Plataforma: autoridad global independiente de la empresa.
-- Base efímera de CI; toda la suite revierte sus fixtures.
BEGIN;

DO $$
DECLARE v_org uuid;
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'SETUP: falta la organización inicial'; END IF;
  PERFORM set_config('app.organization_id', v_org::text, true);
END $$;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'platform-operator@example.com', now(), now()),
  ('c1000000-0000-4000-8000-000000000002', 'platform-nonoperator@example.com', now(), now());
INSERT INTO public.profiles (user_id, full_name, is_active) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'Operador sin empresa', true),
  ('c1000000-0000-4000-8000-000000000002', 'Admin sin autoridad global', true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;
DELETE FROM public.organization_memberships WHERE auth_user_id IN
  ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002');
DELETE FROM public.user_roles WHERE user_id = 'c1000000-0000-4000-8000-000000000001';
INSERT INTO public.user_roles (user_id, role) VALUES
  ('c1000000-0000-4000-8000-000000000002', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
INSERT INTO public.platform_operators (auth_user_id, notes) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'Fixture explícito de CI');

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$ BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'PLATAFORMA: operador activo sin rol ni membresía no autorizado';
  END IF;
  IF public.current_internal_organization_id() IS NOT NULL THEN
    RAISE EXCEPTION 'PLATAFORMA: operador sin membresía obtuvo acceso empresarial';
  END IF;
END $$;

SET LOCAL request.jwt.claims TO '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ BEGIN
  IF public.is_platform_operator() THEN
    RAISE EXCEPTION 'PLATAFORMA: rol admin se promovió a operador';
  END IF;
END $$;

RESET role;
RESET request.jwt.claims;
SELECT public.assert_platform_operator('c1000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  BEGIN
    PERFORM public.assert_platform_operator('c1000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'PLATAFORMA: assert aceptó a un admin sin asignación';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

UPDATE public.profiles SET is_active = false
WHERE user_id = 'c1000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  BEGIN
    PERFORM public.assert_platform_operator('c1000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'PLATAFORMA: assert aceptó un perfil desactivado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$ BEGIN
  IF public.is_platform_operator() THEN
    RAISE EXCEPTION 'PLATAFORMA: perfil desactivado autorizado';
  END IF;
END $$;

RESET role;
RESET request.jwt.claims;
UPDATE public.profiles SET is_active = true
WHERE user_id = 'c1000000-0000-4000-8000-000000000001';
DELETE FROM public.platform_operators
WHERE auth_user_id = 'c1000000-0000-4000-8000-000000000001';
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$ BEGIN
  IF public.is_platform_operator() THEN
    RAISE EXCEPTION 'PLATAFORMA: asignación revocada autorizada';
  END IF;
END $$;
ROLLBACK;
