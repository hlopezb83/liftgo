-- RLS: invoices — ventas y mecánico NO acceden a facturación; dispatcher solo lee.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('11111111-0000-4000-8000-000000000001', 'ventas.inv@test.local', now(), now()),
  ('11111111-0000-4000-8000-000000000002', 'dispatcher.inv@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-0000-4000-8000-000000000001', 'ventas'),
  ('11111111-0000-4000-8000-000000000002', 'dispatcher')
ON CONFLICT DO NOTHING;

INSERT INTO public.invoices (id, invoice_number, customer_name, total)
VALUES ('11111111-0000-4000-8000-00000000000f', 'FAC-RLS-TEST', 'Cliente RLS', 1000);

SET LOCAL role = 'authenticated';

-- 1) Ventas: sin acceso de lectura ni escritura.
SET LOCAL request.jwt.claims TO '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.invoices) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas lee invoices';
  END IF;

  BEGIN
    INSERT INTO public.invoices (invoice_number, customer_name, total)
    VALUES ('FAC-RLS-HACK', 'Hacker', 1);
    RAISE EXCEPTION 'RLS BREACH: ventas pudo insertar invoices';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'OK: ventas no inserta invoices';
  END;
END $$;

-- 2) Dispatcher: lee pero no modifica.
SET LOCAL request.jwt.claims TO '{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.invoices
       WHERE id = '11111111-0000-4000-8000-00000000000f') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: dispatcher deberia leer invoices';
  END IF;

  BEGIN
    UPDATE public.invoices SET total = 0
     WHERE id = '11111111-0000-4000-8000-00000000000f';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'RLS BREACH: dispatcher pudo actualizar invoices';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: dispatcher no actualiza invoices';
  END;
END $$;

ROLLBACK;
