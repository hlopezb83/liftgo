-- RLS: supplier_payment_batches y supplier_payment_batch_items — lotes de pago a proveedores.
-- Estado esperado tras el endurecimiento (v7.299.0): las policies FOR ALL con TO PUBLIC
-- se dividieron en operaciones explícitas restringidas a `authenticated` y a
-- admin/administrativo. Contienen CLABE y datos bancarios: nadie más los ve.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('f3333333-3333-4333-8333-333333333301', 'admin.spb@test.local', now(), now()),
  ('f3333333-3333-4333-8333-333333333302', 'administrativo.spb@test.local', now(), now()),
  ('f3333333-3333-4333-8333-333333333303', 'auditor.spb@test.local', now(), now()),
  ('f3333333-3333-4333-8333-333333333304', 'mecanico.spb@test.local', now(), now()),
  ('f3333333-3333-4333-8333-333333333305', 'cliente.spb@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('f3333333-3333-4333-8333-333333333301', 'admin'),
  ('f3333333-3333-4333-8333-333333333302', 'administrativo'),
  ('f3333333-3333-4333-8333-333333333303', 'auditor'),
  ('f3333333-3333-4333-8333-333333333304', 'mechanic'),
  ('f3333333-3333-4333-8333-333333333305', 'customer')
ON CONFLICT DO NOTHING;

INSERT INTO public.supplier_payment_batches (id, total_amount, bill_count, currency, notes) VALUES
  ('f3333333-3333-4333-8333-3333333333b1', 5000, 1, 'MXN', 'Lote RLS');

INSERT INTO public.supplier_payment_batch_items
  (id, batch_id, supplier_name, clabe, bill_number, reference, amount) VALUES
  ('f3333333-3333-4333-8333-3333333333i1', 'f3333333-3333-4333-8333-3333333333b1',
   'Proveedor RLS', '012180000000000001', 'FAC-RLS-1', 'REF-RLS-1', 5000);

-- 1) anon: los datos bancarios jamás salen sin sesión.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_payment_batches) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee supplier_payment_batches';
  END IF;
  IF (SELECT COUNT(*) FROM public.supplier_payment_batch_items) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee CLABEs en supplier_payment_batch_items';
  END IF;
  RAISE NOTICE 'OK: anon sin acceso a lotes de pago';
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: sin acceso a la tesorería.
SET LOCAL request.jwt.claims TO '{"sub":"f3333333-3333-4333-8333-333333333305","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_payment_batches) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee supplier_payment_batches';
  END IF;
  IF (SELECT COUNT(*) FROM public.supplier_payment_batch_items) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee CLABEs de proveedores';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a lotes de pago';
END $$;

-- 3) Mecánico y auditor: fuera del módulo financiero.
SET LOCAL request.jwt.claims TO '{"sub":"f3333333-3333-4333-8333-333333333304","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_payment_batches) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: mecanico lee supplier_payment_batches';
  END IF;
  RAISE NOTICE 'OK: mecanico sin acceso a lotes de pago';
END $$;

SET LOCAL request.jwt.claims TO '{"sub":"f3333333-3333-4333-8333-333333333303","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_payment_batch_items) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: auditor lee CLABEs de supplier_payment_batch_items';
  END IF;

  BEGIN
    INSERT INTO public.supplier_payment_batches (total_amount, bill_count)
    VALUES (1, 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: auditor creo un lote de pago';
  END IF;
  RAISE NOTICE 'OK: auditor sin acceso a lotes de pago';
END $$;

-- 4) Administrativo: opera la tesorería.
SET LOCAL request.jwt.claims TO '{"sub":"f3333333-3333-4333-8333-333333333302","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_payment_batches) < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: administrativo deberia leer supplier_payment_batches';
  END IF;
  IF (SELECT COUNT(*) FROM public.supplier_payment_batch_items) < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: administrativo deberia leer supplier_payment_batch_items';
  END IF;

  INSERT INTO public.supplier_payment_batches (id, total_amount, bill_count, notes)
  VALUES ('f3333333-3333-4333-8333-3333333333b2', 800, 1, 'Lote RLS 2');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: administrativo deberia poder crear lotes';
  END IF;

  INSERT INTO public.supplier_payment_batch_items
    (batch_id, supplier_name, bill_number, reference, amount)
  VALUES ('f3333333-3333-4333-8333-3333333333b2', 'Proveedor RLS 2', 'FAC-RLS-2', 'REF-RLS-2', 800);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: administrativo deberia poder agregar partidas al lote';
  END IF;

  UPDATE public.supplier_payment_batches SET notes = 'Lote RLS editado'
   WHERE id = 'f3333333-3333-4333-8333-3333333333b1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: administrativo deberia poder editar lotes';
  END IF;
  RAISE NOTICE 'OK: administrativo administra lotes de pago';
END $$;

-- 5) Admin: puede borrar lotes y partidas.
SET LOCAL request.jwt.claims TO '{"sub":"f3333333-3333-4333-8333-333333333301","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  DELETE FROM public.supplier_payment_batch_items
   WHERE batch_id = 'f3333333-3333-4333-8333-3333333333b2';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: admin deberia poder borrar partidas del lote';
  END IF;

  DELETE FROM public.supplier_payment_batches
   WHERE id = 'f3333333-3333-4333-8333-3333333333b2';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: admin deberia poder borrar lotes';
  END IF;
  RAISE NOTICE 'OK: admin borra lotes de pago';
END $$;

-- 6) service_role: bypass total de RLS.
RESET ROLE;
SET LOCAL role = 'service_role';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_payment_batches) < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: service_role deberia ver los lotes de pago';
  END IF;
  RAISE NOTICE 'OK: service_role ve todos los lotes de pago';
END $$;

RESET ROLE;
ROLLBACK;
