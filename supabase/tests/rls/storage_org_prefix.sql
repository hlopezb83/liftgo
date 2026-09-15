-- RLS: rutas de Storage con prefijo de organización (migración 0022).
--
-- Escenario: el MISMO cliente comercial (identidad global) está relacionado
-- con dos organizaciones. La sesión es una cuenta de portal de la ORG A.
-- Ninguna ruta con prefijo de la ORG B debe poder leerse, subirse ni borrarse,
-- y ningún payment intent debe aceptarse con factura o comprobante de la ORG B.
-- Las rutas legadas (sin prefijo) se conservan como compatibilidad explícita:
-- no llevan organización, por lo que no pueden crear una ruta cruzada.
BEGIN;

-- ── Setup (conexión privilegiada, sólo para preparar fixtures) ────────
-- El runner usa su conexión de pruebas para insertar datos de soporte, pero
-- eso no evita el guardia de escritura multiempresa. El contexto explícito de
-- ORG A permite que los triggers derivados de auth.users (por ejemplo profiles)
-- atribuyan sus filas sin adivinar una organización cuando hay varias activas.

-- El valor es LOCAL a esta transacción. Debe existir antes del primer INSERT:
-- los triggers derivados de organizations también son fail-closed y el entorno
-- de CI ya contiene otra organización activa antes de crear estas dos fixtures.
SELECT set_config('app.organization_id', '0a000000-0000-4000-8000-00000000000a', true);

INSERT INTO public.organizations (id, name, slug)
VALUES ('0a000000-0000-4000-8000-00000000000a', 'Org A Storage', 'org-a-storage');

