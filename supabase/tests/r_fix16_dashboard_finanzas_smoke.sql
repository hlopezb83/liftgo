-- Smoke SQL de fix-16 (panel y reportes financieros):
--   N-14 get_dashboard_stats expone utilization / maintenance_alerts
--   N-16 fleet_counts.rented sale de forklifts.status y se excluye is_e2e
--   N-15 get_financial_kpis excluye fx_missing y expone overdue_fx_missing_count
--   N-19 trg_payment_amount_mxn prioriza el tipo de cambio del pago
--   N-20 report_revenue_by_month sin fallback 1:1 en pagos
--   psql -f supabase/tests/r_fix16_dashboard_finanzas_smoke.sql
-- Solo lecturas de catálogo: no toca datos.

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
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name
  LIMIT 1;
$$;

-- N-14: el panel devuelve las llaves que consume el frontend.
SELECT pg_temp.expect_true(
  'N-14 get_dashboard_stats expone utilization',
  pg_temp.fndef('get_dashboard_stats') LIKE '%''utilization'',%'
);

SELECT pg_temp.expect_true(
  'N-14 get_dashboard_stats expone maintenance_alerts',
  pg_temp.fndef('get_dashboard_stats') LIKE '%''maintenance_alerts'',%'
);

-- N-16: rented sale de forklifts.status (conteos disjuntos).
SELECT pg_temp.expect_true(
  'N-16 fleet_counts.rented usa forklifts.status',
  pg_temp.fndef('get_dashboard_stats') LIKE '%''rented'', COUNT(*) FILTER (WHERE status = ''rented'')%'
);

-- N-16: las agregaciones del panel excluyen documentos de prueba.
SELECT pg_temp.expect_true(
  'N-16 get_dashboard_stats excluye is_e2e',
  pg_temp.fndef('get_dashboard_stats') LIKE '%is_e2e IS NOT TRUE%'
);

-- N-15: cartera vencida sin facturas en divisa sin tipo de cambio.
SELECT pg_temp.expect_true(
  'N-15 get_financial_kpis excluye fx_missing',
  pg_temp.fndef('get_financial_kpis') LIKE '%fx_missing IS NOT TRUE%'
);

SELECT pg_temp.expect_true(
  'N-15 get_financial_kpis expone overdue_fx_missing_count',
  pg_temp.fndef('get_financial_kpis') LIKE '%overdue_fx_missing_count%'
);

-- N-19: precedencia FX — primero el pago, luego la factura.
SELECT pg_temp.expect_true(
  'N-19 trg_payment_amount_mxn prioriza NEW.exchange_rate',
  pg_temp.fndef('trg_payment_amount_mxn')
    LIKE '%COALESCE(NULLIF(NEW.exchange_rate, 0), NULLIF(v_tipo_cambio, 0))%'
);

-- N-20: el bloque de pagos ya no cae a 1:1.
SELECT pg_temp.expect_true(
  'N-20 report_revenue_by_month sin fallback 1:1 en pagos',
  pg_temp.fndef('report_revenue_by_month')
    NOT LIKE '%COALESCE(NULLIF(p.exchange_rate, 0), NULLIF(i.tipo_cambio, 0), 1)%'
);

SELECT pg_temp.expect_true(
  'N-20 report_revenue_by_month marca fx_missing en pagos',
  pg_temp.fndef('report_revenue_by_month') LIKE '%BOOL_OR(%'
);

-- Guardias de seguridad: siguen siendo SECURITY DEFINER con search_path fijo
-- y sin EXECUTE para anon.
SELECT pg_temp.expect_true(
  'fix-16 funciones sin EXECUTE para anon',
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_dashboard_stats', 'get_financial_kpis', 'report_revenue_by_month')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  )
);

ROLLBACK;
