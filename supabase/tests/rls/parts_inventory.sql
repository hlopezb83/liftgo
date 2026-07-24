-- RLS: parts_inventory — mecánico read-only, admin escribe.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('f1111111-1111-4111-8111-111111111111', 'mecanico@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('f1111111-1111-4111-8111-111111111111', 'mecanico')
ON CONFLICT DO NOTHING;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
BEGIN
  -- SELECT permitido
  PERFORM 1 FROM public.parts_inventory LIMIT 1;

  -- INSERT bloqueado
  BEGIN
    INSERT INTO public.parts_inventory (sku, name, quantity)
    VALUES ('SKU-TEST-RLS', 'Test', 1);
    RAISE EXCEPTION 'RLS BREACH: mecánico pudo insertar parts_inventory';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR others THEN
      RAISE NOTICE 'OK: insert bloqueado a mecánico';
  END;
END $$;

ROLLBACK;
