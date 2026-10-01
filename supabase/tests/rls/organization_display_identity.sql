-- Offline RLS regression: only the active internal organization can expose
-- its display name, with no fiscal table read granted to mechanics.
BEGIN;

INSERT INTO public.organizations (id, name, slug, is_active) VALUES
  ('83000000-0000-4000-8000-0000000000a1', 'Nombre interno A', 'identity-0083-a', true),
  ('83000000-0000-4000-8000-0000000000b1', 'Nombre interno B', 'identity-0083-b', true);

SELECT set_config('app.organization_id', '83000000-0000-4000-8000-0000000000a1', true);
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('83000000-0000-4000-8000-000000000001', 'admin.identity-a@rls.test', now(), now()),
  ('83000000-0000-4000-8000-000000000002', 'mechanic.identity-a@rls.test', now(), now()),
  ('83000000-0000-4000-8000-000000000003', 'sales.identity-a@rls.test', now(), now()),
  ('83000000-0000-4000-8000-000000000004', 'auditor.identity-a@rls.test', now(), now()),
  ('83000000-0000-4000-8000-000000000005', 'portal.identity-a@rls.test', now(), now()),
  ('83000000-0000-4000-8000-000000000006', 'no-member.identity@rls.test', now(), now());
INSERT INTO public.user_roles (user_id, role) VALUES
  ('83000000-0000-4000-8000-000000000001', 'admin'),
  ('83000000-0000-4000-8000-000000000002', 'mechanic'),
  ('83000000-0000-4000-8000-000000000003', 'ventas'),
  ('83000000-0000-4000-8000-000000000004', 'auditor'),
  ('83000000-0000-4000-8000-000000000005', 'customer');
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
SELECT '83000000-0000-4000-8000-0000000000a1'::uuid, user_id,
       CASE WHEN role = 'customer' THEN 'portal' ELSE 'internal' END
FROM public.user_roles
WHERE user_id IN (
  '83000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000002',
  '83000000-0000-4000-8000-000000000003',
  '83000000-0000-4000-8000-000000000004',
  '83000000-0000-4000-8000-000000000005'
);
INSERT INTO public.company_settings (organization_id, razon_social, rfc, regimen_fiscal, lugar_expedicion)
VALUES ('83000000-0000-4000-8000-0000000000a1', 'Identidad legal A', 'AAA010101AAA', '601', '64000');

SELECT set_config('app.organization_id', '83000000-0000-4000-8000-0000000000b1', true);
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES ('83000000-0000-4000-8000-000000000007', 'admin.identity-b@rls.test', now(), now());
INSERT INTO public.user_roles (user_id, role)
VALUES ('83000000-0000-4000-8000-000000000007', 'admin');
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
VALUES ('83000000-0000-4000-8000-0000000000b1', '83000000-0000-4000-8000-000000000007', 'internal');

SET LOCAL ROLE authenticated;
DO $members$
DECLARE
  v_user uuid;
BEGIN
  FOREACH v_user IN ARRAY ARRAY[
    '83000000-0000-4000-8000-000000000001'::uuid,
    '83000000-0000-4000-8000-000000000002'::uuid,
    '83000000-0000-4000-8000-000000000003'::uuid,
    '83000000-0000-4000-8000-000000000004'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    IF public.get_organization_display_name() IS DISTINCT FROM 'Identidad legal A' THEN
      RAISE EXCEPTION '0083: inconsistent display identity for %', v_user;
    END IF;
  END LOOP;
END;
$members$;

SET LOCAL request.jwt.claims = '{"sub":"83000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $mechanic$
BEGIN
  IF EXISTS (SELECT 1 FROM public.company_settings) THEN
    RAISE EXCEPTION '0083: mechanic gained fiscal table read';
  END IF;
END;
$mechanic$;

SET LOCAL request.jwt.claims = '{"sub":"83000000-0000-4000-8000-000000000007","role":"authenticated"}';
DO $org_b$
BEGIN
  IF public.get_organization_display_name() IS DISTINCT FROM 'Nombre interno B' THEN
    RAISE EXCEPTION '0083: organization B identity leaked or fallback missing';
  END IF;
END;
$org_b$;

DO $denied$
DECLARE v_user uuid;
BEGIN
  FOREACH v_user IN ARRAY ARRAY[
    '83000000-0000-4000-8000-000000000005'::uuid,
    '83000000-0000-4000-8000-000000000006'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    BEGIN
      PERFORM public.get_organization_display_name();
      RAISE EXCEPTION '0083: non-internal user unexpectedly authorized';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END;
$denied$;

RESET ROLE;
SET LOCAL request.jwt.claims = '{}';
SELECT set_config('app.platform_operation', 'on', true);
UPDATE public.organizations SET is_active = false
WHERE id = '83000000-0000-4000-8000-0000000000a1';
SELECT set_config('app.platform_operation', 'off', true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"83000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $suspended$
BEGIN
  BEGIN
    PERFORM public.get_organization_display_name();
    RAISE EXCEPTION '0083: suspended organization unexpectedly authorized';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$suspended$;

SET LOCAL ROLE anon;
DO $anonymous$
BEGIN
  BEGIN
    PERFORM public.get_organization_display_name();
    RAISE EXCEPTION '0083: anon unexpectedly authorized';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$anonymous$;
ROLLBACK;
