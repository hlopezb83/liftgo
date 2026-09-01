-- Smoke SQL R8-02 / R8-03: predicado canónico de tipo de cambio faltante.
-- Ejecutar contra staging:  psql -f supabase/tests/r8_fx_missing_smoke.sql
-- Solo lecturas: hace ROLLBACK al final.

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

-- 1) Matriz del predicado canónico.
SELECT pg_temp.expect_true('MXN sin TC no es fx_missing',        public.fx_is_missing('MXN', NULL) IS FALSE);
SELECT pg_temp.expect_true('moneda nula no es fx_missing',       public.fx_is_missing(NULL, NULL) IS FALSE);
SELECT pg_temp.expect_true('USD con TC nulo es fx_missing',      public.fx_is_missing('USD', NULL) IS TRUE);
SELECT pg_temp.expect_true('USD con TC 0 es fx_missing',         public.fx_is_missing('USD', 0) IS TRUE);
SELECT pg_temp.expect_true('USD con TC negativo es fx_missing',  public.fx_is_missing('USD', -3) IS TRUE);
SELECT pg_temp.expect_true('USD con TC = 1 es fx_missing',       public.fx_is_missing('usd', 1) IS TRUE);
SELECT pg_temp.expect_true('USD con TC 18 NO es fx_missing',     public.fx_is_missing('USD', 18) IS FALSE);

-- 2) La vista de saldos reutiliza el helper (sin CASE duplicado).
SELECT pg_temp.expect_true(
  'v_invoices_with_balance usa fx_is_missing',
  pg_get_viewdef('public.v_invoices_with_balance'::regclass, true) ILIKE '%fx_is_missing%'
);

SELECT pg_temp.expect_true(
  'v_invoices_with_balance conserva security_invoker',
  (SELECT reloptions FROM pg_class WHERE oid = 'public.v_invoices_with_balance'::regclass)
    @> ARRAY['security_invoker=true']
);

-- 3) Coherencia fila a fila: fx_missing ⇔ balance_mxn nulo (en divisa).
SELECT pg_temp.expect_true(
  'sin filas con fx_missing y balance_mxn no nulo',
  NOT EXISTS (SELECT 1 FROM public.v_invoices_with_balance WHERE fx_missing AND balance_mxn IS NOT NULL)
);

SELECT pg_temp.expect_true(
  'fx_missing coincide con el helper por fila',
  NOT EXISTS (
    SELECT 1 FROM public.v_invoices_with_balance
     WHERE fx_missing IS DISTINCT FROM public.fx_is_missing(moneda, tipo_cambio)
  )
);

-- 4) KPIs financieros: MRR y cartera vencida usan el helper.
SELECT pg_temp.expect_true(
  'get_financial_kpis usa fx_is_missing',
  (SELECT prosrc FROM pg_proc WHERE proname = 'get_financial_kpis') ILIKE '%fx_is_missing%'
);

SELECT pg_temp.expect_true(
  'get_financial_kpis sigue siendo SECURITY DEFINER con search_path',
  (SELECT p.prosecdef AND p.proconfig::text ILIKE '%search_path%'
     FROM pg_proc p WHERE p.proname = 'get_financial_kpis')
);

-- 5) Portal: ya no fuerza tipo_cambio = 1.
SELECT pg_temp.expect_true(
  'get_portal_invoices sin COALESCE(v.tipo_cambio, 1)',
  (SELECT prosrc FROM pg_proc WHERE proname = 'get_portal_invoices') NOT ILIKE '%COALESCE(v.tipo_cambio, 1)%'
);

SELECT pg_temp.expect_true(
  'get_portal_invoices conserva el guard de rol customer',
  (SELECT prosrc FROM pg_proc WHERE proname = 'get_portal_invoices') ILIKE '%''customer''::app_role%'
);

-- 6) Permisos del helper.
SELECT pg_temp.expect_true(
  'authenticated puede ejecutar fx_is_missing',
  has_function_privilege('authenticated', 'public.fx_is_missing(text, numeric)', 'EXECUTE')
);

ROLLBACK;
