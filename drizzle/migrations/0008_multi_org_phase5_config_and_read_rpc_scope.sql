-- =====================================================================
-- Multi-organización · Fase 5.1 (configuración y RPC de lectura)
--
-- Las funciones de lectura sin requisitos de privilegio elevado pasan a
-- SECURITY INVOKER para que las policies RLS restrictivas de la fase 4 también
-- apliquen dentro de la RPC. Los helpers de configuración que sí elevan
-- privilegios validan la organización antes de leer.
-- =====================================================================

-- Reportes, tablero y disponibilidad son sólo de lectura. Conservan sus
-- chequeos de rol y permisos; SECURITY INVOKER impide que evadan RLS.
ALTER FUNCTION public.get_activity_metrics(timestamptz, timestamptz)
  SECURITY INVOKER;
ALTER FUNCTION public.get_available_forklifts(date, date)
  SECURITY INVOKER;
ALTER FUNCTION public.get_dashboard_stats()
  SECURITY INVOKER;
ALTER FUNCTION public.get_insurance_alerts()
  SECURITY INVOKER;
ALTER FUNCTION public.get_sale_available_forklifts(integer, integer)
  SECURITY INVOKER;
ALTER FUNCTION public.get_sidebar_badge_counts()
  SECURITY INVOKER;
ALTER FUNCTION public.report_maintenance_cost_by_unit(date, date)
  SECURITY INVOKER;
ALTER FUNCTION public.report_profit_by_model(date, date)
  SECURITY INVOKER;
ALTER FUNCTION public.report_revenue_by_month(date, date)
  SECURITY INVOKER;
ALTER FUNCTION public.report_revenue_month_invoices(text)
  SECURITY INVOKER;
ALTER FUNCTION public.report_utilization_by_model(date, date)
  SECURITY INVOKER;
ALTER FUNCTION public.report_utilization_by_unit(date, date)
  SECURITY INVOKER;

-- Los views usados por estas RPC ya son security_invoker. Esta aserción evita
-- volver a convertirlas en una ruta que eluda RLS sin revisarla explícitamente.
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
        'La vista public.% debe ser security_invoker antes de usarla desde una RPC tenant-scoped',
        v_view;
    END IF;
  END LOOP;
END;
$$;

-- La cuenta de cobranza que ve el portal debe provenir únicamente de su org.
CREATE OR REPLACE FUNCTION public.get_portal_collection_account()
RETURNS TABLE(
  bank text,
  clabe text,
  account_number text,
  account_holder text,
  currency text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere sesión activa';
  END IF;

  RETURN QUERY
  SELECT ba.bank, ba.clabe, ba.account_number, ba.account_holder, ba.currency
  FROM public.bank_accounts ba
  WHERE ba.is_default_collection = true
    AND ba.is_active = true
    AND public.organization_scope_matches(ba.organization_id)
  LIMIT 1;
END;
$$;

-- La configuración de mantenimiento se selecciona en el ámbito de la org.
CREATE OR REPLACE FUNCTION public.maintenance_buffer_days()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT cs.maintenance_buffer_days
      FROM public.company_settings cs
      WHERE public.organization_scope_matches(cs.organization_id)
      LIMIT 1
    ),
    3
  );
$$;

-- Las restricciones singleton de configuración pasan a ser por organización.
DROP INDEX IF EXISTS public.company_settings_singleton;
CREATE UNIQUE INDEX company_settings_organization_id_key
  ON public.company_settings (organization_id)
  WHERE organization_id IS NOT NULL;

DROP INDEX IF EXISTS public.bank_accounts_one_default_collection;
CREATE UNIQUE INDEX bank_accounts_one_default_collection_per_organization
  ON public.bank_accounts (organization_id)
  WHERE is_default_collection = true
    AND organization_id IS NOT NULL;

DROP INDEX IF EXISTS public.contract_templates_single_default_idx;
CREATE UNIQUE INDEX contract_templates_single_default_per_organization
  ON public.contract_templates (organization_id)
  WHERE is_default = true
    AND organization_id IS NOT NULL;

CREATE UNIQUE INDEX invoice_number_settings_organization_id_key
  ON public.invoice_number_settings (organization_id)
  WHERE organization_id IS NOT NULL;

