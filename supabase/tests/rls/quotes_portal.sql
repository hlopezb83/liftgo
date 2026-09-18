-- RLS: quotes (portal read)
-- Guard: cliente A NO ve cotizaciones de cliente B.
BEGIN;

-- Contexto multiempresa (migración 0031): las operaciones de servicio deben
-- declarar la organización antes de sembrar datos.
DO $ctx$
DECLARE
  v_org uuid;
BEGIN
  SELECT id INTO v_org
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere la organización inicial';
  END IF;

  PERFORM set_config('app.organization_id', v_org::text, true);
END $ctx$;


INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'a@test.local', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', 'b@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, name, user_id) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'A', 'a1111111-1111-4111-8111-111111111111'),
  ('c2222222-2222-4222-8222-222222222222', 'B', 'b2222222-2222-4222-8222-222222222222')
ON CONFLICT DO NOTHING;

INSERT INTO public.quotes (id, customer_id, quote_number, status, total, subtotal, tax_amount)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'COT-A-1', 'draft', 100, 100, 0),
  ('22222222-2222-4222-8222-222222222222', 'c2222222-2222-4222-8222-222222222222', 'COT-B-1', 'draft', 100, 100, 0)
ON CONFLICT DO NOTHING;


-- Contexto multiempresa (migración 0031): el personal interno sólo tiene
-- contexto de organización con una membresía interna explícita.
DO $mem$
DECLARE
  v_org uuid;
BEGIN
  SELECT id INTO v_org
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  PERFORM set_config('app.organization_id', v_org::text, true);

  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  SELECT v_org, ur.user_id, 'internal'
  FROM public.user_roles ur
  WHERE ur.role <> 'customer'
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.auth_user_id = ur.user_id
    )
  ON CONFLICT DO NOTHING;
END $mem$;

-- Contexto multiempresa (migración 0031): un cliente del portal necesita
-- relación por organización, cuenta de portal activa y membresía de portal.
DO $portal$
DECLARE
  v_org uuid;
BEGIN
  SELECT id INTO v_org
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  PERFORM set_config('app.organization_id', v_org::text, true);

  INSERT INTO public.organization_customers (organization_id, customer_id, status)
  SELECT v_org, c.id, 'active'
  FROM public.customers c
  WHERE c.user_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO public.customer_portal_accounts
    (organization_id, customer_id, auth_user_id, email, status)
  SELECT v_org, c.id, c.user_id,
         COALESCE(u.email, c.id::text || '@rls.test'), 'active'
  FROM public.customers c
  JOIN auth.users u ON u.id = c.user_id
  WHERE c.user_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  SELECT v_org, c.user_id, 'portal'
  FROM public.customers c
  WHERE c.user_id IS NOT NULL
  ON CONFLICT DO NOTHING;
END $portal$;


SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  visible_count INT;
BEGIN
  SELECT COUNT(*) INTO visible_count FROM public.quotes
   WHERE id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: user A ve % cotizaciones (esperado 1)', visible_count;
  END IF;
END $$;

ROLLBACK;
