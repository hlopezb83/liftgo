-- 0036_multi_org_analytics_rpc_invoker_scope
--
-- Cuatro RPC analíticas de lectura conservaron SECURITY DEFINER después de la
-- migración multiempresa. Eso hacía que sus SELECT sobre tablas operativas
-- eludieran RLS y mezclaran MRR, cartera y rentabilidad entre organizaciones.
--
-- Son funciones de sólo lectura y sus vistas dependientes ya son
-- security_invoker. Mantienen sus validaciones de rol internas; al ejecutarse
-- como invoker, las policies RLS agregan el ámbito de la organización activa.
-- El cambio no altera firmas, cuerpos, resultados ni permisos EXECUTE.

DO $$
DECLARE
  v_view text;
BEGIN
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
        'La vista public.% debe ser security_invoker antes de cerrar las RPC analíticas',
        v_view;
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION public.get_financial_kpis()
  SECURITY INVOKER;
ALTER FUNCTION public.get_forklift_financials(uuid)
  SECURITY INVOKER;
ALTER FUNCTION public.get_income_statement(date, date, text)
  SECURITY INVOKER;
ALTER FUNCTION public.get_mrr_detail()
  SECURITY INVOKER;
