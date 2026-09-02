-- Smoke SQL de la Ronda 4 (DB4-01 a DB4-08).
-- Ejecutar manualmente contra un entorno de staging con psql:
--   psql -f supabase/tests/r4_smoke.sql
-- Cada bloque intenta una operacion PROHIBIDA y espera que el guard responda,
-- o ejecuta un caso feliz y verifica el efecto colateral esperado.
-- El script no deja datos: todo corre dentro de una transaccion con ROLLBACK.

\set ON_ERROR_STOP off

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_label text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_rows bigint;
BEGIN
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      -- Sin datos que tocar (DB recien migrada en CI): el guard no puede opinar.
      RAISE NOTICE 'SKIP %  (0 filas afectadas: sin datos de prueba)', p_label;
    ELSE
      RAISE WARNING 'FALLO (no hubo error): %', p_label;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK  %  ->  %', p_label, SQLERRM;
  END;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_ok(p_label text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE NOTICE 'OK  %', p_label;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FALLO (error inesperado): %  ->  %', p_label, SQLERRM;
  END;
END; $$;

-- ---------------------------------------------------------------------------
-- DB4-01 · supplier_bills no puede nacer aprobada ni rechazada
-- Los guards (set_supplier_bill_approval_status / guard_supplier_bill_approval)
-- delegan cuando NO hay JWT (service_role / cron / psql directo). Por eso el
-- caso se simula con un JWT de usuario autenticado, igual que DB4-08d.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', gen_random_uuid())::text, true);

  PERFORM pg_temp.expect_error(
    'DB4-01a alta de bill pre-aprobada',
    $q$INSERT INTO public.supplier_bills
         (bill_number, issue_date, subtotal, tax_amount, total, status, approval_status)
       VALUES ('SMOKE-R4-1', public.today_mty(), 100, 16, 116, 'pending', 'approved')$q$);

  PERFORM pg_temp.expect_error(
    'DB4-01b alta de bill pre-rechazada',
    $q$INSERT INTO public.supplier_bills
         (bill_number, issue_date, subtotal, tax_amount, total, status, approval_status)
       VALUES ('SMOKE-R4-2', public.today_mty(), 100, 16, 116, 'pending', 'rejected')$q$);

  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;


-- ---------------------------------------------------------------------------
-- DB4-02 · damage_records nace en 'reported' y valida la unidad de la reserva
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_forklift uuid; v_status text; v_ok boolean := false;
BEGIN
  SELECT id INTO v_forklift FROM public.forklifts WHERE deleted_at IS NULL LIMIT 1;
  IF v_forklift IS NULL THEN
    RAISE NOTICE 'SKIP DB4-02 (sin montacargas)';
    RETURN;
  END IF;
  -- El guard delega cuando no hay rol en el JWT (service_role / backend), así
  -- que se simula un operador autenticado.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', gen_random_uuid())::text, true);
  BEGIN
    INSERT INTO public.damage_records (forklift_id, description, status)
    VALUES (v_forklift, 'SMOKE R4 estado inicial', 'repaired')
    RETURNING status INTO v_status;
  EXCEPTION WHEN OTHERS THEN
    v_ok := true;
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF v_ok THEN
    RAISE NOTICE 'OK  DB4-02a el daño no puede nacer fuera de reported';
  ELSE
    RAISE WARNING 'FALLO DB4-02a daño nacio en %', v_status;
  END IF;
END $$;

-- Canon vigente: no existe guard que ate el montacargas del daño al de la
-- reserva; lo que sí se valida es que la factura ligada sea del mismo cliente
-- (guard_damage_record_invoice).
DO $$
DECLARE v_forklift uuid; v_cust_a uuid; v_cust_b uuid; v_inv uuid;
BEGIN
  SELECT id INTO v_forklift FROM public.forklifts WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_cust_a FROM public.customers ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cust_b FROM public.customers WHERE id <> v_cust_a LIMIT 1;
  SELECT id INTO v_inv FROM public.invoices WHERE customer_id = v_cust_b LIMIT 1;
  IF v_forklift IS NULL OR v_cust_a IS NULL OR v_inv IS NULL THEN
    RAISE NOTICE 'SKIP DB4-02b (faltan unidades, clientes o facturas)';
    RETURN;
  END IF;
  PERFORM pg_temp.expect_error(
    'DB4-02b daño facturado a un cliente distinto',
    format($q$INSERT INTO public.damage_records (forklift_id, customer_id, invoice_id, description, status)
              VALUES (%L, %L, %L, 'SMOKE R4 factura ajena', 'reported')$q$,
           v_forklift, v_cust_a, v_inv));
END $$;

-- ---------------------------------------------------------------------------
-- DB4-03 · Auditoria de banderas e2e forzadas
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'DB4-03 INSERT con is_e2e sin ser actor autorizado',
  $q$INSERT INTO public.customers (name, is_e2e) VALUES ('SMOKE R4 e2e', true)$q$);

