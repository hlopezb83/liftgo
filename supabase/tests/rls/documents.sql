-- RLS: documents — el mecánico solo ve documentos de equipo/mantenimiento; cliente del portal no ve nada.
-- FIX-R2-04: chequeo de BREACH fuera del handler (ver invoices.sql).
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
  ('cccccccc-0000-4000-8000-000000000001', 'mecanico.doc@test.local', now(), now()),
  ('cccccccc-0000-4000-8000-000000000002', 'cliente.doc@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'mechanic'),
  ('cccccccc-0000-4000-8000-000000000002', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.documents (id, entity_type, entity_id, file_name, file_url) VALUES
  ('cccccccc-0000-4000-8000-00000000000a', 'forklift', gen_random_uuid(), 'manual.pdf', 'docs/manual.pdf'),
  ('cccccccc-0000-4000-8000-00000000000b', 'invoice', gen_random_uuid(), 'factura.pdf', 'docs/factura.pdf');


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

-- 1) Mecánico: solo documentos de equipo/mantenimiento.
SET LOCAL request.jwt.claims TO '{"sub":"cccccccc-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.documents WHERE entity_type = 'invoice') THEN
    RAISE EXCEPTION 'RLS BREACH: mecánico ve documentos de facturación';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.documents WHERE entity_type = 'forklift') THEN
    RAISE EXCEPTION 'RLS ROTA: mecánico no ve documentos de equipo';
  END IF;

  BEGIN
    DELETE FROM public.documents WHERE entity_type = 'forklift';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- denegación esperada; el efecto se verifica abajo
  END;
  IF NOT EXISTS (SELECT 1 FROM public.documents
                  WHERE id = 'cccccccc-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION 'RLS BREACH: mecánico borró documentos';
  END IF;
  RAISE NOTICE 'OK: mecánico es de solo lectura en documents';
END $$;

-- 2) Cliente del portal: sin acceso al repositorio interno.
SET LOCAL request.jwt.claims TO '{"sub":"cccccccc-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.documents) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee documents';
  END IF;
END $$;

ROLLBACK;
