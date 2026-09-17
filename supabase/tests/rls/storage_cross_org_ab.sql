-- RLS: prueba A/B de Storage entre dos organizaciones (migración 0027).
--
-- storage_org_prefix.sql ya cubre payment-proofs, feedback-screenshots del
-- propio usuario y la LECTURA de staff en documents. Lo que NO estaba cubierto
-- y aquí se cubre:
--   - documents: alta, reemplazo y borrado por staff (0027).
--   - feedback-screenshots: ramas de administración (0027).
--   - cfdi-files, supplier-payment-receipts, supplier-bill-cfdi-xml (0027).
--   - el helper de documentos del portal, que resolvía por customer_id global
--     y permitía leer un documento de la ORG B con el mismo cliente (0027).
--
-- Escenario: admin interno de la ORG A; admin interno de la ORG B (guard
-- positivo: los objetos de B sí existen y son legibles por B); y una cuenta de
-- portal de la ORG A del MISMO cliente comercial que también es cliente de B.
BEGIN;

SELECT set_config('app.organization_id', '0c000000-0000-4000-8000-00000000000c', true);

INSERT INTO public.organizations (id, name, slug)
VALUES ('0c000000-0000-4000-8000-00000000000c', 'Org A XOrg', 'org-a-xorg');
INSERT INTO public.organizations (id, name, slug)
VALUES ('0d000000-0000-4000-8000-00000000000d', 'Org B XOrg', 'org-b-xorg');

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'admin-a@xorg.test', now(), now()),
  ('b0000000-0000-4000-8000-000000000002', 'admin-b@xorg.test', now(), now()),
  ('b0000000-0000-4000-8000-000000000003', 'portal-a@xorg.test', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'admin'),
  ('b0000000-0000-4000-8000-000000000002', 'admin'),
  ('b0000000-0000-4000-8000-000000000003', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('0c000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-000000000001', 'internal'),
  ('0d000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-000000000002', 'internal'),
  -- 0025: current_organization_id() se deriva de organization_memberships, así
  -- que la cuenta de portal necesita su membresía 'portal' de la ORG A.
  ('0c000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-000000000003', 'portal');

-- Cliente comercial compartido por las dos organizaciones.
INSERT INTO public.customers (id, name) VALUES
  ('c1000000-0000-4000-8000-00000000000c', 'Cliente compartido XOrg');
INSERT INTO public.organization_customers (organization_id, customer_id) VALUES
  ('0c000000-0000-4000-8000-00000000000c', 'c1000000-0000-4000-8000-00000000000c'),
  ('0d000000-0000-4000-8000-00000000000d', 'c1000000-0000-4000-8000-00000000000c');

INSERT INTO public.customer_portal_accounts
  (organization_id, customer_id, auth_user_id, email, status)
VALUES (
  '0c000000-0000-4000-8000-00000000000c',
  'c1000000-0000-4000-8000-00000000000c',
  'b0000000-0000-4000-8000-000000000003',
  'portal-a@xorg.test',
  'active'
);

-- Facturas del mismo cliente en cada organización.
INSERT INTO public.invoices
  (id, organization_id, invoice_number, customer_id, customer_name, subtotal, tax_amount, total, status, line_items)
VALUES
  ('f1000000-0000-4000-8000-0000000000fa', '0c000000-0000-4000-8000-00000000000c', 'FAC-XO-A',
   'c1000000-0000-4000-8000-00000000000c', 'Cliente compartido XOrg', 100, 0, 100, 'sent',
   '[{"description":"Renta A","quantity":1,"unit_price":100,"amount":100}]'::jsonb),
  ('f1000000-0000-4000-8000-0000000000fb', '0d000000-0000-4000-8000-00000000000d', 'FAC-XO-B',
   'c1000000-0000-4000-8000-00000000000c', 'Cliente compartido XOrg', 200, 0, 200, 'sent',
   '[{"description":"Renta B","quantity":1,"unit_price":200,"amount":200}]'::jsonb);

-- Documentos: uno por organización (rutas nuevas) y uno legado sin prefijo que
-- pertenece a la ORG B.
INSERT INTO public.documents (id, organization_id, entity_type, entity_id, file_name, file_url) VALUES
  ('d1000000-0000-4000-8000-0000000000da', '0c000000-0000-4000-8000-00000000000c', 'invoice',
   'f1000000-0000-4000-8000-0000000000fa', 'factura-a.pdf',
   '0c000000-0000-4000-8000-00000000000c/invoice/f1000000-0000-4000-8000-0000000000fa/factura-a.pdf'),
  ('d1000000-0000-4000-8000-0000000000db', '0d000000-0000-4000-8000-00000000000d', 'invoice',
   'f1000000-0000-4000-8000-0000000000fb', 'factura-b.pdf',
   '0d000000-0000-4000-8000-00000000000d/invoice/f1000000-0000-4000-8000-0000000000fb/factura-b.pdf'),
  ('d1000000-0000-4000-8000-0000000000dc', '0d000000-0000-4000-8000-00000000000d', 'invoice',
   'f1000000-0000-4000-8000-0000000000fb', 'legado-b.pdf',
   'invoice/f1000000-0000-4000-8000-0000000000fb/legado-b.pdf');

INSERT INTO storage.buckets (id, name, public) VALUES
  ('documents', 'documents', false),
  ('feedback-screenshots', 'feedback-screenshots', false),
  ('cfdi-files', 'cfdi-files', false),
  ('supplier-payment-receipts', 'supplier-payment-receipts', false),
  ('supplier-bill-cfdi-xml', 'supplier-bill-cfdi-xml', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
  ('documents',
   '0c000000-0000-4000-8000-00000000000c/invoice/f1000000-0000-4000-8000-0000000000fa/factura-a.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  ('documents',
   '0d000000-0000-4000-8000-00000000000d/invoice/f1000000-0000-4000-8000-0000000000fb/factura-b.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  ('documents',
   'invoice/f1000000-0000-4000-8000-0000000000fb/legado-b.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  ('feedback-screenshots',
   '0d000000-0000-4000-8000-00000000000d/b0000000-0000-4000-8000-000000000002/ajena.png',
   '{"mimetype":"image/png"}'::jsonb),
  ('cfdi-files',
   '0d000000-0000-4000-8000-00000000000d/cfdi/ajeno.xml',
   '{"mimetype":"application/xml"}'::jsonb),
  ('supplier-payment-receipts',
   '0d000000-0000-4000-8000-00000000000d/pagos/ajeno.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  ('supplier-bill-cfdi-xml',
   '0d000000-0000-4000-8000-00000000000d/facturas/ajeno.xml',
   '{"mimetype":"application/xml"}'::jsonb),
  -- Legado sin prefijo en buckets que NO tienen columna que resuelva dueño.
  ('cfdi-files', 'cfdi/legado-sin-prefijo.xml', '{"mimetype":"application/xml"}'::jsonb),
  ('supplier-payment-receipts', 'pagos/legado-sin-prefijo.pdf', '{"mimetype":"application/pdf"}'::jsonb),
  ('supplier-bill-cfdi-xml', 'facturas/legado-sin-prefijo.xml', '{"mimetype":"application/xml"}'::jsonb);

-- ── 1. Admin interno de la ORG A ─────────────────────────────────────
RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT set_config('app.organization_id', '0c000000-0000-4000-8000-00000000000c', true);

DO $$
DECLARE
  v_a text := '0c000000-0000-4000-8000-00000000000c';
  v_b text := '0d000000-0000-4000-8000-00000000000d';
  v_legacy_b text := 'invoice/f1000000-0000-4000-8000-0000000000fb/legado-b.pdf';
  v_bucket text;
  v_path text;
  v_blocked boolean;
BEGIN
  IF public.current_organization_id()::text <> v_a THEN
    RAISE EXCEPTION 'SETUP INVÁLIDO: el admin de la ORG A no resuelve su organización';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'SETUP INVÁLIDO: el admin de la ORG A no tiene rol admin';
  END IF;

  -- 1.1 Guard positivo: el admin de A sí ve su propio documento.
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'documents' AND name LIKE v_a || '/%'
  ) THEN
    RAISE EXCEPTION 'RLS ROTA: el admin de la ORG A no lee sus propios documentos';
  END IF;

  -- 1.2 Enumeración y lectura cruzada en TODOS los buckets.
  FOREACH v_bucket IN ARRAY ARRAY['documents','feedback-screenshots','cfdi-files',
                                  'supplier-payment-receipts','supplier-bill-cfdi-xml'] LOOP
    IF EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = v_bucket AND name LIKE v_b || '/%'
    ) THEN
      RAISE EXCEPTION 'RLS BREACH: la ORG A enumera/lee objetos de la ORG B en %', v_bucket;
    END IF;
  END LOOP;

  -- 1.3 Alta con el prefijo de la ORG B.
  FOREACH v_bucket IN ARRAY ARRAY['documents','feedback-screenshots','cfdi-files',
                                  'supplier-payment-receipts','supplier-bill-cfdi-xml'] LOOP
    v_blocked := false;
    BEGIN
      INSERT INTO storage.objects (bucket_id, name, metadata)
      VALUES (v_bucket, v_b || '/intruso/' || v_bucket || '.bin', '{"mimetype":"application/pdf"}'::jsonb);
    EXCEPTION WHEN insufficient_privilege THEN
      v_blocked := true;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'RLS BREACH: alta aceptada con el prefijo de la ORG B en %', v_bucket;
    END IF;
  END LOOP;

  -- 1.4 Alta legítima en la ORG A (guard positivo: la policy no está rota).
  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES ('documents', v_a || '/invoice/f1000000-0000-4000-8000-0000000000fa/nuevo.pdf',
          '{"mimetype":"application/pdf"}'::jsonb);
  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES ('cfdi-files', v_a || '/cfdi/nuevo.xml', '{"mimetype":"application/xml"}'::jsonb);
  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES ('supplier-payment-receipts', v_a || '/pagos/nuevo.pdf', '{"mimetype":"application/pdf"}'::jsonb);
  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES ('supplier-bill-cfdi-xml', v_a || '/facturas/nuevo.xml', '{"mimetype":"application/xml"}'::jsonb);

  -- 1.5 Reemplazo (UPDATE) de objetos de la ORG B: sin efecto.
  --     El efecto real se comprueba fuera del bloque.
  UPDATE storage.objects
     SET metadata = '{"mimetype":"text/plain","hackeado":true}'::jsonb
   WHERE name LIKE v_b || '/%';

  -- 1.6 Mover un objeto propio al prefijo de la ORG B (WITH CHECK).
  v_blocked := false;
  BEGIN
    UPDATE storage.objects
       SET name = v_b || '/robado.pdf'
     WHERE bucket_id = 'documents'
       AND name = v_a || '/invoice/f1000000-0000-4000-8000-0000000000fa/nuevo.pdf';
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: se movió un objeto propio al prefijo de la ORG B';
  END IF;

  -- 1.7 Borrado cruzado: sin efecto (se comprueba fuera del bloque).
  DELETE FROM storage.objects WHERE name LIKE v_b || '/%';

  -- 1.8 Legado SIN prefijo reclamado por un documento de la ORG B: 0027
  --     resuelve el dueño por public.documents, así que el staff de A no debe
  --     leerlo, reemplazarlo ni borrarlo.
  IF public.storage_document_owned_by_other_organization(v_legacy_b) IS NOT TRUE THEN
    RAISE EXCEPTION 'SETUP INVÁLIDO: el documento legado de la ORG B no resuelve dueño';
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'documents' AND name = v_legacy_b
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: el staff de la ORG A lee un documento legado de la ORG B';
  END IF;
  DELETE FROM storage.objects WHERE bucket_id = 'documents' AND name = v_legacy_b;
  UPDATE storage.objects
     SET metadata = '{"mimetype":"text/plain","hackeado":true}'::jsonb
   WHERE bucket_id = 'documents' AND name = v_legacy_b;

  -- 1.9 GATE de riesgo residual conocido: en los buckets sin columna que ligue
  --     la ruta legada con su organización, los objetos históricos SIGUEN
  --     siendo accesibles para el staff de cualquier organización. Se afirma
  --     de forma explícita para que nadie documente el riesgo como cerrado:
  --     si esto deja de cumplirse (p. ej. tras el traslado de objetos), hay
  --     que actualizar docs/multiempresa/storage-historico.md y esta prueba.
  FOREACH v_bucket IN ARRAY ARRAY['cfdi-files','supplier-payment-receipts',
                                  'supplier-bill-cfdi-xml'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = v_bucket AND name LIKE '%legado-sin-prefijo%'
    ) THEN
      RAISE EXCEPTION 'GATE DESACTUALIZADO: el legado sin prefijo de % ya no es accesible para staff de otra organización; actualizar documentación y esta prueba', v_bucket;
    END IF;
  END LOOP;

  RAISE NOTICE 'OK: admin de la ORG A aislado de los objetos de la ORG B';
