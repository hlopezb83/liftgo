-- 0037_multi_org_invoice_balance_rpc_invoker_scope
--
-- El pronóstico de cobranza consume list_invoices_with_balance. La función
-- elevaba privilegios y, aunque su vista es security_invoker, el owner de la
-- función evitaba RLS sobre invoices/payments. La organización vacía recibía
-- importes por vencer de otra empresa.
--
-- El RPC conserva firma, filtros, paginación, guardas de rol, search_path y
-- permisos EXECUTE. SECURITY INVOKER hace que la vista aplique las policies
-- RLS del usuario autenticado.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL pg_options_to_table(c.reloptions) AS o
    WHERE n.nspname = 'public'
      AND c.relname = 'v_invoices_with_balance'
      AND c.relkind = 'v'
      AND o.option_name = 'security_invoker'
      AND o.option_value::boolean
  ) THEN
    RAISE EXCEPTION
      'La vista public.v_invoices_with_balance debe ser security_invoker';
  END IF;
END;
$$;

ALTER FUNCTION public.list_invoices_with_balance(
  text[], date, date, boolean, integer, integer
) SECURITY INVOKER;
