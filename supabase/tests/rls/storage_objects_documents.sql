-- RLS: storage.objects — bucket "documents".
-- Solo staff sube/edita/borra; el mecánico solo lee las carpetas forklift/ y
-- maintenance/; el cliente del portal solo lee el archivo EXACTO ligado a un
-- documento suyo (ruta exacta, no coincidencia por sufijo); anon sin acceso.
BEGIN;

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
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, name, user_id) VALUES
  ('50000012-0000-4000-8000-0000000000c1', 'Cliente A SO', '50000012-0000-4000-8000-000000000003'),
  ('50000012-0000-4000-8000-0000000000c2', 'Cliente B SO', '50000012-0000-4000-8000-000000000004');

INSERT INTO public.invoices (id, invoice_number, customer_id, customer_name, total) VALUES
  ('50000012-0000-4000-8000-0000000000i1', 'FAC-SO-A',
   '50000012-0000-4000-8000-0000000000c1', 'Cliente A SO', 100),
  ('50000012-0000-4000-8000-0000000000i2', 'FAC-SO-B',
   '50000012-0000-4000-8000-0000000000c2', 'Cliente B SO', 100);

-- Documentos: uno del cliente A, uno del cliente B y uno interno de equipo.
INSERT INTO public.documents (id, entity_type, entity_id, file_name, file_url) VALUES
  ('50000012-0000-4000-8000-0000000000d1', 'invoice', '50000012-0000-4000-8000-0000000000i1',
   'factura-a.pdf', 'documents/invoice/50000012-a/factura.pdf'),
  ('50000012-0000-4000-8000-0000000000d2', 'invoice', '50000012-0000-4000-8000-0000000000i2',
   'factura-b.pdf', 'documents/invoice/50000012-b/factura.pdf'),
  ('50000012-0000-4000-8000-0000000000d3', 'forklift', gen_random_uuid(),
   'manual.pdf', 'documents/forklift/50000012-f1/manual.pdf');

INSERT INTO storage.objects (id, bucket_id, name) VALUES
  ('50000012-0000-4000-8000-0000000000b1', 'documents', 'invoice/50000012-a/factura.pdf'),
  ('50000012-0000-4000-8000-0000000000b2', 'documents', 'invoice/50000012-b/factura.pdf'),
  ('50000012-0000-4000-8000-0000000000b3', 'documents', 'forklift/50000012-f1/manual.pdf');

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

-- 2) Cliente A: solo el archivo exacto de SU factura; nada del cliente B ni interno.
SET LOCAL request.jwt.claims TO '{"sub":"50000012-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
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

  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('documents', 'invoice/50000012-a/subido-por-cliente.pdf');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: el cliente del portal subio un archivo al bucket documents';
  END IF;
  RAISE NOTICE 'OK: cliente del portal solo lee su archivo exacto';
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
              AND (storage.foldername(name))[1] = 'invoice') THEN
    RAISE EXCEPTION 'RLS BREACH: mecanico ve archivos de facturacion';
  END IF;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('documents', 'forklift/50000012-f1/foto.jpg');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: mecanico subio archivos al bucket documents';
  END IF;
  RAISE NOTICE 'OK: mecanico solo lee forklift/ y maintenance/';
END $$;

-- 4) Ventas: lee todo el bucket, sube y edita, pero NO borra.
SET LOCAL request.jwt.claims TO '{"sub":"50000012-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM storage.objects WHERE bucket_id = 'documents') < 3 THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia leer todo el bucket documents';
  END IF;

  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('documents', 'invoice/50000012-a/anexo.pdf');
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
