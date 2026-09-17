-- RLS: storage.objects — bucket "documents" (multiempresa).
-- Solo staff sube/edita/borra dentro de SU organización; el mecánico solo lee
-- las carpetas forklift/ y maintenance/; el cliente del portal solo lee el
-- archivo EXACTO ligado a un documento suyo de SU organización; anon sin
-- acceso. Incluye una ORG B sintética para comprobar el aislamiento cruzado,
-- tanto en rutas nuevas con prefijo como en una ruta legada sin prefijo.
BEGIN;

SELECT set_config('app.organization_id', '50000012-0000-4000-8000-00000000000a', true);

INSERT INTO public.organizations (id, name, slug) VALUES
  ('50000012-0000-4000-8000-00000000000a', 'Org A SO', 'org-a-so'),
  ('50000012-0000-4000-8000-00000000000b', 'Org B SO', 'org-b-so');

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('50000012-0000-4000-8000-000000000001', 'ventas.so@test.local', now(), now()),
  ('50000012-0000-4000-8000-000000000002', 'mecanico.so@test.local', now(), now()),
  ('50000012-0000-4000-8000-000000000003', 'clientea.so@test.local', now(), now()),
  ('50000012-0000-4000-8000-000000000004', 'clienteb.so@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('50000012-0000-4000-8000-000000000001', 'ventas'),
  ('50000012-0000-4000-8000-000000000002', 'mechanic'),
  ('50000012-0000-4000-8000-000000000003', 'customer'),
  ('50000012-0000-4000-8000-000000000004', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- 0025: current_organization_id() se deriva de organization_memberships.
-- Sin membresía no hay organización y las policies quedan cerradas.
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('50000012-0000-4000-8000-00000000000a', '50000012-0000-4000-8000-000000000001', 'internal'),
  ('50000012-0000-4000-8000-00000000000a', '50000012-0000-4000-8000-000000000002', 'internal'),
  ('50000012-0000-4000-8000-00000000000a', '50000012-0000-4000-8000-000000000003', 'portal'),
  ('50000012-0000-4000-8000-00000000000a', '50000012-0000-4000-8000-000000000004', 'portal');

INSERT INTO public.customers (id, name, user_id) VALUES
  ('50000012-0000-4000-8000-0000000000c1', 'Cliente A SO', '50000012-0000-4000-8000-000000000003'),
  ('50000012-0000-4000-8000-0000000000c2', 'Cliente B SO', '50000012-0000-4000-8000-000000000004');

INSERT INTO public.organization_customers (organization_id, customer_id) VALUES
  ('50000012-0000-4000-8000-00000000000a', '50000012-0000-4000-8000-0000000000c1'),
  ('50000012-0000-4000-8000-00000000000a', '50000012-0000-4000-8000-0000000000c2');

INSERT INTO public.invoices
  (id, organization_id, invoice_number, customer_id, customer_name, subtotal, tax_amount, total) VALUES
  ('50000012-0000-4000-8000-0000000000e1', '50000012-0000-4000-8000-00000000000a', 'FAC-SO-A',
   '50000012-0000-4000-8000-0000000000c1', 'Cliente A SO', 100, 0, 100),
  ('50000012-0000-4000-8000-0000000000e2', '50000012-0000-4000-8000-00000000000a', 'FAC-SO-B',
   '50000012-0000-4000-8000-0000000000c2', 'Cliente B SO', 100, 0, 100),
  -- Factura del cliente A pero en la ORG B (el cliente es identidad global).
  ('50000012-0000-4000-8000-0000000000e3', '50000012-0000-4000-8000-00000000000b', 'FAC-SO-XB',
   '50000012-0000-4000-8000-0000000000c1', 'Cliente A SO', 100, 0, 100);

-- Rutas nuevas: {organization_id}/{entity_type}/{entity_id}/archivo
INSERT INTO public.documents (id, organization_id, entity_type, entity_id, file_name, file_url) VALUES
  ('50000012-0000-4000-8000-0000000000d1', '50000012-0000-4000-8000-00000000000a',
   'invoice', '50000012-0000-4000-8000-0000000000e1', 'factura-a.pdf',
   '50000012-0000-4000-8000-00000000000a/invoice/50000012-a/factura.pdf'),
  ('50000012-0000-4000-8000-0000000000d2', '50000012-0000-4000-8000-00000000000a',
   'invoice', '50000012-0000-4000-8000-0000000000e2', 'factura-b.pdf',
   '50000012-0000-4000-8000-00000000000a/invoice/50000012-b/factura.pdf'),
  ('50000012-0000-4000-8000-0000000000d3', '50000012-0000-4000-8000-00000000000a',
   'forklift', gen_random_uuid(), 'manual.pdf',
   '50000012-0000-4000-8000-00000000000a/forklift/50000012-f1/manual.pdf'),
  -- Documento de la ORG B del MISMO cliente A (ruta nueva) y uno legado.
  ('50000012-0000-4000-8000-0000000000d4', '50000012-0000-4000-8000-00000000000b',
   'invoice', '50000012-0000-4000-8000-0000000000e3', 'factura-xb.pdf',
   '50000012-0000-4000-8000-00000000000b/invoice/50000012-xb/factura.pdf'),
  ('50000012-0000-4000-8000-0000000000d5', '50000012-0000-4000-8000-00000000000b',
   'invoice', '50000012-0000-4000-8000-0000000000e3', 'legado-xb.pdf',
   'invoice/50000012-xb/legado.pdf');

INSERT INTO storage.objects (id, bucket_id, name) VALUES
  ('50000012-0000-4000-8000-0000000000b1', 'documents',
   '50000012-0000-4000-8000-00000000000a/invoice/50000012-a/factura.pdf'),
  ('50000012-0000-4000-8000-0000000000b2', 'documents',
   '50000012-0000-4000-8000-00000000000a/invoice/50000012-b/factura.pdf'),
  ('50000012-0000-4000-8000-0000000000b3', 'documents',
   '50000012-0000-4000-8000-00000000000a/forklift/50000012-f1/manual.pdf'),
  ('50000012-0000-4000-8000-0000000000b4', 'documents',
   '50000012-0000-4000-8000-00000000000b/invoice/50000012-xb/factura.pdf'),
  ('50000012-0000-4000-8000-0000000000b5', 'documents',
   'invoice/50000012-xb/legado.pdf');

-- 1) anon: el bucket es privado.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM storage.objects WHERE bucket_id = 'documents') <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lista objetos del bucket documents';
  END IF;
  RAISE NOTICE 'OK: anon sin acceso al bucket documents';
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente A: solo el archivo exacto de SU factura en SU organización.
SET LOCAL request.jwt.claims TO '{"sub":"50000012-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF public.current_organization_id()
     IS DISTINCT FROM '50000012-0000-4000-8000-00000000000a'::uuid THEN
    RAISE EXCEPTION 'SETUP INVÁLIDO: el cliente A no resuelve su organización';
  END IF;
  IF (SELECT COUNT(*) FROM storage.objects WHERE bucket_id = 'documents') <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente A ve % objetos (esperado 1)',
      (SELECT COUNT(*) FROM storage.objects WHERE bucket_id = 'documents');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects
                  WHERE id = '50000012-0000-4000-8000-0000000000b1') THEN
    RAISE EXCEPTION 'RLS ROTA: cliente A no ve el archivo de su propia factura';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
              WHERE id = '50000012-0000-4000-8000-0000000000b2') THEN
    RAISE EXCEPTION 'RLS BREACH: cliente A ve el archivo del cliente B';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
              WHERE id = '50000012-0000-4000-8000-0000000000b3') THEN
    RAISE EXCEPTION 'RLS BREACH: cliente A ve documentos internos de equipo';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
              WHERE id = '50000012-0000-4000-8000-0000000000b4') THEN
    RAISE EXCEPTION 'RLS BREACH: cliente A ve su documento de OTRA organización (ruta nueva)';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
              WHERE id = '50000012-0000-4000-8000-0000000000b5') THEN
    RAISE EXCEPTION 'RLS BREACH: cliente A ve su documento de OTRA organización (ruta legada)';
  END IF;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('documents',
            '50000012-0000-4000-8000-00000000000a/invoice/50000012-a/subido-por-cliente.pdf');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: el cliente del portal subio un archivo al bucket documents';
  END IF;
  RAISE NOTICE 'OK: cliente del portal solo lee su archivo exacto de su organización';
