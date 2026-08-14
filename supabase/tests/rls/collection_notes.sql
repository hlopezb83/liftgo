-- RLS: collection_notes — notas de cobranza. Admin/administrativo full;
-- dispatcher y auditor solo lectura; ventas, mecánico, cliente del portal y anon sin acceso.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('c0000006-0000-4000-8000-000000000001', 'administrativo.cn@test.local', now(), now()),
  ('c0000006-0000-4000-8000-000000000002', 'auditor.cn@test.local', now(), now()),
  ('c0000006-0000-4000-8000-000000000003', 'ventas.cn@test.local', now(), now()),
  ('c0000006-0000-4000-8000-000000000004', 'cliente.cn@test.local', now(), now()),
  ('c0000006-0000-4000-8000-000000000005', 'dispatcher.cn@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('c0000006-0000-4000-8000-000000000001', 'administrativo'),
  ('c0000006-0000-4000-8000-000000000002', 'auditor'),
  ('c0000006-0000-4000-8000-000000000003', 'ventas'),
  ('c0000006-0000-4000-8000-000000000004', 'customer'),
  ('c0000006-0000-4000-8000-000000000005', 'dispatcher')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.customers (id, name, user_id) VALUES
  ('c0000006-0000-4000-8000-0000000000c1', 'Cliente CN', 'c0000006-0000-4000-8000-000000000004');

INSERT INTO public.invoices (id, invoice_number, customer_id, customer_name, subtotal, tax_amount, total) VALUES
  ('c0000006-0000-4000-8000-0000000000b1', 'FAC-CN-1',
   'c0000006-0000-4000-8000-0000000000c1', 'Cliente CN', 1000, 0, 1000);

INSERT INTO public.collection_notes (id, invoice_id, note) VALUES
  ('c0000006-0000-4000-8000-0000000000a1', 'c0000006-0000-4000-8000-0000000000b1',
   'El cliente promete pago el viernes');

-- 1) anon: sin acceso.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.collection_notes) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee collection_notes';
  END IF;
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: jamás debe leer lo que cobranza anota sobre él.
SET LOCAL request.jwt.claims TO '{"sub":"c0000006-0000-4000-8000-000000000004","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.collection_notes) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee notas de cobranza sobre si mismo';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a collection_notes';
END $$;

-- 3) Ventas: sin acceso a cobranza.
SET LOCAL request.jwt.claims TO '{"sub":"c0000006-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.collection_notes) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas lee collection_notes';
  END IF;

  BEGIN
    INSERT INTO public.collection_notes (invoice_id, note)
    VALUES ('c0000006-0000-4000-8000-0000000000b1', 'nota de ventas');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: ventas pudo crear notas de cobranza';
  END IF;
  RAISE NOTICE 'OK: ventas sin acceso a collection_notes';
END $$;

-- 4) Auditor: lectura sin escritura.
SET LOCAL request.jwt.claims TO '{"sub":"c0000006-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.collection_notes
       WHERE id = 'c0000006-0000-4000-8000-0000000000a1') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: auditor deberia leer collection_notes';
  END IF;

  BEGIN
    UPDATE public.collection_notes SET note = 'alterada'
     WHERE id = 'c0000006-0000-4000-8000-0000000000a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: auditor pudo alterar una nota de cobranza';
  END IF;
  RAISE NOTICE 'OK: auditor es de solo lectura en collection_notes';
END $$;

-- 5) Administrativo: acceso completo.
SET LOCAL request.jwt.claims TO '{"sub":"c0000006-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  INSERT INTO public.collection_notes (invoice_id, note)
  VALUES ('c0000006-0000-4000-8000-0000000000b1', 'Seguimiento administrativo');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: administrativo deberia poder crear notas de cobranza';
  END IF;
  RAISE NOTICE 'OK: administrativo administra collection_notes';
END $$;

-- 6) Dispatcher: solo lectura (v7.320.4) — no puede crear ni alterar notas de cobranza.
SET LOCAL request.jwt.claims TO '{"sub":"c0000006-0000-4000-8000-000000000005","role":"authenticated"}';

DO $$
DECLARE v_rows int; v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.collection_notes
       WHERE id = 'c0000006-0000-4000-8000-0000000000a1') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: dispatcher deberia leer collection_notes';
  END IF;

  BEGIN
    INSERT INTO public.collection_notes (invoice_id, note)
    VALUES ('c0000006-0000-4000-8000-0000000000b1', 'nota del dispatcher');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: dispatcher pudo crear notas de cobranza';
  END IF;

  BEGIN
    UPDATE public.collection_notes SET note = 'alterada por dispatcher'
     WHERE id = 'c0000006-0000-4000-8000-0000000000a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: dispatcher pudo alterar notas de cobranza';
  END IF;
  RAISE NOTICE 'OK: dispatcher es de solo lectura en collection_notes';
END $$;

ROLLBACK;
