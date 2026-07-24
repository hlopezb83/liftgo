-- RLS: damage_records — dispatcher/admin escriben, ventas solo lee.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('a4444444-4444-4444-8444-444444444444', 'ventas-dr@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a4444444-4444-4444-8444-444444444444', 'ventas')
ON CONFLICT DO NOTHING;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a4444444-4444-4444-8444-444444444444","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.damage_records (forklift_id, description, severity, status)
    VALUES (gen_random_uuid(), 'Test RLS', 'minor', 'open');
    RAISE EXCEPTION 'RLS BREACH: ventas pudo insertar damage_record';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR foreign_key_violation OR others THEN
      RAISE NOTICE 'OK: insert bloqueado';
  END;
END $$;

ROLLBACK;
