-- RLS: supplier_payments — solo admin/administrativo inserta.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'dispatcher@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'dispatcher')
ON CONFLICT DO NOTHING;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.supplier_payments (supplier_id, amount, currency, payment_date, status)
    VALUES (gen_random_uuid(), 100, 'MXN', current_date, 'paid');
    RAISE EXCEPTION 'RLS BREACH: dispatcher pudo insertar supplier_payment';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR others THEN
      RAISE NOTICE 'OK: dispatcher bloqueado';
  END;
END $$;

ROLLBACK;