END $$;

-- Efecto real de 1.5 / 1.7 / 1.8: los 5 objetos con prefijo de la ORG B (uno
-- por bucket) y su documento legado siguen intactos.
RESET ROLE;
RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);
DO $$
DECLARE
  v_b text := '0d000000-0000-4000-8000-00000000000d';
  v_legacy_b text := 'invoice/f1000000-0000-4000-8000-0000000000fb/legado-b.pdf';
  v_bucket text;
  v_count int;
BEGIN
  v_count := (SELECT count(*) FROM storage.objects WHERE name LIKE v_b || '/%');
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'RLS BREACH: la sesión de la ORG A borró objetos de la ORG B (quedan % de 5)', v_count;
  END IF;
  -- Verificación por bucket: el conteo global no debe poder compensarse.
  FOREACH v_bucket IN ARRAY ARRAY['documents','feedback-screenshots','cfdi-files',
                                  'supplier-payment-receipts','supplier-bill-cfdi-xml'] LOOP
    IF (SELECT count(*) FROM storage.objects
         WHERE bucket_id = v_bucket AND name LIKE v_b || '/%') <> 1 THEN
      RAISE EXCEPTION 'RLS BREACH: la sesión de la ORG A alteró los objetos de la ORG B en %', v_bucket;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'documents' AND name = v_legacy_b AND NOT (metadata ? 'hackeado')
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: la sesión de la ORG A borró o reemplazó el documento legado de la ORG B';
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE name LIKE '0d000000-0000-4000-8000-00000000000d/%'
      AND metadata ? 'hackeado'
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: la sesión de la ORG A reemplazó objetos de la ORG B';
  END IF;
