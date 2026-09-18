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
-- El estado activo sólo lo cambia un operador de plataforma verificado.
DO $suspend$
DECLARE
  v_actor uuid := '31000000-0000-4000-8000-0000000000e1';
BEGIN
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_actor, 'operador.0031@rls.test', now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.platform_operators (auth_user_id, notes)
  VALUES (v_actor, 'bootstrap de prueba 0031')
  ON CONFLICT DO NOTHING;

  PERFORM public.platform_set_organization_active(
    v_actor, '31000000-0000-4000-8000-00000000000c', false);
END $suspend$;

SELECT set_config('app.organization_id', '31000000-0000-4000-8000-00000000000a', true);


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

-- ── 6. Portal con rol interno residual (migración 0032) ──────────────
-- Una cuenta de portal que conserva el rol 'admin' NO puede tocar los
-- archivos del personal de su propia empresa; sólo conserva sus objetos
-- propios (comprobantes de pago) permitidos por la policy del portal.
RESET ROLE;
RESET request.jwt.claims;
SELECT set_config('app.organization_id', '31000000-0000-4000-8000-00000000000a', true);


INSERT INTO storage.buckets (id, name, public) VALUES
  ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

DO $portal_setup$
DECLARE
  v_org uuid := '31000000-0000-4000-8000-00000000000a';
  v_user uuid := '31000000-0000-4000-8000-0000000000f1';
  v_customer uuid := '31000000-0000-4000-8000-0000000000f2';
  v_invoice uuid := '31000000-0000-4000-8000-0000000000f3';
BEGIN
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_user, 'portal-residual@s0031.test', now(), now())
  ON CONFLICT DO NOTHING;

  -- Rol interno RESIDUAL: es exactamente el escenario de la auditoría.
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.customers (id, name, user_id)
  VALUES (v_customer, 'Cliente portal 0031', v_user);

  INSERT INTO public.organization_customers (organization_id, customer_id, status)
  VALUES (v_org, v_customer, 'active') ON CONFLICT DO NOTHING;

  INSERT INTO public.customer_portal_accounts
    (organization_id, customer_id, auth_user_id, email, status)
  VALUES (v_org, v_customer, v_user, 'portal-residual@s0031.test', 'active')
  ON CONFLICT DO NOTHING;

  -- Única membresía: PORTAL.
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org, v_user, 'portal') ON CONFLICT DO NOTHING;

  INSERT INTO public.invoices
    (id, invoice_number, customer_id, customer_name, subtotal, tax_amount, total, status, line_items)
  VALUES (v_invoice, 'FAC-0032-P', v_customer, 'Cliente portal 0031', 100, 0, 100, 'sent',
          '[{"description":"Renta","quantity":1,"unit_price":100,"amount":100}]'::jsonb);

  INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
    ('payment-proofs',
     v_org::text || '/' || v_customer::text || '/' || v_invoice::text || '/comprobante.pdf',
     v_user, '{"mimetype":"application/pdf"}'::jsonb);
END $portal_setup$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"31000000-0000-4000-8000-0000000000f1","role":"authenticated"}';
SELECT set_config('app.organization_id', '31000000-0000-4000-8000-00000000000a', true);

DO $portal_check$
DECLARE
  v_org text := '31000000-0000-4000-8000-00000000000a';
  v_customer text := '31000000-0000-4000-8000-0000000000f2';
  v_invoice text := '31000000-0000-4000-8000-0000000000f3';
  v_staff text := '31000000-0000-4000-8000-00000000000a/doc/propio.pdf';
  v_own text;
  v_blocked boolean;
BEGIN
  v_own := v_org || '/' || v_customer || '/' || v_invoice || '/comprobante.pdf';

  -- 6.0 El predicado de personal niega a la cuenta de portal.
  IF public.storage_staff_path_in_current_organization(v_staff, true) THEN
    RAISE EXCEPTION 'RLS BREACH: el predicado de personal autoriza a una cuenta de portal';
  END IF;
  IF public.current_internal_organization_id() IS NOT NULL THEN
    RAISE EXCEPTION 'RLS BREACH: una cuenta de portal obtiene organización interna';
  END IF;

  -- 6.1 SELECT: no ve archivos del personal de su misma empresa.
  IF EXISTS (SELECT 1 FROM storage.objects
              WHERE bucket_id = 'documents' AND name = v_staff) THEN
    RAISE EXCEPTION 'RLS BREACH: el portal lee documentos del personal de su empresa';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'cfdi-files') THEN
    RAISE EXCEPTION 'RLS BREACH: el portal lee CFDI del personal';
  END IF;

  -- 6.2 INSERT en un bucket de personal: denegado.
  v_blocked := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('documents', v_org || '/doc/portal-intruso.pdf', auth.uid(),
            '{"mimetype":"application/pdf"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: el portal sube archivos al bucket del personal';
  END IF;

  -- 6.3 UPDATE y DELETE sobre el archivo del personal: sin efecto.
  UPDATE storage.objects SET metadata = '{"hackeado":true}'::jsonb
   WHERE bucket_id = 'documents' AND name = v_staff;
  DELETE FROM storage.objects WHERE bucket_id = 'documents' AND name = v_staff;

  -- 6.4 Conserva EXACTAMENTE su propio comprobante.
  IF NOT EXISTS (SELECT 1 FROM storage.objects
                  WHERE bucket_id = 'payment-proofs' AND name = v_own) THEN
    RAISE EXCEPTION 'RLS ROTA: el portal no lee su propio comprobante de pago';
  END IF;

  RAISE NOTICE 'OK: el portal con rol residual queda fuera de los archivos del personal';
END $portal_check$;

RESET ROLE;
RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);

DO $portal_effect$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects
                  WHERE bucket_id = 'documents'
                    AND name = '31000000-0000-4000-8000-00000000000a/doc/propio.pdf') THEN
    RAISE EXCEPTION 'RLS BREACH: el portal borró un archivo del personal';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE metadata ? 'hackeado') THEN
    RAISE EXCEPTION 'RLS BREACH: el portal alteró metadata de archivos del personal';
  END IF;
END $portal_effect$;

-- ── 7. Ninguna policy de personal se apoya sólo en el helper genérico ─
DO $$
DECLARE
  v_faltan int;
BEGIN
  SELECT count(*) INTO v_faltan
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND permissive = 'PERMISSIVE'
    AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ILIKE '%has_role%'
    AND (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
        NOT ILIKE '%storage_staff_path_in_current_organization%';

  IF v_faltan > 0 THEN
    RAISE EXCEPTION 'REGRESIÓN 0032: % policy(s) de personal sin membresía interna', v_faltan;
  END IF;
END $$;

ROLLBACK;

