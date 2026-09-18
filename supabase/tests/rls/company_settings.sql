-- RLS: company_settings — datos fiscales del emisor: staff lee, solo admin/administrativo edita.
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


INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'ventas.cfg@test.local', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'cliente.cfg@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'ventas'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.company_settings (id, razon_social, rfc, regimen_fiscal, lugar_expedicion)
VALUES ('aaaaaaaa-0000-4000-8000-00000000000f', 'LiftGo RLS', 'AAA010101AAA', '601', '64000');


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

SET LOCAL role = 'authenticated';

-- 1) Ventas: lee pero no edita datos fiscales.
SET LOCAL request.jwt.claims TO '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.company_settings
                  WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000f') THEN
    RAISE EXCEPTION 'RLS ROTA: ventas no lee company_settings';
  END IF;

  BEGIN
    UPDATE public.company_settings SET rfc = 'XXX010101XXX'
     WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000f';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'RLS BREACH: ventas cambió el RFC emisor';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: ventas no edita datos fiscales';
  END;
END $$;

-- 2) Cliente del portal: sin acceso alguno.
SET LOCAL request.jwt.claims TO '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.company_settings) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee company_settings';
  END IF;
END $$;

ROLLBACK;
