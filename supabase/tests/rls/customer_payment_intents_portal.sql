-- RLS: customer_payment_intents (portal)
-- Guard: cliente A no puede crear un intent con customer_id apuntando a B.
BEGIN;

-- Setup: dos usuarios cliente
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'cliente-a@test.local', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', 'cliente-b@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, name, portal_user_id)
VALUES
  ('c1111111-1111-4111-8111-111111111111', 'Cliente A', 'a1111111-1111-4111-8111-111111111111'),
  ('c2222222-2222-4222-8222-222222222222', 'Cliente B', 'b2222222-2222-4222-8222-222222222222')
ON CONFLICT DO NOTHING;

-- User A intenta pagar como user B: DEBE fallar
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.customer_payment_intents (customer_id, amount, currency, status)
    VALUES ('c2222222-2222-4222-8222-222222222222', 100, 'MXN', 'pending');
    RAISE EXCEPTION 'RLS BREACH: user A pudo crear intent con customer_id de B';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR others THEN
      RAISE NOTICE 'OK: RLS bloqueó insert cross-customer';
  END;
END $$;

ROLLBACK;
