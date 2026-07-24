-- RLS: return_inspections — dispatcher/admin escriben, ventas solo lee.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('a3333333-3333-4333-8333-333333333333', 'ventas-ri@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a3333333-3333-4333-8333-333333333333', 'ventas')
ON CONFLICT DO NOTHING;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.return_inspections (booking_id, notes, inspection_date)
    VALUES (gen_random_uuid(), 'Test RLS', current_date);
    RAISE EXCEPTION 'RLS BREACH: ventas pudo insertar return_inspection';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR foreign_key_violation OR others THEN
      RAISE NOTICE 'OK: insert bloqueado';
  END;
END $$;

ROLLBACK;