-- ---------------------------------------------------------------------------
-- DB4-04 · La unidad se libera al cancelar la reserva
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_booking uuid; v_forklift uuid; v_status text;
BEGIN
  SELECT b.id, b.forklift_id INTO v_booking, v_forklift
    FROM public.bookings b
    JOIN public.forklifts f ON f.id = b.forklift_id
   WHERE b.status = 'confirmed' AND f.status = 'rented'
   LIMIT 1;
  IF v_booking IS NULL THEN
    RAISE NOTICE 'SKIP DB4-04 (sin reservas confirmadas con unidad rentada)';
    RETURN;
  END IF;
  UPDATE public.bookings SET status = 'cancelled' WHERE id = v_booking;
  SELECT status INTO v_status FROM public.forklifts WHERE id = v_forklift;
  IF v_status = 'available' THEN
    RAISE NOTICE 'OK  DB4-04 unidad liberada al cancelar (%)', v_status;
  ELSE
    RAISE WARNING 'FALLO DB4-04 unidad quedo en %', v_status;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- DB4-05 · Al reparar, la unidad vuelve a mantenimiento si hay ordenes abiertas
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_forklift uuid; v_result text;
BEGIN
  SELECT m.forklift_id INTO v_forklift
    FROM public.maintenance_logs m
   WHERE m.deleted_at IS NULL AND m.work_status <> 'completed'
   LIMIT 1;
  IF v_forklift IS NULL THEN
    RAISE NOTICE 'SKIP DB4-05 (sin ordenes de mantenimiento abiertas)';
    RETURN;
  END IF;
  v_result := public.damage_restore_forklift_status(v_forklift, 'available');
  IF v_result = 'maintenance' THEN
    RAISE NOTICE 'OK  DB4-05 unidad con orden abierta regresa a %', v_result;
  ELSE
    RAISE WARNING 'FALLO DB4-05 unidad regreso a %', v_result;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- DB4-06 · Columnas fiscales de invoices restringidas
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_priv boolean;
BEGIN
  SELECT has_column_privilege('authenticated', 'public.invoices', 'cfdi_uuid', 'UPDATE')
    INTO v_priv;
  IF v_priv THEN
    RAISE WARNING 'FALLO DB4-06 authenticated aun puede actualizar cfdi_uuid';
  ELSE
    RAISE NOTICE 'OK  DB4-06 columnas fiscales revocadas para authenticated';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- DB4-08 (a,b) · Cotizaciones y contratos
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'DB4-08b contrato sin unidad no puede firmarse',
  $q$UPDATE public.contracts SET status='signed'
      WHERE forklift_id IS NULL AND status IN ('draft','sent')$q$);

-- ---------------------------------------------------------------------------
-- DB4-08 (c) · El balance de CxP no es editable a mano
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'DB4-08c editar balance de una bill a mano',
  $q$UPDATE public.supplier_bills SET balance = balance + 1
      WHERE status IN ('pending','partial','overdue')$q$);