END $$;

-- ── 2. Guard positivo: el admin de la ORG B sí ve lo suyo ────────────
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT set_config('app.organization_id', '0d000000-0000-4000-8000-00000000000d', true);

DO $$
DECLARE
  v_b text := '0d000000-0000-4000-8000-00000000000d';
  v_bucket text;
BEGIN
  FOREACH v_bucket IN ARRAY ARRAY['documents','cfdi-files',
                                  'supplier-payment-receipts','supplier-bill-cfdi-xml'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = v_bucket AND name LIKE v_b || '/%'
    ) THEN
      RAISE EXCEPTION 'FALSO VERDE: el admin de la ORG B no ve sus objetos en % (el fixture no prueba nada)', v_bucket;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK: los objetos de la ORG B existen y su admin sí los ve';
END $$;

-- ── 3. Portal de la ORG A (mismo cliente global que en la ORG B) ─────
RESET ROLE;
RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"b0000000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT set_config('app.organization_id', '0c000000-0000-4000-8000-00000000000c', true);

DO $$
DECLARE
  v_a text := '0c000000-0000-4000-8000-00000000000c';
  v_b text := '0d000000-0000-4000-8000-00000000000d';
  v_legacy text := 'invoice/f1000000-0000-4000-8000-0000000000fb/legado-b.pdf';