END $$;

-- 3) Mecánico: solo carpetas forklift/ y maintenance/, y sin subir archivos.
SET LOCAL request.jwt.claims TO '{"sub":"50000012-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects
                  WHERE id = '50000012-0000-4000-8000-0000000000b3') THEN
    RAISE EXCEPTION 'RLS ROTA: mecanico no ve la carpeta forklift/';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'documents'
              AND (public.storage_relative_segments(name))[1] = 'invoice') THEN
    RAISE EXCEPTION 'RLS BREACH: mecanico ve archivos de facturacion';
  END IF;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('documents',
            '50000012-0000-4000-8000-00000000000a/forklift/50000012-f1/foto.jpg');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: mecanico subio archivos al bucket documents';
  END IF;
  RAISE NOTICE 'OK: mecanico solo lee forklift/ y maintenance/';
END $$;

-- 4) Ventas: lee todo el bucket de SU organización, sube y edita, pero NO borra
--    y no alcanza los objetos de la ORG B (ni los prefijados ni el legado).
SET LOCAL request.jwt.claims TO '{"sub":"50000012-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM storage.objects WHERE bucket_id = 'documents'
       AND name LIKE '50000012-0000-4000-8000-00000000000a/%') < 3 THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia leer todo el bucket de su organizacion';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
              WHERE id = '50000012-0000-4000-8000-0000000000b4') THEN
    RAISE EXCEPTION 'RLS BREACH: ventas de la ORG A ve documentos prefijados de la ORG B';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
              WHERE id = '50000012-0000-4000-8000-0000000000b5') THEN
    RAISE EXCEPTION 'RLS BREACH: ventas de la ORG A ve un documento legado de la ORG B';
  END IF;

  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('documents', '50000012-0000-4000-8000-00000000000a/invoice/50000012-a/anexo.pdf');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia poder subir a documents';
  END IF;

  BEGIN
    DELETE FROM storage.objects WHERE id = '50000012-0000-4000-8000-0000000000b1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas borro archivos del bucket documents';
  END IF;
  RAISE NOTICE 'OK: ventas sube y edita pero no borra en documents';
END $$;

ROLLBACK;
