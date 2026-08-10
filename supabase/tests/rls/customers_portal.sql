-- RLS: customers — aislamiento del portal y mecánico sin acceso al padrón.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('33333333-0000-4000-8000-000000000001', 'cliente.cust@test.local', now(), now()),
  ('33333333-0000-4000-8000-000000000002', 'mecanico.cust@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('33333333-0000-4000-8000-000000000001', 'customer'),
  ('33333333-0000-4000-8000-000000000002', 'mechanic')
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, name, user_id) VALUES
  ('33333333-0000-4000-8000-0000000000a1', 'Cliente Propio', '33333333-0000-4000-8000-000000000001'),
  ('33333333-0000-4000-8000-0000000000c1', 'Cliente Ajeno', NULL);

SET LOCAL role = 'authenticated';

-- 1) Cliente del portal: solo su propio registro.
SET LOCAL request.jwt.claims TO '{"sub":"33333333-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.customers WHERE id = '33333333-0000-4000-8000-0000000000c1') THEN
    RAISE EXCEPTION 'RLS BREACH: cliente ve el padrón de otros clientes';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = '33333333-0000-4000-8000-0000000000a1') THEN
    RAISE EXCEPTION 'RLS ROTA: cliente no ve su propio registro';
  END IF;

  BEGIN
    UPDATE public.customers SET name = 'Hackeado'
     WHERE id = '33333333-0000-4000-8000-0000000000a1';
    IF EXISTS (SELECT 1 FROM public.customers
                WHERE id = '33333333-0000-4000-8000-0000000000a1' AND name = 'Hackeado') THEN
      RAISE EXCEPTION 'RLS BREACH: cliente pudo editar su registro';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: cliente no edita customers';
  END;
END $$;

-- 2) Mecánico: sin acceso al padrón de clientes.
SET LOCAL request.jwt.claims TO '{"sub":"33333333-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.customers) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: mecánico lee customers';
  END IF;
END $$;

ROLLBACK;
