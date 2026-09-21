-- Regresión: las RPC analíticas deben respetar RLS por organización.
--
-- El incidente real se reprodujo con una segunda organización: get_mrr_detail
-- y get_financial_kpis devolvían datos de la primera porque eran SECURITY
-- DEFINER. Las cuatro RPC comparten tablas/vistas operativas y deben permanecer
-- SECURITY INVOKER. Las suites de RLS de tablas comprueban el filtro A/B.
BEGIN;

DO $$
DECLARE
  v_function regprocedure;
  v_definers text;
  v_view text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_definers
  FROM pg_proc p
  WHERE p.oid IN (
    'public.get_financial_kpis()'::regprocedure,
    'public.get_forklift_financials(uuid)'::regprocedure,
    'public.get_income_statement(date,date,text)'::regprocedure,
    'public.get_mrr_detail()'::regprocedure
  )
    AND p.prosecdef;

  IF v_definers IS NOT NULL THEN
    RAISE EXCEPTION
      'RPC ORG: las RPC analíticas deben ser SECURITY INVOKER; siguen definer: %',
      v_definers;
  END IF;

  FOREACH v_view IN ARRAY ARRAY[
    'v_booking_occupancy',
    'v_invoice_forklift_revenue',
    'v_invoices_with_balance'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL pg_options_to_table(c.reloptions) AS o
      WHERE n.nspname = 'public'
        AND c.relname = v_view
        AND c.relkind = 'v'
        AND o.option_name = 'security_invoker'
        AND o.option_value::boolean
    ) THEN
      RAISE EXCEPTION
        'RPC ORG: la vista public.% debe respetar el invocante',
        v_view;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;
