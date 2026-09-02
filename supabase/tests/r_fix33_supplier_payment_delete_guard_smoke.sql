-- Smoke del guard P0 de CxP:
--   trg_guard_supplier_payment_delete / public.guard_supplier_payment_delete()
--   impide borrar un pago a proveedor cuando el REP fiscal ya fue recibido,
--   cuando la factura de proveedor está cancelada, o cuando quien borra no es
--   administrador. Los procesos internos (sin sesión) y el sembrado E2E
--   conservan el comportamiento previo.
--
--   psql -f supabase/tests/r_fix33_supplier_payment_delete_guard_smoke.sql
-- Todo corre dentro de una transacción con ROLLBACK: no deja datos.

\set ON_ERROR_STOP off

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN
    RAISE NOTICE 'OK  %', p_label;
  ELSE
    RAISE WARNING 'FALLO  %', p_label;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.fndef(p_name text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'), '')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name;
$$;

-- ---------------------------------------------------------------------------
-- 1. Contrato del guard (catálogo)
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect_true(
  'existe el trigger BEFORE DELETE trg_guard_supplier_payment_delete',
  EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'supplier_payments'
      AND t.tgname = 'trg_guard_supplier_payment_delete'
      AND NOT t.tgisinternal
      AND (t.tgtype & 8) > 0   -- DELETE
      AND (t.tgtype & 2) > 0   -- BEFORE
  )
);

SELECT pg_temp.expect_true(
  'el guard conserva SET search_path = public',
  pg_temp.fndef('guard_supplier_payment_delete') ILIKE '%search_path%public%'
);

SELECT pg_temp.expect_true(
  'el guard usa (select auth.uid()) y has_role admin',
  pg_temp.fndef('guard_supplier_payment_delete') ILIKE '%select auth.uid()%'
  AND pg_temp.fndef('guard_supplier_payment_delete') ILIKE '%has_role%admin%'
);

SELECT pg_temp.expect_true(
  'el guard respeta el sembrado E2E y los procesos sin sesión',
  pg_temp.fndef('guard_supplier_payment_delete') ILIKE '%app.e2e_seed%'
  AND pg_temp.fndef('guard_supplier_payment_delete') ILIKE '%v_uid IS NULL%'
);

SELECT pg_temp.expect_true(
  'el estado fiscal protegido es exactamente received',
  pg_temp.fndef('guard_supplier_payment_delete') ILIKE '%rep_status = ''received''%'
);

-- ---------------------------------------------------------------------------
-- 2. Comportamiento real
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('a3333333-3333-4333-8333-333333333333', 'admin-cxp@test.local', now(), now()),
  ('b3333333-3333-4333-8333-333333333333', 'administrativo-cxp@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a3333333-3333-4333-8333-333333333333', 'admin'),
  ('b3333333-3333-4333-8333-333333333333', 'administrativo')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.suppliers (id, name)
VALUES ('c3333333-3333-4333-8333-333333333333', 'Proveedor smoke P0');

-- Factura vigente (permite borrar) y factura cancelada (bloquea).
INSERT INTO public.supplier_bills (id, supplier_id, bill_number, total, status)
VALUES
  ('d1111111-3333-4333-8333-333333333333', 'c3333333-3333-4333-8333-333333333333', 'SMOKE-P0-1', 10000, 'pending'),
  ('d2222222-3333-4333-8333-333333333333', 'c3333333-3333-4333-8333-333333333333', 'SMOKE-P0-2', 10000, 'pending');

-- Nota: hoy el estado "pago vivo sobre factura cancelada" ya no es alcanzable
-- (no se puede cancelar una factura con pagos ni pagar una cancelada), así que
-- esa rama del guard se verifica leyendo su definición, más abajo.

INSERT INTO public.supplier_payments (id, bill_id, amount, payment_date, rep_status) VALUES
  ('e1111111-3333-4333-8333-333333333333', 'd1111111-3333-4333-8333-333333333333', 1000, current_date, 'not_required'),
  ('e2222222-3333-4333-8333-333333333333', 'd1111111-3333-4333-8333-333333333333', 1000, current_date, 'received'),
  ('e4444444-3333-4333-8333-333333333333', 'd1111111-3333-4333-8333-333333333333', 1000, current_date, 'not_required');

-- 2.a administrativo NO puede borrar (regla admin-only, ahora en la base).
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"b3333333-3333-4333-8333-333333333333","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    DELETE FROM public.supplier_payments WHERE id = 'e4444444-3333-4333-8333-333333333333';
    RAISE WARNING 'FALLO  administrativo pudo borrar un pago a proveedor';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK  administrativo bloqueado (42501)';
  END;
END $$;

-- 2.b admin: bloqueos de negocio y borrado permitido.
SET LOCAL request.jwt.claims TO '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    DELETE FROM public.supplier_payments WHERE id = 'e2222222-3333-4333-8333-333333333333';
    RAISE WARNING 'FALLO  se borró un pago con REP recibido';
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE 'OK  REP recibido bloquea el borrado';
  END;
END $$;

-- Los rechazos dejan las filas intactas.
SELECT pg_temp.expect_true(
  'los pagos rechazados siguen existiendo',
  (SELECT count(*) FROM public.supplier_payments
    WHERE id IN ('e2222222-3333-4333-8333-333333333333',
                 'e4444444-3333-4333-8333-333333333333')) = 2
);

-- Borrado permitido: admin, sin REP recibido y factura vigente.
DELETE FROM public.supplier_payments WHERE id = 'e1111111-3333-4333-8333-333333333333';

SELECT pg_temp.expect_true(
  'admin sí puede borrar un pago elegible',
  NOT EXISTS (SELECT 1 FROM public.supplier_payments
               WHERE id = 'e1111111-3333-4333-8333-333333333333')
);

RESET role;

-- El recálculo de saldo de la factura (trg_sp_recalc_aiud) sigue corriendo:
-- quedan 2 pagos de 1000 sobre un total de 10000 → saldo 8000.
SELECT pg_temp.expect_true(
  'el borrado permitido recalcula el saldo de la factura',
  (SELECT balance FROM public.supplier_bills
    WHERE id = 'd1111111-3333-4333-8333-333333333333') = 8000
);

-- La rama de factura cancelada sigue viva en el guard aunque hoy sea
-- inalcanzable desde el flujo normal.
SELECT pg_temp.expect_true(
  'el guard conserva la rama de factura cancelada',
  (SELECT prosrc FROM pg_proc WHERE proname = 'guard_supplier_payment_delete') ILIKE '%cancelled%'
);

ROLLBACK;
