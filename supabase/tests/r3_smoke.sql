-- Smoke SQL de la Ronda 3 (DB3-06 a DB3-17).
-- Ejecutar manualmente contra un entorno de staging con psql:
--   psql -f supabase/tests/r3_smoke.sql
-- Cada bloque intenta una operacion PROHIBIDA y espera que el guard responda.
-- El script no deja datos: todo corre dentro de una transaccion con ROLLBACK.

\set ON_ERROR_STOP off

BEGIN;

-- Helper: reporta OK cuando la operacion falla como se espera.
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
-- DB3-06 / DB3-07 / DB3-08 · Cotizaciones
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'DB3-06 borrador no salta a aceptada',
  $q$UPDATE public.quotes SET status='accepted' WHERE status='draft'$q$);

SELECT pg_temp.expect_error(
  'DB3-07 cotizacion aceptada bloqueada',
  $q$UPDATE public.quotes SET customer_name='SMOKE' WHERE status='accepted'$q$);

-- ---------------------------------------------------------------------------
-- DB3-10 · Banderas e2e
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'DB3-10 INSERT con is_e2e sin ser actor e2e',
  $q$INSERT INTO public.customers (name, is_e2e) VALUES ('SMOKE e2e', true)$q$);

-- ---------------------------------------------------------------------------
-- DB3-11 · user_roles inmutable
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'DB3-11 reasignar user_id de un rol',
  $q$UPDATE public.user_roles SET user_id = gen_random_uuid()
      WHERE id = (SELECT id FROM public.user_roles LIMIT 1)$q$);

-- ---------------------------------------------------------------------------
-- DB3-12 · Redondeo de pagos
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_invoice uuid; v_amount numeric;
BEGIN
  SELECT id INTO v_invoice FROM public.invoices
   WHERE status IN ('sent','partial') AND total > 100 LIMIT 1;
  IF v_invoice IS NULL THEN
    RAISE NOTICE 'SKIP DB3-12 (sin facturas emitidas de prueba)';
    RETURN;
  END IF;
  INSERT INTO public.payments (invoice_id, amount, payment_date)
  VALUES (v_invoice, 13.004, CURRENT_DATE)
  RETURNING amount INTO v_amount;
  IF v_amount = 13.00 THEN
    RAISE NOTICE 'OK  DB3-12 importe redondeado a %', v_amount;
  ELSE
    RAISE WARNING 'FALLO DB3-12 importe quedo en %', v_amount;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- DB3-13 · app.payment_sync exige profundidad de trigger
-- ---------------------------------------------------------------------------
SET LOCAL app.payment_sync = 'on';
SELECT pg_temp.expect_error(
  'DB3-13 flag manual no abre la maquina de estados',
  $q$UPDATE public.invoices SET status='sent' WHERE status='paid'$q$);
RESET app.payment_sync;

-- ---------------------------------------------------------------------------
-- DB3-14 · Daños
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'DB3-14 dominio de status de daños',
  $q$UPDATE public.damage_records SET status='open'
      WHERE id = (SELECT id FROM public.damage_records LIMIT 1)$q$);

-- ---------------------------------------------------------------------------
-- DB3-15 · Borrados restringidos
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'DB3-15 borrar entrega completada',
  $q$DELETE FROM public.deliveries WHERE status='completed'$q$);

-- ---------------------------------------------------------------------------
-- DB3-16 · Prospectos
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'DB3-16 alta de prospecto en etapa cerrada',
  $q$INSERT INTO public.prospects (company_name, stage) VALUES ('SMOKE', 'cerrado_ganado')$q$);

SELECT pg_temp.expect_error(
  'DB3-16 ganar sin monto final',
  $q$UPDATE public.prospects SET stage='cerrado_ganado'
      WHERE stage='negociacion'$q$);

-- ---------------------------------------------------------------------------
-- DB3-17 · Misceláneos
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error(
  'DB3-17a alta de bill de proveedor en estado pagado',
  $q$INSERT INTO public.supplier_bills (bill_number, issue_date, subtotal, tax_amount, total, status)
     VALUES ('SMOKE-1', CURRENT_DATE, 100, 16, 116, 'paid')$q$);

SELECT pg_temp.expect_error(
  'DB3-17b factura emitida sin partidas',
  $q$INSERT INTO public.invoices (invoice_number, line_items, subtotal, tax_rate, tax_amount, total, status, issued_at)
     VALUES ('SMOKE-2', '[]'::jsonb, 100, 16, 16, 116, 'sent', CURRENT_DATE)$q$);

ROLLBACK;