DO $$
DECLARE v_bill uuid; v_balance numeric; v_expected numeric;
BEGIN
  SELECT id INTO v_bill FROM public.supplier_bills
   WHERE status IN ('pending','partial','overdue') LIMIT 1;
  IF v_bill IS NULL THEN
    RAISE NOTICE 'SKIP DB4-08c recalculo (sin bills abiertas)';
    RETURN;
  END IF;
  PERFORM public.recalc_supplier_bill(v_bill);
  SELECT b.balance,
         GREATEST(b.total - COALESCE((SELECT SUM(p.amount) FROM public.supplier_payments p
                                       WHERE p.bill_id = b.id), 0), 0)
    INTO v_balance, v_expected
    FROM public.supplier_bills b WHERE b.id = v_bill;
  IF v_balance = v_expected THEN
    RAISE NOTICE 'OK  DB4-08c recalculo deja balance en %', v_balance;
  ELSE
    RAISE WARNING 'FALLO DB4-08c balance % vs esperado %', v_balance, v_expected;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- DB4-08 (d) · INSERT directo de bookings solo para admin / RPC
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_forklift uuid;
BEGIN
  SELECT id INTO v_forklift FROM public.forklifts
   WHERE deleted_at IS NULL AND status = 'available' LIMIT 1;
  IF v_forklift IS NULL THEN
    RAISE NOTICE 'SKIP DB4-08d (sin unidades disponibles)';
    RETURN;
  END IF;
  -- Simula un usuario autenticado sin rol admin.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', gen_random_uuid())::text, true);
  PERFORM pg_temp.expect_error(
    'DB4-08d INSERT directo de reserva sin ser admin',
    format($q$INSERT INTO public.bookings
               (forklift_id, start_date, end_date, status, booking_number)
             VALUES (%L, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 'SMOKE-R4-BK')$q$,
           v_forklift));
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- ---------------------------------------------------------------------------
-- FIX-R4-01 · unassign: sold -> available permitido solo con app.forklift_rpc
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_forklift uuid;
  v_status text;
BEGIN
  SELECT id INTO v_forklift FROM public.forklifts
   WHERE deleted_at IS NULL AND status = 'available' LIMIT 1;
  IF v_forklift IS NULL THEN
    RAISE NOTICE 'SKIP FIX-R4-01 (sin unidades disponibles)';
    RETURN;
  END IF;

  -- Fixture: llegar a 'sold' sólo es posible por la vía canónica (RPC), así que
  -- se usa el mismo bypass que change_forklift_status / asignación de venta.
  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts SET status = 'sold' WHERE id = v_forklift;
  PERFORM set_config('app.forklift_rpc', 'off', true);

  -- Control negativo: SIN el flag, sold -> available debe seguir bloqueado.
  BEGIN
    UPDATE public.forklifts SET status = 'available' WHERE id = v_forklift;
    RAISE WARNING 'FALLO FIX-R4-01a (sold->available paso sin flag)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK  FIX-R4-01a sold->available bloqueado sin flag  ->  %', SQLERRM;
  END;

  -- Camino feliz: mismo bypass que usa unassign_forklift_from_sale_quote.
  PERFORM set_config('app.forklift_rpc', 'on', true);
  UPDATE public.forklifts SET status = 'available' WHERE id = v_forklift;
  SELECT status INTO v_status FROM public.forklifts WHERE id = v_forklift;
  IF v_status = 'available' THEN
    RAISE NOTICE 'OK  FIX-R4-01b camino feliz unassign (sold->available con app.forklift_rpc)';
  ELSE
    RAISE WARNING 'FALLO FIX-R4-01b (status=% tras unassign)', v_status;
  END IF;
  PERFORM set_config('app.forklift_rpc', 'off', true);
END $$;

ROLLBACK;
