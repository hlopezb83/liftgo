-- R8-02 / R8-03: predicado canónico de FX faltante.
CREATE OR REPLACE FUNCTION public.fx_is_missing(p_currency text, p_rate numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(COALESCE(p_currency, 'MXN')) <> 'MXN'
     AND (p_rate IS NULL OR p_rate <= 0 OR p_rate = 1);
$$;

REVOKE ALL ON FUNCTION public.fx_is_missing(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_is_missing(text, numeric) TO authenticated, anon, service_role;

-- Vista de saldos: misma regla (incluye TC = 1 en divisa).
CREATE OR REPLACE VIEW public.v_invoices_with_balance
WITH (security_invoker = true) AS
 SELECT i.id,
    i.invoice_number,
    i.booking_id,
    i.customer_id,
    i.customer_name,
    i.line_items,
    i.subtotal,
    i.tax_rate,
    i.tax_amount,
    i.total,
    i.status,
    i.issued_at,
    i.due_date,
    i.paid_at,
    i.notes,
    i.created_at,
    i.updated_at,
    i.serie,
    i.folio,
    i.forma_pago,
    i.metodo_pago,
    i.uso_cfdi,
    i.moneda,
    i.tipo_cambio,
    i.receptor_rfc,
    i.receptor_razon_social,
    i.receptor_regimen_fiscal,
    i.receptor_domicilio_fiscal_cp,
    i.cfdi_uuid,
    i.cfdi_xml,
    i.cfdi_status,
    i.cancelled_at,
    i.cancellation_reason,
    i.quote_id,
    i.facturapi_invoice_id,
    i.billing_period_start,
    i.billing_period_end,
    i.cfdi_xml_url,
    i.cfdi_pdf_url,
    i.cfdi_error_message,
    i.cancellation_status,
    i.cancellation_motive,
    i.substitution_uuid,
    i.is_e2e,
    i.e2e_scope,
    i.global_periodicity,
    i.global_months,
    i.global_year,
    i.acuse_pdf_url,
    i.acuse_xml_url,
    i.facturapi_env,
    COALESCE(p.paid, 0::numeric) AS paid_amount,
    COALESCE(cn.credited, 0::numeric) AS credited_amount,
    GREATEST(i.total - COALESCE(p.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric) AS balance,
        CASE
            WHEN upper(COALESCE(i.moneda, 'MXN'::text)) = 'MXN'::text THEN round(i.total, 2)
            WHEN public.fx_is_missing(i.moneda, i.tipo_cambio) THEN NULL::numeric
            ELSE round(i.total * i.tipo_cambio, 2)
        END AS total_mxn,
        CASE
            WHEN upper(COALESCE(i.moneda, 'MXN'::text)) = 'MXN'::text THEN round(GREATEST(i.total - COALESCE(p.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric), 2)
            WHEN public.fx_is_missing(i.moneda, i.tipo_cambio) THEN NULL::numeric
            ELSE round(GREATEST(i.total - COALESCE(p.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric) * i.tipo_cambio, 2)
        END AS balance_mxn,
    public.fx_is_missing(i.moneda, i.tipo_cambio) AS fx_missing
   FROM invoices i
     LEFT JOIN ( SELECT p_1.invoice_id,
            sum(
                CASE
                    WHEN upper(COALESCE(p_1.currency, ip.moneda, 'MXN'::text)) = upper(COALESCE(ip.moneda, 'MXN'::text)) THEN p_1.amount
                    WHEN upper(COALESCE(p_1.currency, 'MXN'::text)) = 'MXN'::text THEN p_1.amount / NULLIF(COALESCE(NULLIF(p_1.exchange_rate, 0::numeric), NULLIF(ip.tipo_cambio, 0::numeric)), 0::numeric)
                    ELSE p_1.amount * COALESCE(NULLIF(p_1.exchange_rate, 0::numeric), NULLIF(ip.tipo_cambio, 0::numeric))
                END) AS paid
           FROM payments p_1
             JOIN invoices ip ON ip.id = p_1.invoice_id
          GROUP BY p_1.invoice_id) p ON p.invoice_id = i.id
     LEFT JOIN ( SELECT credit_notes.invoice_id,
            sum(credit_notes.total) AS credited
           FROM credit_notes
          WHERE credit_notes.cancellation_status <> 'accepted'::text AND credit_notes.status <> 'cancelled'::text AND credit_notes.cfdi_status = 'stamped'::text
          GROUP BY credit_notes.invoice_id) cn ON cn.invoice_id = i.id;

-- KPIs financieros: MRR y cartera vencida con la regla canónica.
CREATE OR REPLACE FUNCTION public.get_financial_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mrr NUMERIC := 0; v_mrr_prev NUMERIC := 0;
  v_dso NUMERIC := 0; v_dso_prev NUMERIC := 0;
  v_overdue_total NUMERIC := 0; v_overdue_total_prev NUMERIC := 0;
  v_expiring jsonb;
  v_overdue_fx_missing INT := 0;
  v_mrr_fx_missing INT := 0;
  v_mrr_prev_fx_missing INT := 0;
  v_today DATE := (now() AT TIME ZONE 'America/Monterrey')::date;
  v_last_prev_month DATE := (date_trunc('month', v_today) - INTERVAL '1 day')::date;
BEGIN
  IF NOT (
    has_role((select auth.uid()), 'admin'::app_role) OR
    has_role((select auth.uid()), 'administrativo'::app_role) OR
    has_role((select auth.uid()), 'auditor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- R8-02: la renta en divisa sin TC válido (NULL/<=0/=1) se EXCLUYE y se cuenta.
  SELECT
    COALESCE(SUM(COALESCE(b.monthly_rate, f.monthly_rate, 0)
      * CASE WHEN upper(COALESCE(b.currency, 'MXN')) = 'MXN' THEN 1 ELSE b.tipo_cambio END)
      FILTER (WHERE NOT public.fx_is_missing(b.currency, b.tipo_cambio)), 0),
    COUNT(*) FILTER (WHERE public.fx_is_missing(b.currency, b.tipo_cambio))
    INTO v_mrr, v_mrr_fx_missing
    FROM bookings b JOIN forklifts f ON f.id = b.forklift_id
   WHERE b.recurring_billing = true AND b.status = 'confirmed'
     AND b.start_date <= v_today
     AND (b.end_date IS NULL OR b.end_date >= v_today)
     AND b.is_e2e IS NOT TRUE
     AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE;

  SELECT
    COALESCE(SUM(COALESCE(b.monthly_rate, f.monthly_rate, 0)
      * CASE WHEN upper(COALESCE(b.currency, 'MXN')) = 'MXN' THEN 1 ELSE b.tipo_cambio END)
      FILTER (WHERE NOT public.fx_is_missing(b.currency, b.tipo_cambio)), 0),
    COUNT(*) FILTER (WHERE public.fx_is_missing(b.currency, b.tipo_cambio))
    INTO v_mrr_prev, v_mrr_prev_fx_missing
    FROM bookings b JOIN forklifts f ON f.id = b.forklift_id
   WHERE b.recurring_billing = true AND b.status = 'confirmed'
     AND b.start_date <= v_last_prev_month
     AND (b.end_date IS NULL OR b.end_date >= v_last_prev_month)
     AND b.is_e2e IS NOT TRUE
     AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE;

  SELECT COALESCE(AVG((i.paid_at - i.issued_at::date))::numeric, 0) INTO v_dso FROM invoices i
  WHERE i.status = 'paid' AND i.paid_at IS NOT NULL AND i.paid_at >= (v_today - INTERVAL '90 days')
    AND i.is_e2e IS NOT TRUE;

  SELECT COALESCE(AVG((i.paid_at - i.issued_at::date))::numeric, 0) INTO v_dso_prev FROM invoices i
  WHERE i.status = 'paid' AND i.paid_at IS NOT NULL
    AND i.paid_at >= (v_last_prev_month - INTERVAL '90 days') AND i.paid_at <= v_last_prev_month
    AND i.is_e2e IS NOT TRUE;

  -- R13-2 / N-15 / R8-02: la vista ya aplica el predicado canónico.
  SELECT COALESCE(SUM(v.balance_mxn) FILTER (WHERE v.fx_missing IS NOT TRUE), 0),
         COUNT(*) FILTER (WHERE v.fx_missing IS TRUE)
    INTO v_overdue_total, v_overdue_fx_missing
  FROM public.v_invoices_with_balance v
  WHERE v.status IN ('sent', 'partial', 'overdue') AND v.due_date < v_today
    AND v.is_e2e IS NOT TRUE;

  SELECT COALESCE(SUM(v.balance_mxn), 0) INTO v_overdue_total_prev
  FROM public.v_invoices_with_balance v
  WHERE v.status IN ('sent', 'partial', 'overdue', 'paid')
    AND v.issued_at <= v_last_prev_month
    AND v.due_date < v_last_prev_month
    AND (v.paid_at IS NULL OR v.paid_at > v_last_prev_month)
    AND v.fx_missing IS NOT TRUE
    AND v.is_e2e IS NOT TRUE;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'contract_number', c.contract_number, 'customer_name', cu.name,
    'forklift_name', f.name, 'end_date', c.end_date, 'days_remaining', (c.end_date - v_today)
  ) ORDER BY c.end_date), '[]'::jsonb) INTO v_expiring
  FROM contracts c LEFT JOIN customers cu ON cu.id = c.customer_id
  LEFT JOIN forklifts f ON f.id = c.forklift_id
  WHERE c.status = 'active' AND c.end_date IS NOT NULL
    AND c.end_date BETWEEN v_today AND (v_today + INTERVAL '30 days')
    AND (cu.id IS NULL OR cu.is_e2e IS NOT TRUE)
    AND (f.id IS NULL OR f.deleted_at IS NULL);

  RETURN jsonb_build_object(
    'mrr_fx_missing_count', v_mrr_fx_missing,
    'mrr_prev_fx_missing_count', v_mrr_prev_fx_missing,
    'mrr', v_mrr, 'mrr_prev', v_mrr_prev,
    'dso', ROUND(v_dso, 1), 'dso_prev', ROUND(v_dso_prev, 1),
    'overdue_total', v_overdue_total, 'overdue_total_prev', v_overdue_total_prev,
    'overdue_fx_missing_count', v_overdue_fx_missing,
    'expiring_contracts', v_expiring
  );
END;
$function$;

-- R8-03: el portal deja de forzar tipo_cambio = 1.
CREATE OR REPLACE FUNCTION public.get_portal_invoices()
RETURNS TABLE(id uuid, invoice_number text, customer_id uuid, status text, issued_at date, due_date date, paid_at date, subtotal numeric, tax_rate numeric, tax_amount numeric, total numeric, line_items jsonb, billing_period_start date, billing_period_end date, cfdi_pdf_url text, cfdi_uuid uuid, moneda text, tipo_cambio numeric, paid_amount numeric, credited_amount numeric, balance numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT v.id, v.invoice_number, v.customer_id, v.status, v.issued_at,
         v.due_date, v.paid_at, v.subtotal, v.tax_rate, v.tax_amount,
         v.total, v.line_items, v.billing_period_start, v.billing_period_end,
         v.cfdi_pdf_url, v.cfdi_uuid, v.moneda,
         v.tipo_cambio::numeric AS tipo_cambio,
         COALESCE(v.paid_amount, 0)::numeric     AS paid_amount,
         COALESCE(v.credited_amount, 0)::numeric AS credited_amount,
         COALESCE(v.balance, 0)::numeric         AS balance
  FROM public.v_invoices_with_balance v
  WHERE has_role((select auth.uid()), 'customer'::app_role)
    AND v.customer_id = get_customer_id_for_user((select auth.uid()))
    AND v.status NOT IN ('draft', 'cancelled')
  ORDER BY v.issued_at DESC;
$function$;