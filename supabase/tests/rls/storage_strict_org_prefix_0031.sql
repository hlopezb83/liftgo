-- RLS: Storage estricto por organización (migración 0031, tramo 10).
--
-- Cubre lo que la auditoría exigía y no estaba cerrado:
--   - SELECT / INSERT / UPDATE / DELETE con dos organizaciones activas.
--   - Prefijo ajeno, prefijo desconocido (UUID que no es una empresa) y
--     legado SIN prefijo: denegados en las cuatro operaciones.
--   - Empresa SUSPENDIDA: pierde también el acceso por la Storage API.
--   - service_role conserva el acceso privilegiado que necesita el migrador
--     de objetos históricos.
BEGIN;

SELECT set_config('app.organization_id', '31000000-0000-4000-8000-00000000000a', true);

INSERT INTO public.organizations (id, name, slug) VALUES
  ('31000000-0000-4000-8000-00000000000a', 'Org A 0031', 'org-a-0031'),
  ('31000000-0000-4000-8000-00000000000b', 'Org B 0031', 'org-b-0031'),
  ('31000000-0000-4000-8000-00000000000c', 'Org Suspendida 0031', 'org-susp-0031');

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('31000000-0000-4000-8000-000000000001', 'admin-a@s0031.test', now(), now()),
  ('31000000-0000-4000-8000-000000000002', 'admin-b@s0031.test', now(), now()),
  ('31000000-0000-4000-8000-000000000003', 'admin-susp@s0031.test', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('31000000-0000-4000-8000-000000000001', 'admin'),
  ('31000000-0000-4000-8000-000000000002', 'admin'),
  ('31000000-0000-4000-8000-000000000003', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('31000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-000000000001', 'internal');

SELECT set_config('app.organization_id', '31000000-0000-4000-8000-00000000000b', true);
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('31000000-0000-4000-8000-00000000000b', '31000000-0000-4000-8000-000000000002', 'internal');

SELECT set_config('app.organization_id', '31000000-0000-4000-8000-00000000000c', true);
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('31000000-0000-4000-8000-00000000000c', '31000000-0000-4000-8000-000000000003', 'internal');

SELECT set_config('app.organization_id', '31000000-0000-4000-8000-00000000000a', true);

INSERT INTO storage.buckets (id, name, public) VALUES
  ('documents', 'documents', false),
  ('cfdi-files', 'cfdi-files', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
  ('documents', '31000000-0000-4000-8000-00000000000a/doc/propio.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  ('documents', '31000000-0000-4000-8000-00000000000b/doc/ajeno.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  ('documents', '31000000-0000-4000-8000-00000000000c/doc/suspendido.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  -- Prefijo con forma de UUID que NO corresponde a ninguna empresa.
  ('cfdi-files', '31000000-0000-4000-8000-0000000000ff/cfdi/desconocido.xml',
   '{"mimetype":"application/xml"}'::jsonb),
  -- Legado sin prefijo de organización.
  ('cfdi-files', 'cfdi/legado-0031.xml', '{"mimetype":"application/xml"}'::jsonb);

-- Empresa suspendida DESPUÉS de crear sus objetos y su membresía.
UPDATE public.organizations
   SET is_active = false
 WHERE id = '31000000-0000-4000-8000-00000000000c';

-- ── 1. Admin de la ORG A: sólo su propio prefijo ─────────────────────
RESET request.jwt.claims;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT set_config('app.organization_id', '31000000-0000-4000-8000-00000000000a', true);

DO $$
DECLARE
  v_a text := '31000000-0000-4000-8000-00000000000a';
  v_b text := '31000000-0000-4000-8000-00000000000b';
  v_unknown text := '31000000-0000-4000-8000-0000000000ff/cfdi/desconocido.xml';
  v_legacy text := 'cfdi/legado-0031.xml';
  v_blocked boolean;
BEGIN
  -- 1.1 SELECT: guard positivo (si esto falla, el resto no prueba nada).
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'documents' AND name = v_a || '/doc/propio.pdf'
  ) THEN
    RAISE EXCEPTION 'RLS ROTA: el admin de la ORG A no lee su propio objeto';
  END IF;

  -- 1.2 SELECT: prefijo ajeno, prefijo desconocido y legado.
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE v_b || '/%') THEN
    RAISE EXCEPTION 'RLS BREACH: se lee un objeto con el prefijo de otra empresa';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name = v_unknown) THEN
    RAISE EXCEPTION 'RLS BREACH: se lee un objeto con prefijo desconocido';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name = v_legacy) THEN
    RAISE EXCEPTION 'RLS BREACH: se lee un objeto legado sin prefijo';
  END IF;

  -- 1.3 INSERT propio: permitido.
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('documents', v_a || '/doc/nuevo.pdf', auth.uid(),
          '{"mimetype":"application/pdf"}'::jsonb);

  -- 1.4 INSERT con prefijo ajeno / desconocido / sin prefijo: denegado.
  v_blocked := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('documents', v_b || '/doc/intruso.pdf', auth.uid(),
            '{"mimetype":"application/pdf"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: alta aceptada con el prefijo de otra empresa';
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('cfdi-files', '31000000-0000-4000-8000-0000000000ff/cfdi/intruso.xml',
            auth.uid(), '{"mimetype":"application/xml"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: alta aceptada con un prefijo desconocido';
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('cfdi-files', 'cfdi/sin-prefijo.xml', auth.uid(),
            '{"mimetype":"application/xml"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: alta aceptada sin prefijo de organización';
  END IF;

  -- 1.5 UPDATE: mover un objeto propio fuera del prefijo está denegado.
  v_blocked := false;
  BEGIN
    UPDATE storage.objects
       SET name = v_b || '/doc/robado.pdf'
     WHERE bucket_id = 'documents' AND name = v_a || '/doc/propio.pdf';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: se movió un objeto propio al prefijo de otra empresa';
  END IF;

  -- 1.6 UPDATE y DELETE sobre ajenos/desconocidos/legado: sin efecto.
  UPDATE storage.objects SET metadata = '{"hackeado":true}'::jsonb
   WHERE name LIKE v_b || '/%' OR name = v_unknown OR name = v_legacy;
  DELETE FROM storage.objects
   WHERE name LIKE v_b || '/%' OR name = v_unknown OR name = v_legacy;

  RAISE NOTICE 'OK: la ORG A sólo opera dentro de su prefijo';
END $$;

-- ── 2. Empresa suspendida: sin acceso por Storage API ────────────────
RESET request.jwt.claims;
SET LOCAL request.jwt.claims TO '{"sub":"31000000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT set_config('app.organization_id', '31000000-0000-4000-8000-00000000000c', true);

DO $$
DECLARE
  v_c text := '31000000-0000-4000-8000-00000000000c';
  v_blocked boolean := false;
BEGIN
  IF public.storage_path_in_current_organization(v_c || '/doc/suspendido.pdf', true) THEN
    RAISE EXCEPTION 'RLS BREACH: el helper autoriza a una empresa suspendida';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE v_c || '/%') THEN
    RAISE EXCEPTION 'RLS BREACH: una empresa suspendida lee sus objetos por Storage';
  END IF;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('documents', v_c || '/doc/nuevo.pdf', auth.uid(),
            '{"mimetype":"application/pdf"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: una empresa suspendida sube objetos';
  END IF;

  DELETE FROM storage.objects WHERE name LIKE v_c || '/%';
  RAISE NOTICE 'OK: la empresa suspendida queda fuera de Storage';
END $$;

-- ── 3. Efecto real: nada ajeno se borró ni se alteró ─────────────────
RESET ROLE;
RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);

DO $$
DECLARE
  v_b text := '31000000-0000-4000-8000-00000000000b';
  v_c text := '31000000-0000-4000-8000-00000000000c';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE v_b || '/%') THEN
    RAISE EXCEPTION 'RLS BREACH: la ORG A borró objetos de la ORG B';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE v_c || '/%') THEN
    RAISE EXCEPTION 'RLS BREACH: la empresa suspendida borró sus objetos';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE metadata ? 'hackeado') THEN
    RAISE EXCEPTION 'RLS BREACH: se alteró metadata de objetos ajenos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = 'cfdi/legado-0031.xml') THEN
    RAISE EXCEPTION 'RLS BREACH: se borró un objeto legado desde una sesión autenticada';
  END IF;
END $$;

-- ── 4. service_role conserva el acceso del migrador ──────────────────
SET LOCAL role = 'service_role';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name = 'cfdi/legado-0031.xml') THEN
    RAISE EXCEPTION 'MIGRADOR ROTO: service_role no ve los objetos legados';
  END IF;
  IF (SELECT count(*) FROM storage.objects
       WHERE name LIKE '31000000-0000-4000-8000-%') < 3 THEN
    RAISE EXCEPTION 'MIGRADOR ROTO: service_role no ve los objetos por empresa';
  END IF;
END $$;

RESET ROLE;

-- ── 5. La policy transversal existe y es RESTRICTIVE ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_objects_org_prefix_guard'
      AND permissive = 'RESTRICTIVE'
      AND 'authenticated' = ANY (roles)
  ) THEN
    RAISE EXCEPTION 'REGRESIÓN 0031: falta la policy RESTRICTIVE de Storage';
  END IF;
END $$;

ROLLBACK;
