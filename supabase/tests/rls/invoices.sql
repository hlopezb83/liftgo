-- RLS: invoices — ventas y mecánico NO acceden a facturación; dispatcher solo lee.
-- FIX-R2-04: chequeo de BREACH fuera del EXCEPTION handler; el handler solo
-- atrapa la denegación esperada (insufficient_privilege). Antes, WHEN others
-- tragaba el propio RAISE 'RLS BREACH' y la suite pasaba con la política rota.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('11111111-0000-4000-8000-000000000001', 'ventas.inv@test.local', now(), now()),
  ('11111111-0000-4000-8000-000000000002', 'dispatcher.inv@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-0000-4000-8000-000000000001', 'ventas'),
  ('11111111-0000-4000-8000-000000000002', 'dispatcher')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.invoices (id, invoice_number, customer_name, subtotal, tax_amount, total)
VALUES ('11111111-0000-4000-8000-00000000000f', 'FAC-RLS-TEST', 'Cliente RLS', 1000, 0, 1000);

SET LOCAL role = 'authenticated';

-- 1) Ventas: sin acceso de lectura ni escritura.
SET LOCAL request.jwt.claims TO '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.invoices) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas lee invoices';
  END IF;

  BEGIN
    INSERT INTO public.invoices (invoice_number, customer_name, subtotal, tax_amount, total)
    VALUES ('FAC-RLS-HACK', 'Hacker', 1, 0, 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  -- Fuera del handler: ningún EXCEPTION puede tragar este RAISE.
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: ventas pudo insertar invoices';
  END IF;
  RAISE NOTICE 'OK: ventas no inserta invoices';
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
  EXCEPTION WHEN insufficient_privilege THEN
    v_rows := 0; -- denegación esperada
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: dispatcher pudo actualizar invoices';
  END IF;
  RAISE NOTICE 'OK: dispatcher no actualiza invoices';
END $$;

ROLLBACK;