-- Se conserva el contexto explícito de ORG A antes de introducir la segunda
-- organización; ningún trigger del setup puede depender del fallback de org única.
INSERT INTO public.organizations (id, name, slug)
VALUES ('0b000000-0000-4000-8000-00000000000b', 'Org B Storage', 'org-b-storage');

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'portal-a@storage.test', now(), now()),
  ('a0000000-0000-4000-8000-000000000002', 'mecanico-a@storage.test', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'customer'),
  ('a0000000-0000-4000-8000-000000000002', 'mechanic')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('0a000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'internal');

-- Cliente compartido entre las dos organizaciones.
INSERT INTO public.customers (id, name) VALUES
  ('c0000000-0000-4000-8000-00000000000c', 'Cliente compartido Storage');

INSERT INTO public.organization_customers (organization_id, customer_id) VALUES
  ('0a000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000c'),
  ('0b000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000c');

-- La cuenta de portal crea su membresía 'portal' vía trigger.
INSERT INTO public.customer_portal_accounts
  (organization_id, customer_id, auth_user_id, email, status)
VALUES (
  '0a000000-0000-4000-8000-00000000000a',
  'c0000000-0000-4000-8000-00000000000c',
  'a0000000-0000-4000-8000-000000000001',
  'portal-a@storage.test',
  'active'
);

INSERT INTO public.invoices
  (id, organization_id, invoice_number, customer_id, customer_name, subtotal, tax_amount, total, status, line_items)
VALUES
  ('f0000000-0000-4000-8000-0000000000fa', '0a000000-0000-4000-8000-00000000000a', 'FAC-STG-A',
   'c0000000-0000-4000-8000-00000000000c', 'Cliente compartido Storage', 100, 0, 100, 'sent',
   '[{"description":"Renta A","quantity":1,"unit_price":100,"amount":100}]'::jsonb),
  ('f0000000-0000-4000-8000-0000000000fb', '0b000000-0000-4000-8000-00000000000b', 'FAC-STG-B',
   'c0000000-0000-4000-8000-00000000000c', 'Cliente compartido Storage', 200, 0, 200, 'sent',
   '[{"description":"Renta B","quantity":1,"unit_price":200,"amount":200}]'::jsonb);

INSERT INTO storage.buckets (id, name, public) VALUES
  ('payment-proofs', 'payment-proofs', false),
  ('feedback-screenshots', 'feedback-screenshots', false),
  ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
  -- Comprobantes
  ('payment-proofs',
   '0a000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-00000000000c/f0000000-0000-4000-8000-0000000000fa/ok.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  ('payment-proofs',
   '0b000000-0000-4000-8000-00000000000b/c0000000-0000-4000-8000-00000000000c/f0000000-0000-4000-8000-0000000000fb/ajeno.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  ('payment-proofs',
   'c0000000-0000-4000-8000-00000000000c/f0000000-0000-4000-8000-0000000000fa/legado.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  -- Capturas de feedback
  ('feedback-screenshots',
   '0a000000-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-000000000002/captura.png',
   '{"mimetype":"image/png"}'::jsonb),
  ('feedback-screenshots',
   '0b000000-0000-4000-8000-00000000000b/a0000000-0000-4000-8000-000000000002/ajena.png',
   '{"mimetype":"image/png"}'::jsonb),
  -- Documentos internos
  ('documents',
   '0a000000-0000-4000-8000-00000000000a/forklift/e0000000-0000-4000-8000-0000000000e1/manual.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  ('documents',
   '0b000000-0000-4000-8000-00000000000b/forklift/e0000000-0000-4000-8000-0000000000e2/ajeno.pdf',
   '{"mimetype":"application/pdf"}'::jsonb),
  ('documents',
   'forklift/e0000000-0000-4000-8000-0000000000e3/legado.pdf',
   '{"mimetype":"application/pdf"}'::jsonb);

-- ── 1. Cuenta de portal de la ORG A ──────────────────────────────────
RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT set_config('app.organization_id', '0a000000-0000-4000-8000-00000000000a', true);

DO $$
DECLARE
  v_org_a text := '0a000000-0000-4000-8000-00000000000a';
  v_org_b text := '0b000000-0000-4000-8000-00000000000b';
  v_cust text := 'c0000000-0000-4000-8000-00000000000c';
  v_inv_a text := 'f0000000-0000-4000-8000-0000000000fa';
  v_inv_b text := 'f0000000-0000-4000-8000-0000000000fb';
  v_blocked boolean;
  v_count integer;
BEGIN
  -- Guard 0: el contexto de sesión resuelve la ORG A (si no, todo daría falso verde).
  IF public.current_organization_id()::text <> v_org_a THEN
    RAISE EXCEPTION 'SETUP INVÁLIDO: la sesión de portal no resuelve su organización';
  END IF;

  -- 1.1 Lectura: propio y legado sí; prefijo de la ORG B no.
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'payment-proofs' AND name LIKE v_org_a || '/%'
  ) THEN
    RAISE EXCEPTION 'RLS ROTA: el cliente no lee su propio comprobante';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'payment-proofs' AND name = v_cust || '/' || v_inv_a || '/legado.pdf'
  ) THEN
    RAISE EXCEPTION 'REGRESIÓN LEGADA: el comprobante sin prefijo dejó de leerse';
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'payment-proofs' AND name LIKE v_org_b || '/%'
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: la sesión de la ORG A lee comprobantes de la ORG B';
  END IF;

  -- 1.2 Subida con prefijo de la ORG B (mismo cliente, factura de la ORG B).
  v_blocked := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, metadata)
    VALUES ('payment-proofs', v_org_b || '/' || v_cust || '/' || v_inv_b || '/intruso.pdf',
            '{"mimetype":"application/pdf"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: subida aceptada con el prefijo de otra organización';
  END IF;

  -- 1.3 Subida con prefijo propio pero factura de la ORG B.
  v_blocked := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, metadata)
    VALUES ('payment-proofs', v_org_a || '/' || v_cust || '/' || v_inv_b || '/intruso.pdf',
            '{"mimetype":"application/pdf"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: subida aceptada con una factura de otra organización';
  END IF;

  -- 1.4 Subida legítima de la ORG A (guard positivo).
  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES ('payment-proofs', v_org_a || '/' || v_cust || '/' || v_inv_a || '/nuevo.pdf',
          '{"mimetype":"application/pdf"}'::jsonb);

  -- 1.5 Borrado del objeto de la ORG B: sin efecto (se verifica fuera del bloque,
  -- con el rol de la sesión de pruebas, porque `authenticated` no puede cambiar de rol).
  DELETE FROM storage.objects
   WHERE bucket_id = 'payment-proofs' AND name LIKE v_org_b || '/%';


  -- 1.6 Payment intent con factura de la ORG B.
  v_blocked := false;
  BEGIN
    INSERT INTO public.customer_payment_intents
      (organization_id, invoice_id, customer_id, amount, transfer_date, status)
    VALUES (v_org_a::uuid, v_inv_b::uuid, v_cust::uuid, 100, current_date, 'pending_review');
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: payment intent aceptado sobre una factura de otra organización';
  END IF;

  -- 1.7 Payment intent propio con comprobante de otra organización.
  v_blocked := false;
  BEGIN
    INSERT INTO public.customer_payment_intents
      (organization_id, invoice_id, customer_id, amount, transfer_date, status, proof_url)
    VALUES (v_org_a::uuid, v_inv_a::uuid, v_cust::uuid, 100, current_date, 'pending_review',
            v_org_b || '/' || v_cust || '/' || v_inv_a || '/ajeno.pdf');
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: payment intent aceptado con comprobante de otra organización';
  END IF;

  -- 1.8 Guards de diagnóstico: cada condición de la policy debe ser cierta
  -- para la factura propia (si alguna falla, el error dice cuál).
  IF public.get_customer_id_for_user(auth.uid())::text IS DISTINCT FROM v_cust THEN
    RAISE EXCEPTION 'SETUP INVÁLIDO: la cuenta de portal no resuelve su cliente';
  END IF;
  IF NOT public.has_role(auth.uid(), 'customer'::app_role) THEN
    RAISE EXCEPTION 'SETUP INVÁLIDO: la cuenta de portal no tiene el rol customer';
  END IF;
  IF NOT public.invoice_in_current_organization(v_inv_a::uuid) THEN
    RAISE EXCEPTION 'POLICY ROTA: la factura propia no se ve en la organización actual';
  END IF;
  IF NOT public.invoice_eligible_for_payment_intent(v_inv_a::uuid) THEN
    RAISE EXCEPTION 'POLICY ROTA: la factura propia no es elegible para payment intent';
  END IF;
  IF public.invoice_eligible_for_payment_intent(v_inv_b::uuid) THEN
    RAISE EXCEPTION 'RLS BREACH: la factura de la ORG B es elegible para payment intent';
  END IF;
  IF NOT public.payment_proof_path_allowed(
        v_org_a || '/' || v_cust || '/' || v_inv_a || '/nuevo.pdf', true) THEN
    RAISE EXCEPTION 'POLICY ROTA: la ruta propia del comprobante no se acepta';
  END IF;
  IF public.payment_proof_path_allowed(
        v_org_b || '/' || v_cust || '/' || v_inv_a || '/ajeno.pdf', true) THEN
    RAISE EXCEPTION 'RLS BREACH: se acepta una ruta con el prefijo de otra organización';
  END IF;

  -- 1.9 Payment intent legítimo con comprobante propio (guard positivo).
  INSERT INTO public.customer_payment_intents
    (organization_id, invoice_id, customer_id, amount, transfer_date, status, proof_url)
  VALUES (v_org_a::uuid, v_inv_a::uuid, v_cust::uuid, 100, current_date, 'pending_review',
          v_org_a || '/' || v_cust || '/' || v_inv_a || '/nuevo.pdf');

  IF (SELECT count(*) FROM public.customer_payment_intents
       WHERE invoice_id = v_inv_a::uuid
         AND proof_url = v_org_a || '/' || v_cust || '/' || v_inv_a || '/nuevo.pdf') <> 1 THEN
    RAISE EXCEPTION 'POLICY ROTA: el payment intent legítimo no quedó registrado';
  END IF;


  RAISE NOTICE 'OK: comprobantes de pago aislados por organización';
END $$;

-- Efecto real del borrado cruzado (1.5): el objeto de la ORG B sigue ahí.
RESET ROLE;
RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM storage.objects
       WHERE bucket_id = 'payment-proofs'
         AND name LIKE '0b000000-0000-4000-8000-00000000000b/%') <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: la sesión de la ORG A borró comprobantes de la ORG B';
  END IF;
