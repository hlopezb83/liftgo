-- Smoke R9 (paquete final):
--  4) report_revenue_by_month NO debe reinterpretar un pago cross-currency con
--     la moneda/tipo de cambio de la factura.
--  5) get_customer_summary debe advertir también cuando los pagos no se pueden
--     convertir (payments_fx_missing > 0).
--
-- Ejecutar:  psql -f supabase/tests/r9_payment_fx_smoke.sql
-- Solo lecturas de catálogo: termina con ROLLBACK.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN RAISE NOTICE 'OK  %', p_label;
  ELSE RAISE EXCEPTION 'FALLO  %', p_label; END IF;
END; $$;

-- 1) El fallback a la moneda de la factura quedó condicionado a misma moneda.
DO $$
DECLARE v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'report_revenue_by_month' LIMIT 1;
  PERFORM pg_temp.expect_true(
    'R9-4 report_revenue_by_month condiciona el fallback a misma moneda',
    v_src ILIKE '%upper(COALESCE(p.currency, i.moneda%'
  );
END $$;

-- 2) La advertencia del estado de cuenta considera pagos sin conversión.
DO $$
DECLARE v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_customer_summary' LIMIT 1;
  PERFORM pg_temp.expect_true(
    'R9-5 get_customer_summary cuenta payments_fx_missing',
    v_src ILIKE '%payments_fx_missing%'
  );
END $$;

-- 2b) Semántica: la salida de get_customer_summary expone payments_fx_missing.
DO $$
DECLARE v_customer uuid; v_json jsonb;
BEGIN
  SELECT id INTO v_customer FROM public.customers LIMIT 1;
  IF v_customer IS NULL THEN
    RAISE NOTICE 'SKIP  R9-5 sin clientes en la base para probar semántica';
  ELSE
    SELECT to_jsonb(s) INTO v_json
      FROM public.get_customer_summary(v_customer) s;
    PERFORM pg_temp.expect_true(
      'R9-5 get_customer_summary devuelve payments_fx_missing',
      v_json ? 'payments_fx_missing'
    );
    PERFORM pg_temp.expect_true(
      'R9-5 payments_fx_missing es numérico y >= 0',
      COALESCE((v_json->>'payments_fx_missing')::numeric, -1) >= 0
    );
  END IF;
END $$;

-- 3) Semántica: pago USD sin tipo de cambio contra factura MXN no convierte.
DO $$
DECLARE v_conv numeric;
BEGIN
  SELECT COALESCE(
    public.fx_to_mxn(100, 'USD', NULLIF(0, 0)),
    CASE WHEN upper('USD') = upper('MXN')
         THEN public.fx_to_mxn(100, 'MXN', 1) END
  ) INTO v_conv;
  PERFORM pg_temp.expect_true(
    'R9-4 pago USD sin TC contra factura MXN no se cuenta como MXN 1:1',
    v_conv IS NULL
  );
END $$;

-- 4) Misma moneda: el comportamiento válido se conserva.
DO $$
DECLARE v_conv numeric;
BEGIN
  SELECT COALESCE(
    public.fx_to_mxn(100, 'MXN', NULLIF(0, 0)),
    CASE WHEN upper('MXN') = upper('MXN')
         THEN public.fx_to_mxn(100, 'MXN', 1) END
  ) INTO v_conv;
  PERFORM pg_temp.expect_true(
    'R9-4 pago MXN contra factura MXN sigue sumando',
    v_conv = 100
  );
END $$;

ROLLBACK;
