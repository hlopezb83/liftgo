-- RLS: customers — aislamiento del portal y mecánico sin acceso al padrón.
--
-- Multiempresa: desde las migraciones 0040-0044 el portal se resuelve por
-- `customer_portal_accounts` y la pertenencia interna por
-- `organization_memberships`; los roles globales ya no bastan. La siembra
-- refleja ese contexto, pero la aserción sigue siendo CONDUCTUAL.
BEGIN;

DO $$
DECLARE
  v_org uuid := '33333333-0000-4000-8000-0000000000f0';
  v_portal_uid uuid := '33333333-0000-4000-8000-000000000001';
  v_mech_uid uuid := '33333333-0000-4000-8000-000000000002';
  v_own uuid := '33333333-0000-4000-8000-0000000000a1';
  v_other uuid := '33333333-0000-4000-8000-0000000000c1';
BEGIN
  INSERT INTO public.organizations (id, name, slug, is_active)
  VALUES (v_org, 'Organización portal de prueba', 'rls-customers-portal', true);

  PERFORM set_config('app.organization_id', v_org::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
    (v_portal_uid, 'cliente.cust@test.local', now(), now()),
    (v_mech_uid, 'mecanico.cust@test.local', now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_portal_uid, 'customer'::public.app_role),
    (v_mech_uid, 'mechanic'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- El cliente entra por el portal; el mecánico es personal interno.
  INSERT INTO public.organization_memberships (
    organization_id, auth_user_id, member_type
  ) VALUES
    (v_org, v_portal_uid, 'portal'),
    (v_org, v_mech_uid, 'internal');

  INSERT INTO public.customers (id, name, user_id) VALUES
    (v_own, 'Cliente Propio', v_portal_uid),
    (v_other, 'Cliente Ajeno', NULL);

  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org, v_own), (v_org, v_other);

  INSERT INTO public.customer_portal_accounts (
    organization_id, customer_id, auth_user_id, email, is_active
  ) VALUES (
    v_org, v_own, v_portal_uid, 'cliente.cust@test.local', true
  );
END $$;

SET LOCAL role = 'authenticated';

-- 1) Cliente del portal: solo su propio registro.
SET LOCAL request.jwt.claims TO '{"sub":"33333333-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.customers WHERE id = '33333333-0000-4000-8000-0000000000c1') THEN
    RAISE EXCEPTION 'RLS BREACH: cliente ve el padrón de otros clientes';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = '33333333-0000-4000-8000-0000000000a1') THEN
    RAISE EXCEPTION 'RLS ROTA: cliente no ve su propio registro';
  END IF;

  BEGIN
    UPDATE public.customers SET name = 'Hackeado'
     WHERE id = '33333333-0000-4000-8000-0000000000a1';
    IF EXISTS (SELECT 1 FROM public.customers
                WHERE id = '33333333-0000-4000-8000-0000000000a1' AND name = 'Hackeado') THEN
      RAISE EXCEPTION 'RLS BREACH: cliente pudo editar su registro';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: cliente no edita customers';
  END;
END $$;

-- 2) Mecánico: sin acceso al padrón de clientes.
SET LOCAL request.jwt.claims TO '{"sub":"33333333-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.customers) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: mecánico lee customers';
  END IF;
END $$;

ROLLBACK;
