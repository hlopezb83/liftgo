-- Guard automatizado R9-09: ningún consumidor financiero puede inventar su
-- propia regla de tipo de cambio. La regla canónica vive en
-- `public.fx_is_missing` / `public.fx_to_mxn` / `public.fx_convert_amount`.
--
-- Ejecutar contra staging:  psql -f supabase/tests/r9_fx_canonical_guard.sql
-- Solo lecturas de catálogo: termina con ROLLBACK.

\set ON_ERROR_STOP off

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN RAISE NOTICE 'OK  %', p_label;
  ELSE RAISE WARNING 'FALLO  %', p_label; END IF;
END; $$;

-- 1) Los seis consumidores migrados usan la regla canónica.
DO $$
DECLARE v_name text; v_src text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'report_revenue_by_month', 'report_revenue_month_invoices',
    'get_dashboard_stats', 'get_customer_profitability',
    'report_profit_by_model', 'get_customer_summary',
    'create_recurring_invoice'
  ] LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name LIMIT 1;
    IF v_src IS NULL THEN
      RAISE WARNING 'FALLO  R9-09 no existe %', v_name;
    ELSIF v_src ILIKE '%fx_is_missing%' OR v_src ILIKE '%fx_to_mxn%'
       OR v_src ILIKE '%fx_convert_amount%' THEN
      RAISE NOTICE 'OK  R9-09 % usa la regla canónica', v_name;
    ELSE
      RAISE WARNING 'FALLO  R9-09 % no usa fx_is_missing/fx_to_mxn', v_name;
    END IF;
  END LOOP;
END $$;

SELECT pg_temp.expect_true(
  'R9-09 v_invoice_forklift_revenue usa la regla canónica',
  pg_get_viewdef('public.v_invoice_forklift_revenue'::regclass, true) ILIKE '%fx_to_mxn%'
);

-- 2) Guard de deriva: ninguna función/vista financiera puede volver a usar
--    `tipo_cambio > 0` o `COALESCE(..., 1)` como sustituto de la regla.
--    Allowlist: funciones no financieras o de semilla/limpieza E2E.
DO $$
DECLARE v_names text;
BEGIN
  SELECT string_agg(DISTINCT p.proname, ', ') INTO v_names
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname NOT LIKE 'e2e\_%'
     AND p.proname NOT IN ('fx_is_missing', 'fx_to_mxn', 'fx_convert_amount',
                           'bank_amount_in_account_currency')
     AND (p.prosrc ~* 'tipo_cambio\s*>\s*0'
       OR p.prosrc ~* 'coalesce\s*\(\s*[a-z_.]*tipo_cambio\s*,\s*1\s*\)'
       OR p.prosrc ~* 'coalesce\s*\(\s*[a-z_.]*exchange_rate\s*,\s*1\s*\)');
  IF v_names IS NULL THEN
    RAISE NOTICE 'OK  R9-09 sin reglas FX duplicadas en funciones';
  ELSE
    RAISE WARNING 'FALLO  R9-09 funciones con regla FX propia: %', v_names;
  END IF;
END $$;

DO $$
DECLARE v_names text;
BEGIN
  SELECT string_agg(DISTINCT viewname, ', ') INTO v_names
    FROM pg_views
   WHERE schemaname = 'public'
     AND (definition ~* 'tipo_cambio\s*>\s*0'
       OR definition ~* 'coalesce\s*\(\s*[a-z_."]*tipo_cambio\s*,\s*1\s*\)');
  IF v_names IS NULL THEN
    RAISE NOTICE 'OK  R9-09 sin reglas FX duplicadas en vistas';
  ELSE
    RAISE WARNING 'FALLO  R9-09 vistas con regla FX propia: %', v_names;
  END IF;
END $$;

-- 3) Matriz de los helpers nuevos.
SELECT pg_temp.expect_true('fx_to_mxn MXN sin TC', public.fx_to_mxn(100, 'MXN', NULL) = 100);
SELECT pg_temp.expect_true('fx_to_mxn USD sin TC es NULL', public.fx_to_mxn(100, 'USD', NULL) IS NULL);
SELECT pg_temp.expect_true('fx_to_mxn USD TC=1 es NULL', public.fx_to_mxn(100, 'USD', 1) IS NULL);
SELECT pg_temp.expect_true('fx_to_mxn USD TC=18', public.fx_to_mxn(100, 'USD', 18) = 1800);

SELECT pg_temp.expect_true('R9-06 misma moneda no requiere TC',
  public.fx_convert_amount(100, 'USD', 'USD', NULL, NULL) = 100);
SELECT pg_temp.expect_true('R9-06 USD -> MXN multiplica',
  public.fx_convert_amount(100, 'USD', 'MXN', 18, NULL) = 1800);
SELECT pg_temp.expect_true('R9-06 MXN -> USD divide',
  public.fx_convert_amount(1800, 'MXN', 'USD', NULL, 18) = 100);
SELECT pg_temp.expect_true('R9-06 tercera moneda EUR -> USD',
  public.fx_convert_amount(100, 'EUR', 'USD', 20, 20) = 100);
SELECT pg_temp.expect_true('R9-06 sin TC devuelve NULL (no importe crudo)',
  public.fx_convert_amount(100, 'USD', 'MXN', NULL, NULL) IS NULL);

-- 4) R9-06: la vista expone la señal de pagos no convertibles.
SELECT pg_temp.expect_true(
  'R9-06 v_invoices_with_balance expone payments_fx_missing',
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'v_invoices_with_balance'
            AND column_name = 'payments_fx_missing')
);
SELECT pg_temp.expect_true(
  'R9-06 la vista conserva security_invoker',
  (SELECT reloptions FROM pg_class WHERE oid = 'public.v_invoices_with_balance'::regclass)
    @> ARRAY['security_invoker=true']
);

-- 5) R9-07: sin fallback de total crudo como MXN.
SELECT pg_temp.expect_true(
  'R9-07 v_overdue_invoices sin round(i.total, 2) como MXN',
  pg_get_viewdef('public.v_overdue_invoices'::regclass, true) NOT ILIKE '%round(i.total%'
);
SELECT pg_temp.expect_true(
  'R9-07 v_overdue_invoices expone fx_missing',
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'v_overdue_invoices'
            AND column_name = 'fx_missing')
);
SELECT pg_temp.expect_true(
  'R9-07 ninguna vencida en divisa sin TC reporta importe en pesos',
  NOT EXISTS (SELECT 1 FROM public.v_overdue_invoices WHERE fx_missing AND balance_mxn IS NOT NULL)
);

ROLLBACK;
