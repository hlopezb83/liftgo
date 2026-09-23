-- Multi-organización · tramo 5: administración, roles y funciones privilegiadas.
--
-- Comprueba, con dos organizaciones reales, que:
--   1) la administración de A no ve ni modifica miembros de B;
--   2) update_user_role_safe rechaza un objetivo de B como 'not_found';
--   3) una cuenta de portal no alcanza administración ni RPCs internas;
--   4) el invariante "último admin" se evalúa POR empresa;
--   5) los flujos válidos de A siguen funcionando.
--
-- Requiere la migración 0025 (alcance de administración por organización).
-- No modifica policies ni funciones: sólo ejercita el contrato vigente.
BEGIN;

-- La policy de autoedición nunca puede autorizar administradores de forma
-- global: las policies separadas limitan sus cambios a la empresa activa.
DO $
DECLARE
  v_qual text;
  v_check text;
BEGIN
  SELECT qual, with_check INTO v_qual, v_check
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'profiles'
     AND policyname = 'Users can update own profile';

  IF v_qual IS NULL OR v_check IS NULL
     OR v_qual !~ 'auth.uid.*user_id'
     OR v_check !~ 'auth.uid.*user_id'
     OR v_qual ~* 'has_role|is_admin'
     OR v_check ~* 'has_role|is_admin' THEN
    RAISE EXCEPTION 'ADMIN ORG: la policy de autoedición de profiles concede UPDATE global';
  END IF;
END;
$;

DO $
DECLARE
  v_org_a uuid;
  v_org_b uuid := 'a5000000-0000-4000-8000-0000000000b1';
  v_admin_a uuid := 'a5000000-0000-4000-8000-0000000000a1';
  v_staff_a uuid := 'a5000000-0000-4000-8000-0000000000a2';
  v_admin_b uuid := 'a5000000-0000-4000-8000-0000000000b2';
  v_portal_a uuid := 'a5000000-0000-4000-8000-0000000000a3';
  v_customer uuid := 'a5000000-0000-4000-8000-0000000000c1';
BEGIN
  SELECT id INTO v_org_a
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  IF v_org_a IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere la organización inicial';
  END IF;

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_b, 'Organización B de administración', 'admin-org-b');

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES
    (v_admin_a, 'admin-a@rls.test', now(), now()),
    (v_staff_a, 'staff-a@rls.test', now(), now()),
    (v_portal_a, 'portal-a@rls.test', now(), now());

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_admin_b, 'admin-b@rls.test', now(), now());

  INSERT INTO public.organization_memberships (
    organization_id, auth_user_id, member_type
  )
  VALUES
    (v_org_a, v_admin_a, 'internal'),
    (v_org_a, v_staff_a, 'internal'),
    (v_org_a, v_portal_a, 'portal'),
    (v_org_b, v_admin_b, 'internal');

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.profiles (user_id, full_name, is_active)
  VALUES
    (v_admin_a, 'Admin A', true),
    (v_staff_a, 'Staff A', true),
    (v_portal_a, 'Portal A', true)
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES
    (v_admin_a, 'admin'::public.app_role),
    (v_staff_a, 'dispatcher'::public.app_role),
    (v_portal_a, 'customer'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.profiles (user_id, full_name, is_active)
  VALUES (v_admin_b, 'Admin B', true)
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_b, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Cliente comercial compartido con una cuenta de portal en A.
  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.customers (id, name)
  VALUES (v_customer, 'Cliente comercial compartido de administración');

  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_a, v_customer), (v_org_b, v_customer)
  ON CONFLICT (organization_id, customer_id) DO NOTHING;

  INSERT INTO public.customer_portal_accounts (
    organization_id, customer_id, auth_user_id, email
  )
  VALUES (v_org_a, v_customer, v_portal_a, 'portal-a@rls.test');
END;
$$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"a5000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_org_a uuid := public.current_organization_id();
  v_admin_b uuid := 'a5000000-0000-4000-8000-0000000000b2';
  v_staff_a uuid := 'a5000000-0000-4000-8000-0000000000a2';
  v_visible integer;
  v_updated integer;
  v_role public.app_role;