END $$;

-- ── 2. Usuario interno de la ORG A: feedback y documentos ────────────
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT set_config('app.organization_id', '0a000000-0000-4000-8000-00000000000a', true);


DO $$
DECLARE
  v_org_a text := '0a000000-0000-4000-8000-00000000000a';
  v_org_b text := '0b000000-0000-4000-8000-00000000000b';
  v_uid text := 'a0000000-0000-4000-8000-000000000002';
  v_blocked boolean;
  v_count integer;
BEGIN
  -- 2.1 Capturas de feedback: propia sí, prefijo ajeno no.
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'feedback-screenshots' AND name = v_org_a || '/' || v_uid || '/captura.png'
  ) THEN
    RAISE EXCEPTION 'RLS ROTA: el usuario no lee su propia captura de feedback';
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'feedback-screenshots' AND name LIKE v_org_b || '/%'
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: se leen capturas con el prefijo de otra organización';
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, metadata)
    VALUES ('feedback-screenshots', v_org_b || '/' || v_uid || '/intrusa.png',
            '{"mimetype":"image/png"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: captura subida con el prefijo de otra organización';
  END IF;

  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES ('feedback-screenshots', v_org_a || '/' || v_uid || '/nueva.png',
          '{"mimetype":"image/png"}'::jsonb);

  -- Borrado cruzado: el efecto se verifica fuera del bloque.
  DELETE FROM storage.objects
   WHERE bucket_id = 'feedback-screenshots' AND name LIKE v_org_b || '/%';


  -- 2.2 Documentos: mecánico de la ORG A.
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'documents' AND name LIKE v_org_a || '/forklift/%'
  ) THEN
    RAISE EXCEPTION 'RLS ROTA: el mecánico no lee documentos de equipo de su organización';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'documents' AND name LIKE 'forklift/%'
  ) THEN
    RAISE EXCEPTION 'REGRESIÓN LEGADA: el documento sin prefijo dejó de leerse';
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'documents' AND name LIKE v_org_b || '/%'
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: el mecánico lee documentos de otra organización';
  END IF;

  RAISE NOTICE 'OK: feedback y documentos aislados por organización';
END $$;

-- Efecto real del borrado cruzado de capturas.
RESET ROLE;
RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM storage.objects
       WHERE bucket_id = 'feedback-screenshots'
         AND name LIKE '0b000000-0000-4000-8000-00000000000b/%') <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: se borró una captura de otra organización';
  END IF;
END $$;
ROLLBACK;
