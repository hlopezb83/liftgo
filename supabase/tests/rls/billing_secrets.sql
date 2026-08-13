-- RLS: billing_secrets — tabla más sensible (llaves de Facturapi).
-- Guard: NINGÚN rol de aplicación puede leerla; solo admin escribe.
-- FIX-R2-04: chequeo de BREACH fuera del handler (ver invoices.sql).
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'admin.bs@test.local', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', 'ventas.bs@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'admin'),
  ('b2222222-2222-4222-8222-222222222222', 'ventas')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

SET LOCAL role = 'authenticated';

-- 1) Ventas no puede leer secretos (no existe policy SELECT para nadie).
SET LOCAL request.jwt.claims TO '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}';

DO $$
DECLARE v_cnt int; v_blocked boolean := false;
BEGIN
  -- Sin GRANT SELECT la lectura falla con insufficient_privilege: también es
  -- una denegación válida (la tabla nunca sale al cliente).
  BEGIN
    SELECT COUNT(*) INTO v_cnt FROM public.billing_secrets;
  EXCEPTION WHEN insufficient_privilege THEN
    v_cnt := 0;
  END;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas puede leer billing_secrets';
  END IF;

  BEGIN
    INSERT INTO public.billing_secrets (key, value) VALUES ('facturapi_live', 'sk_test');
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: ventas pudo insertar billing_secrets';
  END IF;
  RAISE NOTICE 'OK: ventas bloqueado en billing_secrets';
END $$;

-- 2) Admin tampoco puede LEER (solo escribir); la lectura es exclusiva del backend.
SET LOCAL request.jwt.claims TO '{"sub":"b1111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
DECLARE v_cnt int;
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_cnt FROM public.billing_secrets;
  EXCEPTION WHEN insufficient_privilege THEN
    v_cnt := 0;
  END;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: admin puede leer billing_secrets desde el cliente';
  END IF;
  RAISE NOTICE 'OK: admin no lee billing_secrets desde el cliente';
END $$;


ROLLBACK;
