-- RLS: quotes (portal read)
-- Guard: cliente A NO ve cotizaciones de cliente B.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'a@test.local', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', 'b@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, name, portal_user_id) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'A', 'a1111111-1111-4111-8111-111111111111'),
  ('c2222222-2222-4222-8222-222222222222', 'B', 'b2222222-2222-4222-8222-222222222222')
ON CONFLICT DO NOTHING;

INSERT INTO public.quotes (id, customer_id, quote_number, status, total, subtotal, tax_amount)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'COT-A-1', 'draft', 100, 100, 0),
  ('22222222-2222-4222-8222-222222222222', 'c2222222-2222-4222-8222-222222222222', 'COT-B-1', 'draft', 100, 100, 0)
ON CONFLICT DO NOTHING;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  visible_count INT;
BEGIN
  SELECT COUNT(*) INTO visible_count FROM public.quotes
   WHERE id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: user A ve % cotizaciones (esperado 1)', visible_count;
  END IF;
END $$;

ROLLBACK;