BEGIN
  IF public.get_customer_id_for_user(auth.uid())::text
     IS DISTINCT FROM 'c1000000-0000-4000-8000-00000000000c' THEN
    RAISE EXCEPTION 'SETUP INVÁLIDO: la cuenta de portal no resuelve su cliente';
  END IF;

  -- 3.1 Guard positivo: sí lee el documento de su propia organización.
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'documents'
      AND name = v_a || '/invoice/f1000000-0000-4000-8000-0000000000fa/factura-a.pdf'
  ) THEN
    RAISE EXCEPTION 'RLS ROTA: el portal no lee el documento de su propia organización';
  END IF;

  -- 3.2 Ruta nueva con prefijo de la ORG B: el mismo cliente NO debe leerla.
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'documents' AND name LIKE v_b || '/%'
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: el portal de la ORG A lee documentos de la ORG B';
  END IF;

  -- 3.3 Ruta LEGADA (sin prefijo) cuyo documento pertenece a la ORG B:
  --     sin prefijo no hay organización en la ruta, así que la defensa es el
  --     helper de documentos, que 0027 acota a la organización de la sesión.
  IF public.customer_can_read_document_object(v_legacy) THEN
    RAISE EXCEPTION 'RLS BREACH: el helper autoriza un documento legado de la ORG B';
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'documents' AND name = v_legacy
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: el portal de la ORG A lee un documento legado de la ORG B';
  END IF;

  RAISE NOTICE 'OK: portal de la ORG A aislado en rutas nuevas y legadas';
END $$;

ROLLBACK;
