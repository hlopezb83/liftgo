-- Multi-organización Fase 0.1: la cuenta de portal y su membresía son
-- coherentes, y ningún auth user puede pertenecer a más de una organización.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('9a000000-0000-4000-8000-000000000001', 'portal.multi@test.local', now(), now()),
  ('9a000000-0000-4000-8000-000000000002', 'staff.multi@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('9a000000-0000-4000-8000-000000000001', 'customer'),
  ('9a000000-0000-4000-8000-000000000002', 'ventas')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.organizations (id, name, slug) VALUES
  ('9a000000-0000-4000-8000-0000000000a1', 'Organización A de prueba', 'org-test-a-91'),
  ('9a000000-0000-4000-8000-0000000000b1', 'Organización B de prueba', 'org-test-b-91');

INSERT INTO public.customers (id, name) VALUES
  ('9a000000-0000-4000-8000-0000000000c1', 'Cliente global de prueba');

INSERT INTO public.organization_customers (organization_id, customer_id, email) VALUES
  ('9a000000-0000-4000-8000-0000000000a1', '9a000000-0000-4000-8000-0000000000c1', 'cliente.a@test.local'),
  ('9a000000-0000-4000-8000-0000000000b1', '9a000000-0000-4000-8000-0000000000c1', 'cliente.b@test.local');

-- Simula el orden de un alta real: auth creó profile/membresía heredada
-- antes de que se cree la cuenta del portal.
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('9a000000-0000-4000-8000-0000000000a1', '9a000000-0000-4000-8000-000000000001', 'internal'),
  ('9a000000-0000-4000-8000-0000000000a1', '9a000000-0000-4000-8000-000000000002', 'internal');

INSERT INTO public.customer_portal_accounts (
  organization_id, customer_id, auth_user_id, email
) VALUES (
  '9a000000-0000-4000-8000-0000000000a1',
  '9a000000-0000-4000-8000-0000000000c1',
  '9a000000-0000-4000-8000-000000000001',
  'portal.multi@test.local'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE auth_user_id = '9a000000-0000-4000-8000-000000000001'
      AND organization_id = '9a000000-0000-4000-8000-0000000000a1'
      AND member_type = 'portal'
  ) THEN
    RAISE EXCEPTION 'INTEGRITY: una cuenta de portal no normalizó su membresía a portal';
  END IF;

  BEGIN
    INSERT INTO public.organization_memberships (
      organization_id, auth_user_id, member_type
    ) VALUES (
      '9a000000-0000-4000-8000-0000000000b1',
      '9a000000-0000-4000-8000-000000000001',
      'portal'
    );
    RAISE EXCEPTION 'INTEGRITY: un usuario pudo pertenecer a dos organizaciones';
  EXCEPTION WHEN unique_violation OR check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.organization_memberships
    SET member_type = 'internal'
    WHERE auth_user_id = '9a000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'INTEGRITY: una cuenta de portal pudo quedar con tipo internal';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"9a000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF public.current_organization_id() <> '9a000000-0000-4000-8000-0000000000a1'::uuid THEN
    RAISE EXCEPTION 'RLS ROTA: el portal no resuelve su organización';
  END IF;

  IF public.current_portal_customer_id() <> '9a000000-0000-4000-8000-0000000000c1'::uuid THEN
    RAISE EXCEPTION 'RLS ROTA: el portal no resuelve su cliente';
  END IF;

  IF (SELECT COUNT(*) FROM public.organizations) <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: el portal ve organizaciones ajenas';
  END IF;

  IF (SELECT COUNT(*) FROM public.organization_customers) <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: el portal ve relaciones cliente-organización ajenas';
  END IF;

  IF (SELECT COUNT(*) FROM public.customer_portal_accounts) <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: el portal ve cuentas de portal ajenas';
  END IF;
END;
$$;

RESET ROLE;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"9a000000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF public.current_organization_id() <> '9a000000-0000-4000-8000-0000000000a1'::uuid THEN
    RAISE EXCEPTION 'RLS ROTA: el usuario interno no resuelve su organización';
  END IF;

  IF (SELECT COUNT(*) FROM public.organizations) <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: el usuario interno ve organizaciones ajenas';
  END IF;

  IF (SELECT COUNT(*) FROM public.organization_customers) <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: el usuario interno ve relaciones ajenas';
  END IF;
END;
$$;

ROLLBACK;
