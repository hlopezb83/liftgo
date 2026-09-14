-- =====================================================================
-- Multi-organización · Fase 5.1 (configuración y RPC de lectura)
--
-- Las funciones que sólo consultan datos pasan a SECURITY INVOKER para que
-- las policies RLS restrictivas de la fase 4 apliquen también dentro de la
-- RPC. Los helpers de configuración que sí deben elevar privilegios reciben
-- la organización explícita o la validan antes de leer.
-- =====================================================================

-- Reportes, tablero y disponibilidad son sólo de lectura. Conservan sus
-- chequeos de rol y permisos; SECURITY INVOKER impide que evadan RLS.
ALTER FUNCTION public.get_activity_metrics(timestamptz, timestamptz)
  SECURITY INVOKER;
ALTER FUNCTION public.get_available_forklifts(date, date)
  SECURITY INVOKER;
ALTER FUNCTION public.get_dashboard_stats()
  SECURITY INVOKER;
ALTER FUNCTION public.get_income_statement(date, date, text)
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

-- El cierre fiscal se aplica al periodo de la organización de la fila que el
-- trigger está validando, nunca al mismo mes de otra organización.
CREATE OR REPLACE FUNCTION public.guard_fiscal_period_open(
  p_date date,
  p_table_name text,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_date IS NULL THEN
    RETURN;
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'La organización es obligatoria para validar el periodo fiscal'
      USING ERRCODE = '23502';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fiscal_periods fp
    WHERE fp.organization_id = p_organization_id
      AND fp.period = to_char(p_date, 'YYYY-MM')
      AND fp.closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'El periodo fiscal % está cerrado; no se pueden registrar fechas en % dentro de ese periodo.',
      to_char(p_date, 'YYYY-MM'), p_table_name
      USING ERRCODE = 'raise_exception';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_guard_invoice_fiscal_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.guard_fiscal_period_open(
    NEW.issued_at,
    'invoices.issued_at',
    NEW.organization_id
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_guard_payment_fiscal_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.guard_fiscal_period_open(
    NEW.payment_date,
    'payments.payment_date',
    NEW.organization_id
  );
  RETURN NEW;
END;
$$;

-- No quedan callers de dos argumentos: eliminar la variante global evita que
-- una ruta nueva pueda volver a validar el cierre de otra organización.
DROP FUNCTION public.guard_fiscal_period_open(date, text);

REVOKE ALL ON FUNCTION public.guard_fiscal_period_open(date, text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_fiscal_period_open(date, text, uuid)
  TO authenticated, service_role;

-- Las restricciones de "una fila global" pasan a ser "una por organización".
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

ALTER TABLE public.fiscal_periods
  DROP CONSTRAINT fiscal_periods_pkey,
  ADD CONSTRAINT fiscal_periods_pkey PRIMARY KEY (organization_id, period);
