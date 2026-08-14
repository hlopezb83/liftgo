-- RLS: quotes (back-office) — complemento de quotes_portal.sql.
-- Ventas/administrativo/admin escriben; dispatcher, mecánico y auditor solo leen;
-- el cliente del portal solo ve las suyas y no puede alterar precios; anon sin acceso.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('40000009-0000-4000-8000-000000000001', 'ventas.qb@test.local', now(), now()),
  ('40000009-0000-4000-8000-000000000002', 'mecanico.qb@test.local', now(), now()),
  ('40000009-0000-4000-8000-000000000003', 'auditor.qb@test.local', now(), now()),
  ('40000009-0000-4000-8000-000000000004', 'cliente.qb@test.local', now(), now()),
  ('40000009-0000-4000-8000-000000000005', 'dispatcher.qb@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('40000009-0000-4000-8000-000000000001', 'ventas'),
  ('40000009-0000-4000-8000-000000000002', 'mechanic'),
  ('40000009-0000-4000-8000-000000000003', 'auditor'),
  ('40000009-0000-4000-8000-000000000004', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.customers (id, name, user_id) VALUES
  ('40000009-0000-4000-8000-0000000000c1', 'Cliente QB', '40000009-0000-4000-8000-000000000004'),
  ('40000009-0000-4000-8000-0000000000c2', 'Otro Cliente QB', NULL);

INSERT INTO public.quotes (id, customer_id, quote_number, status, subtotal, tax_amount, total) VALUES
  ('40000009-0000-4000-8000-0000000000e1', '40000009-0000-4000-8000-0000000000c1',
   'COT-QB-1', 'draft', 1000, 160, 1160),
  ('40000009-0000-4000-8000-0000000000e2', '40000009-0000-4000-8000-0000000000c2',
   'COT-QB-2', 'draft', 2000, 320, 2320);

-- 1) anon: sin acceso al pipeline comercial.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.quotes) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee quotes';
  END IF;
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: solo la suya y sin poder cambiar el precio.
SET LOCAL request.jwt.claims TO '{"sub":"40000009-0000-4000-8000-000000000004","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.quotes) <> 1 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente ve % cotizaciones (esperado 1)',
      (SELECT COUNT(*) FROM public.quotes);
  END IF;

  BEGIN
    UPDATE public.quotes SET total = 1
     WHERE id = '40000009-0000-4000-8000-0000000000e1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: el cliente del portal cambio el total de su cotizacion';
  END IF;
  RAISE NOTICE 'OK: cliente del portal solo lee su cotizacion';
END $$;

-- 3) Mecánico: lectura de referencia, sin escritura.
SET LOCAL request.jwt.claims TO '{"sub":"40000009-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_rows int; v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.quotes) < 2 THEN
    RAISE EXCEPTION 'RLS ROTA: mecanico deberia leer quotes';
  END IF;

  BEGIN
    INSERT INTO public.quotes (customer_id, quote_number, status, subtotal, tax_amount, total)
    VALUES ('40000009-0000-4000-8000-0000000000c1', 'COT-QB-HACK', 'draft', 1, 0, 1);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: mecanico pudo crear una cotizacion';
  END IF;

  BEGIN
    UPDATE public.quotes SET status = 'accepted'
     WHERE id = '40000009-0000-4000-8000-0000000000e1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: mecanico pudo aceptar una cotizacion';
  END IF;
  RAISE NOTICE 'OK: mecanico es de solo lectura en quotes';
END $$;

-- 4) Auditor: lectura sin escritura.
SET LOCAL request.jwt.claims TO '{"sub":"40000009-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.quotes) < 2 THEN
    RAISE EXCEPTION 'RLS ROTA: auditor deberia leer quotes';
  END IF;

  BEGIN
    DELETE FROM public.quotes WHERE id = '40000009-0000-4000-8000-0000000000e2';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: auditor pudo borrar una cotizacion';
  END IF;
  RAISE NOTICE 'OK: auditor es de solo lectura en quotes';
END $$;

-- 5) Ventas: acceso completo (es su módulo).
SET LOCAL request.jwt.claims TO '{"sub":"40000009-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  INSERT INTO public.quotes (customer_id, quote_number, status, subtotal, tax_amount, total)
  VALUES ('40000009-0000-4000-8000-0000000000c1', 'COT-QB-3', 'draft', 500, 80, 580);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia poder crear cotizaciones';
  END IF;

  UPDATE public.quotes SET subtotal = 1500
   WHERE id = '40000009-0000-4000-8000-0000000000e1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia poder editar cotizaciones';
  END IF;
  RAISE NOTICE 'OK: ventas administra quotes';
END $$;

ROLLBACK;