BEGIN
  IF v_org_a IS NULL THEN
    RAISE EXCEPTION 'CONTEXTO: el admin interno debe resolver la organización A';
  END IF;

  -- 1) El admin de A no ve el perfil ni los roles del admin de B.
  SELECT
    (SELECT count(*) FROM public.profiles WHERE user_id = v_admin_b)
    + (SELECT count(*) FROM public.user_roles WHERE user_id = v_admin_b)
  INTO v_visible;

  IF v_visible <> 0 THEN
    RAISE EXCEPTION
      'ADMIN ORG: el admin de A alcanza % filas del admin de B (esperado 0)',
      v_visible;
  END IF;

  -- 1) Tampoco puede modificarlo con un ID directo.
  WITH touched AS (
    UPDATE public.profiles
    SET full_name = 'Intento cruzado'
    WHERE user_id = v_admin_b
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM touched;

  IF v_updated <> 0 THEN
    RAISE EXCEPTION 'ADMIN ORG: el admin de A modificó el perfil de un miembro de B';
  END IF;

  WITH touched AS (
    UPDATE public.user_roles
    SET role = 'customer'::public.app_role
    WHERE user_id = v_admin_b
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM touched;

  IF v_updated <> 0 THEN
    RAISE EXCEPTION 'ADMIN ORG: el admin de A modificó el rol de un miembro de B';
  END IF;

  -- 2) La RPC privilegiada trata al objetivo de B como inexistente.
  BEGIN
    PERFORM public.update_user_role_safe(v_admin_b, 'dispatcher'::public.app_role);
    RAISE EXCEPTION
      'ADMIN ORG: update_user_role_safe debía rechazar un objetivo de otra empresa';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'not_found%' THEN
        RAISE;
      END IF;
  END;

END;
$$;

-- 2b) El rol de B se verifica bajo la sesión de B: la policy de A devuelve cero
--     filas por diseño y NULL no equivale a un cambio de rol.
SET LOCAL request.jwt.claims TO
  '{"sub":"a5000000-0000-4000-8000-0000000000b2","role":"authenticated"}';

DO $$
DECLARE
  v_admin_b uuid := 'a5000000-0000-4000-8000-0000000000b2';
  v_role public.app_role;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_admin_b;
  IF v_role IS DISTINCT FROM 'admin'::public.app_role THEN
    RAISE EXCEPTION 'ADMIN ORG: el rol del admin de B cambió (obtuvo %)',
      coalesce(v_role::text, '<NULL>');
  END IF;
END;
$$;

-- Se restablece el contexto de A antes de los asertos que dependen de A.
SET LOCAL request.jwt.claims TO
  '{"sub":"a5000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_staff_a uuid := 'a5000000-0000-4000-8000-0000000000a2';
  v_role public.app_role;
BEGIN
  IF public.current_organization_id() IS NULL THEN
    RAISE EXCEPTION 'CONTEXTO: el admin interno debe resolver la organización A';
  END IF;



  -- 4) El último admin se cuenta por empresa: B tiene el suyo, pero A no puede
  --    degradar al único admin de A aunque existan admins en otras empresas.
  BEGIN
    PERFORM public.update_user_role_safe(
      'a5000000-0000-4000-8000-0000000000a1'::uuid,
      'dispatcher'::public.app_role
    );
    RAISE EXCEPTION
      'ADMIN ORG: degradar al único admin de A debía bloquearse';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%LAST_ADMIN_CANNOT_BE_DEMOTED%' THEN
        RAISE;
      END IF;
  END;

  -- 5) El flujo válido dentro de A sigue funcionando.
  PERFORM public.update_user_role_safe(v_staff_a, 'mechanic'::public.app_role);

  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_staff_a;
  IF v_role IS DISTINCT FROM 'mechanic'::public.app_role THEN
    RAISE EXCEPTION
      'ADMIN ORG: el cambio de rol dentro de A no se aplicó (obtuvo %)', v_role;
  END IF;
END;
$$;

-- 3) Una cuenta de portal no alcanza administración ni RPCs internas.
SET LOCAL request.jwt.claims TO
  '{"sub":"a5000000-0000-4000-8000-0000000000a3","role":"authenticated"}';

DO $$
DECLARE
  v_admin_a uuid := 'a5000000-0000-4000-8000-0000000000a1';
  v_visible integer;
BEGIN
  IF public.is_internal_member() THEN
    RAISE EXCEPTION 'PORTAL ADMIN: una cuenta de portal no es miembro interno';
  END IF;

  IF public.is_ops_staff() THEN
    RAISE EXCEPTION 'PORTAL ADMIN: una cuenta de portal no es personal operativo';
  END IF;

  SELECT
    (SELECT count(*) FROM public.profiles WHERE user_id = v_admin_a)
    + (SELECT count(*) FROM public.user_roles WHERE user_id = v_admin_a)
  INTO v_visible;

  IF v_visible <> 0 THEN
    RAISE EXCEPTION
      'PORTAL ADMIN: una cuenta de portal alcanza % filas de administración (esperado 0)',
      v_visible;
  END IF;

  BEGIN
    PERFORM public.update_user_role_safe(v_admin_a, 'customer'::public.app_role);
    RAISE EXCEPTION
      'PORTAL ADMIN: una cuenta de portal no debe ejecutar update_user_role_safe';
  EXCEPTION
    WHEN raise_exception THEN
      NULL;
  END;
END;
$$;

RESET ROLE;

ROLLBACK;
