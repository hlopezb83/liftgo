-- RLS: payments — cliente del portal solo ve pagos de SUS facturas.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('22222222-0000-4000-8000-00000000000a', 'clienteA@test.local', now(), now()),
  ('22222222-0000-4000-8000-00000000000b', 'clienteB@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('22222222-0000-4000-8000-00000000000a', 'customer'),
  ('22222222-0000-4000-8000-00000000000b', 'customer')
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, name, user_id) VALUES
  ('22222222-0000-4000-8000-0000000000a1', 'Cliente A RLS', '22222222-0000-4000-8000-00000000000a'),
  ('22222222-0000-4000-8000-0000000000b1', 'Cliente B RLS', '22222222-0000-4000-8000-00000000000b');

INSERT INTO public.invoices (id, invoice_number, customer_id, customer_name, total) VALUES
  ('22222222-0000-4000-8000-0000000000a2', 'FAC-RLS-A', '22222222-0000-4000-8000-0000000000a1', 'Cliente A RLS', 500),
  ('22222222-0000-4000-8000-0000000000b2', 'FAC-RLS-B', '22222222-0000-4000-8000-0000000000b1', 'Cliente B RLS', 900);

INSERT INTO public.payments (id, invoice_id, amount) VALUES
  ('22222222-0000-4000-8000-0000000000a3', '22222222-0000-4000-8000-0000000000a2', 500),
  ('22222222-0000-4000-8000-0000000000b3', '22222222-0000-4000-8000-0000000000b2', 900);

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"22222222-0000-4000-8000-00000000000a","role":"authenticated"}';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments
              WHERE id = '22222222-0000-4000-8000-0000000000b3') THEN
    RAISE EXCEPTION 'RLS BREACH: cliente A ve pagos del cliente B';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payments
                  WHERE id = '22222222-0000-4000-8000-0000000000a3') THEN
    RAISE EXCEPTION 'RLS ROTA: cliente A no ve sus propios pagos';
  END IF;

  BEGIN
    INSERT INTO public.payments (invoice_id, amount)
    VALUES ('22222222-0000-4000-8000-0000000000a2', 1);
    RAISE EXCEPTION 'RLS BREACH: cliente pudo registrar un pago';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'OK: cliente no inserta pagos';
  END;
END $$;

ROLLBACK;
