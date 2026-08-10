-- RLS: billing_secrets — tabla más sensible (llaves de Facturapi).
-- Guard: NINGÚN rol de aplicación puede leerla; solo admin escribe.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'admin.bs@test.local', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', 'ventas.bs@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'admin'),
  ('b2222222-2222-4222-8222-222222222222', 'ventas')
ON CONFLICT DO NOTHING;

SET LOCAL role = 'authenticated';

-- 1) Ventas no puede leer secretos (no existe policy SELECT para nadie).
SET LOCAL request.jwt.claims TO '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.billing_secrets) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas puede leer billing_secrets';
  END IF;

  BEGIN
    INSERT INTO public.billing_secrets (key, value) VALUES ('facturapi_live', 'sk_test');
    RAISE EXCEPTION 'RLS BREACH: ventas pudo insertar billing_secrets';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'OK: ventas bloqueado en billing_secrets';
  END;
END $$;

-- 2) Admin tampoco puede LEER (solo escribir); la lectura es exclusiva del backend.
SET LOCAL request.jwt.claims TO '{"sub":"b1111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.billing_secrets) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: admin puede leer billing_secrets desde el cliente';
  END IF;
END $$;

ROLLBACK;
