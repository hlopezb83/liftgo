-- =====================================================================
-- R9 · LOTE B (forward-only): barrido canónico de FX
-- R9-06 v_invoices_with_balance · R9-07 v_overdue_invoices
-- R9-09 seis consumidores financieros
-- =====================================================================

-- Helper canónico: importe -> MXN. NULL cuando el TC es inválido
-- (regla `fx_is_missing`: divisa con TC nulo, <= 0 o exactamente 1).
CREATE OR REPLACE FUNCTION public.fx_to_mxn(p_amount numeric, p_currency text, p_rate numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_amount IS NULL THEN NULL
    WHEN upper(COALESCE(p_currency, 'MXN')) = 'MXN' THEN round(p_amount, 2)
    WHEN public.fx_is_missing(p_currency, p_rate) THEN NULL
    ELSE round(p_amount * p_rate, 2)
  END;
$function$;

-- Helper canónico bidireccional: importe de una moneda a otra usando las
-- tasas a MXN de cada lado. NULL cuando alguna tasa no es utilizable.
CREATE OR REPLACE FUNCTION public.fx_convert_amount(
  p_amount numeric, p_from text, p_to text, p_from_rate numeric, p_to_rate numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_amount IS NULL THEN NULL
    WHEN upper(COALESCE(p_from, 'MXN')) = upper(COALESCE(p_to, 'MXN')) THEN round(p_amount, 2)
    WHEN public.fx_is_missing(p_from, p_from_rate) OR public.fx_is_missing(p_to, p_to_rate) THEN NULL
    ELSE round(
      p_amount
      * CASE WHEN upper(COALESCE(p_from, 'MXN')) = 'MXN' THEN 1 ELSE p_from_rate END
      / CASE WHEN upper(COALESCE(p_to, 'MXN')) = 'MXN' THEN 1 ELSE p_to_rate END
    , 2)
  END;
$function$;

GRANT EXECUTE ON FUNCTION public.fx_to_mxn(numeric, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fx_convert_amount(numeric, text, text, numeric, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- R9-06 · v_invoices_with_balance
-- Pagos cross-currency con conversión bidireccional canónica y señal
-- observable (`payments_fx_missing`) cuando un pago no se puede convertir.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_invoices_with_balance
WITH (security_invoker = true) AS
WITH pay AS (
  SELECT p.invoice_id,
    sum(public.fx_convert_amount(
      p.amount,
      COALESCE(p.currency, ip.moneda, 'MXN'),
      COALESCE(ip.moneda, 'MXN'),
      NULLIF(p.exchange_rate, 0),
      NULLIF(ip.tipo_cambio, 0)
    )) AS paid,
    count(*) FILTER (WHERE public.fx_convert_amount(
      p.amount,
      COALESCE(p.currency, ip.moneda, 'MXN'),
      COALESCE(ip.moneda, 'MXN'),
      NULLIF(p.exchange_rate, 0),
      NULLIF(ip.tipo_cambio, 0)
    ) IS NULL)::int AS fx_missing_payments
  FROM public.payments p
  JOIN public.invoices ip ON ip.id = p.invoice_id
  GROUP BY p.invoice_id
), cn AS (
  SELECT credit_notes.invoice_id, sum(credit_notes.total) AS credited
  FROM public.credit_notes
  WHERE credit_notes.cancellation_status <> 'accepted'
    AND credit_notes.status <> 'cancelled'
    AND credit_notes.cfdi_status = 'stamped'
  GROUP BY credit_notes.invoice_id
)
SELECT i.id,
  i.invoice_number, i.booking_id, i.customer_id, i.customer_name, i.line_items,
  i.subtotal, i.tax_rate, i.tax_amount, i.total, i.status, i.issued_at,
  i.due_date, i.paid_at, i.notes, i.created_at, i.updated_at, i.serie, i.folio,
  i.forma_pago, i.metodo_pago, i.uso_cfdi, i.moneda, i.tipo_cambio,
  i.receptor_rfc, i.receptor_razon_social, i.receptor_regimen_fiscal,
  i.receptor_domicilio_fiscal_cp, i.cfdi_uuid, i.cfdi_xml, i.cfdi_status,
  i.cancelled_at, i.cancellation_reason, i.quote_id, i.facturapi_invoice_id,
  i.billing_period_start, i.billing_period_end, i.cfdi_xml_url, i.cfdi_pdf_url,
  i.cfdi_error_message, i.cancellation_status, i.cancellation_motive,
  i.substitution_uuid, i.is_e2e, i.e2e_scope, i.global_periodicity,
  i.global_months, i.global_year, i.acuse_pdf_url, i.acuse_xml_url, i.facturapi_env,
  COALESCE(pay.paid, 0::numeric) AS paid_amount,
  COALESCE(cn.credited, 0::numeric) AS credited_amount,
  GREATEST(i.total - COALESCE(pay.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric) AS balance,
  public.fx_to_mxn(i.total, i.moneda, i.tipo_cambio) AS total_mxn,
  public.fx_to_mxn(
    GREATEST(i.total - COALESCE(pay.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric),
    i.moneda, i.tipo_cambio) AS balance_mxn,
  public.fx_is_missing(i.moneda, i.tipo_cambio) AS fx_missing,
  COALESCE(pay.fx_missing_payments, 0) AS payments_fx_missing
FROM public.invoices i
LEFT JOIN pay ON pay.invoice_id = i.id
LEFT JOIN cn ON cn.invoice_id = i.id;

-- ---------------------------------------------------------------------
-- R9-07 · v_overdue_invoices (sin fabricar MXN a partir de divisa)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_overdue_invoices
WITH (security_invoker = true) AS
SELECT i.id, i.invoice_number, i.customer_id, i.customer_name, i.due_date, i.total,
  COALESCE(v.balance, i.total) AS balance,
  -- R9-07: si el documento está en divisa sin TC usable, NO se inventa un
  -- importe en pesos: queda NULL y se expone con `fx_missing`.
  COALESCE(v.balance_mxn, public.fx_to_mxn(i.total, i.moneda, i.tipo_cambio)) AS balance_mxn,
  public.today_mty() - i.due_date AS days_overdue,
  CASE
    WHEN (public.today_mty() - i.due_date) <= 30 THEN '0-30'::text
    WHEN (public.today_mty() - i.due_date) <= 60 THEN '31-60'::text
    WHEN (public.today_mty() - i.due_date) <= 90 THEN '61-90'::text
    ELSE '90+'::text
  END AS bucket,
  COALESCE(v.fx_missing, public.fx_is_missing(i.moneda, i.tipo_cambio)) AS fx_missing
FROM public.invoices i
LEFT JOIN public.v_invoices_with_balance v ON v.id = i.id
WHERE (i.status = ANY (ARRAY['sent'::text, 'partial'::text, 'overdue'::text]))
  AND COALESCE(i.cancellation_status, 'none'::text) <> 'accepted'
  AND i.due_date IS NOT NULL
  AND i.due_date < public.today_mty()
  AND COALESCE(v.balance, i.total) > 0::numeric;

-- ---------------------------------------------------------------------
-- R9-09 · v_invoice_forklift_revenue
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_invoice_forklift_revenue
WITH (security_invoker = true) AS
WITH links AS (
  SELECT i.id AS invoice_id, b.forklift_id
  FROM public.invoices i JOIN public.bookings b ON b.id = i.booking_id
  WHERE b.forklift_id IS NOT NULL
  UNION
  SELECT ib.invoice_id, b.forklift_id
  FROM public.invoice_bookings ib JOIN public.bookings b ON b.id = ib.booking_id
  WHERE b.forklift_id IS NOT NULL
), link_counts AS (
  SELECT links.invoice_id, count(*)::numeric AS n FROM links GROUP BY links.invoice_id
), amounts AS (
  SELECT i.id AS invoice_id, i.status, i.paid_at, i.is_e2e,
    COALESCE(public.fx_to_mxn(i.subtotal, i.moneda, i.tipo_cambio), 0::numeric)
    - COALESCE((
        SELECT sum(public.fx_to_mxn(cn.subtotal, i.moneda, i.tipo_cambio))
        FROM public.credit_notes cn
        WHERE cn.invoice_id = i.id AND cn.cancellation_status <> 'accepted'
          AND cn.status <> 'cancelled' AND cn.cfdi_status = 'stamped'
      ), 0::numeric) AS net_mxn,
    COALESCE(public.fx_to_mxn(i.total, i.moneda, i.tipo_cambio), 0::numeric) AS total_mxn
  FROM public.invoices i
)
SELECT l.invoice_id, l.forklift_id, a.status, a.paid_at, a.is_e2e,
  a.net_mxn / c.n AS net_mxn_share,
  a.total_mxn / c.n AS total_mxn_share
FROM links l
JOIN link_counts c ON c.invoice_id = l.invoice_id
JOIN amounts a ON a.invoice_id = l.invoice_id;

-- ---------------------------------------------------------------------
-- R9-09 · report_revenue_by_month
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_revenue_by_month(_start date, _end date)
RETURNS TABLE(month_key text, invoiced numeric, paid numeric, invoice_count integer, fx_missing_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_permission('Reportes', 'read') THEN
    RAISE EXCEPTION 'Permiso insuficiente: se requiere Reportes/read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH scoped AS (
    SELECT i.id,
      to_char(date_trunc('month', i.issued_at), 'YYYY-MM') AS month_key,
      public.fx_is_missing(i.moneda, i.tipo_cambio) AS fx_missing,
      public.fx_to_mxn(i.total, i.moneda, i.tipo_cambio) AS total_mxn
    FROM public.invoices i
    WHERE i.status NOT IN ('draft', 'cancelled')
      AND i.is_e2e IS NOT TRUE
      AND i.issued_at::date BETWEEN _start AND _end
  ),
  nc AS (
    SELECT cn.invoice_id,
      SUM(public.fx_to_mxn(cn.total, pi.moneda, pi.tipo_cambio)) AS credited_mxn
    FROM public.credit_notes cn
    JOIN public.invoices pi ON pi.id = cn.invoice_id
    WHERE cn.cancellation_status <> 'accepted'
      AND cn.status <> 'cancelled'
      AND cn.cfdi_status = 'stamped'
    GROUP BY cn.invoice_id
  ),
  paid_by_invoice AS (
    SELECT p.invoice_id,
      SUM(COALESCE(
        public.fx_to_mxn(p.amount, COALESCE(p.currency, i.moneda), NULLIF(p.exchange_rate, 0)),
        public.fx_to_mxn(p.amount, i.moneda, i.tipo_cambio)
      )) AS paid_mxn,
      BOOL_OR(COALESCE(
        public.fx_to_mxn(p.amount, COALESCE(p.currency, i.moneda), NULLIF(p.exchange_rate, 0)),
        public.fx_to_mxn(p.amount, i.moneda, i.tipo_cambio)
      ) IS NULL) AS fx_missing
    FROM public.payments p
    JOIN public.invoices i ON i.id = p.invoice_id
    GROUP BY p.invoice_id
  )
  SELECT s.month_key,
    COALESCE(SUM(s.total_mxn), 0) - COALESCE(SUM(n.credited_mxn), 0),
    COALESCE(SUM(pb.paid_mxn), 0),
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE s.fx_missing OR COALESCE(pb.fx_missing, false))::int
  FROM scoped s
  LEFT JOIN nc n ON n.invoice_id = s.id
  LEFT JOIN paid_by_invoice pb ON pb.invoice_id = s.id
  GROUP BY s.month_key ORDER BY s.month_key;
END;
$function$;

-- ---------------------------------------------------------------------
-- R9-09 · report_revenue_month_invoices
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_revenue_month_invoices(_month_key text)
RETURNS TABLE(id uuid, invoice_number text, customer_name text, issued_at date, total numeric, status text, moneda text, tipo_cambio numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_permission('Reportes', 'read') THEN
    RAISE EXCEPTION 'Permiso insuficiente: se requiere Reportes/read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT i.id, i.invoice_number, i.customer_name, i.issued_at, i.total, i.status, i.moneda, i.tipo_cambio
  FROM public.invoices i
  WHERE i.status NOT IN ('draft', 'cancelled')
    AND i.is_e2e IS NOT TRUE
    AND to_char(date_trunc('month', i.issued_at), 'YYYY-MM') = _month_key
  -- R9-09: el orden usa la regla canónica; los documentos sin TC usable caen
  -- al final (NULLS LAST) en vez de ordenarse con su importe en divisa.
  ORDER BY public.fx_to_mxn(i.total, i.moneda, i.tipo_cambio) DESC NULLS LAST;
END;
$function$;

-- ---------------------------------------------------------------------
-- R9-09 · get_customer_profitability
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_profitability(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_uid uuid := (select auth.uid());
  v_is_staff boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_is_staff := (
    public.has_role(v_uid, 'admin'::app_role) OR
    public.has_role(v_uid, 'administrativo'::app_role) OR
    public.has_role(v_uid, 'auditor'::app_role) OR
    public.has_role(v_uid, 'ventas'::app_role)
  );

  IF NOT v_is_staff THEN
    IF p_customer_id IS NULL
       OR p_customer_id IS DISTINCT FROM public.get_customer_id_for_user(v_uid) THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH revenue AS (
    SELECT COALESCE(SUM(
      COALESCE(public.fx_to_mxn(i.subtotal, i.moneda, i.tipo_cambio), 0)
      - COALESCE((
          SELECT SUM(public.fx_to_mxn(cn.subtotal, i.moneda, i.tipo_cambio))
          FROM public.credit_notes cn
          WHERE cn.invoice_id = i.id
            AND cn.cancellation_status <> 'accepted'
            AND cn.status <> 'cancelled'
            AND cn.cfdi_status = 'stamped'
        ), 0)
    ), 0)::numeric AS r
    FROM public.invoices i
    WHERE i.customer_id = p_customer_id
      AND i.status <> 'cancelled'
      AND COALESCE(i.cancellation_status, '') <> 'accepted'
      AND i.is_e2e IS NOT TRUE
  ),
  customer_forklifts AS (
    SELECT DISTINCT b.forklift_id
    FROM public.bookings b
    WHERE b.customer_id = p_customer_id
      AND b.forklift_id IS NOT NULL
  ),
  maint AS (
    SELECT COALESCE(SUM(ml.cost), 0)::numeric AS c
    FROM public.maintenance_logs ml
    WHERE ml.forklift_id IN (SELECT forklift_id FROM customer_forklifts)
      AND ml.deleted_at IS NULL
      AND ml.is_e2e IS NOT TRUE
  )
  SELECT jsonb_build_object(
    'revenue', revenue.r,
    'maintenance_cost', maint.c,
    'gross_margin', revenue.r - maint.c,
    'margin_percent', CASE WHEN revenue.r > 0 THEN ROUND(((revenue.r - maint.c) / revenue.r) * 100, 2) ELSE 0 END
  )
  INTO v_result
  FROM revenue, maint;

  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------------
-- R9-09 · report_profit_by_model
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_profit_by_model(_start date, _end date)
RETURNS TABLE(model text, units integer, revenue numeric, maintenance numeric, damages numeric, profit numeric, margin numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_permission('Reportes', 'read') THEN
    RAISE EXCEPTION 'Permiso insuficiente: se requiere Reportes/read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH forklift_model AS (
    SELECT f.id,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', f.manufacturer, f.model)), ''), f.name) AS model_key
    FROM public.forklifts f
    WHERE f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
  ),
  model_units AS (
    SELECT fm.model_key, COUNT(*)::int AS units FROM forklift_model fm GROUP BY fm.model_key
  ),
  revenue_by_model AS (
    SELECT fm.model_key, COALESCE(SUM(inv.net_mxn), 0) AS revenue
    FROM (
      SELECT i.id,
        COALESCE(b.forklift_id, ibf.forklift_id) AS forklift_id,
        COALESCE(public.fx_to_mxn(i.subtotal, i.moneda, i.tipo_cambio), 0)
        - COALESCE((
            SELECT SUM(public.fx_to_mxn(cn.subtotal, i.moneda, i.tipo_cambio))
            FROM public.credit_notes cn
            WHERE cn.invoice_id = i.id
              AND cn.cancellation_status <> 'accepted'
              AND cn.status <> 'cancelled'
              AND cn.cfdi_status = 'stamped'
          ), 0) AS net_mxn
      FROM public.invoices i
      LEFT JOIN public.bookings b ON b.id = i.booking_id
      LEFT JOIN (
        SELECT DISTINCT ON (ib.invoice_id) ib.invoice_id, b2.forklift_id
        FROM public.invoice_bookings ib
        JOIN public.bookings b2 ON b2.id = ib.booking_id
      ) ibf ON ibf.invoice_id = i.id
      WHERE i.status = 'paid'
        AND i.paid_at IS NOT NULL
        AND i.paid_at::date BETWEEN _start AND _end
    ) inv
    JOIN forklift_model fm ON fm.id = inv.forklift_id
    GROUP BY fm.model_key
  ),
  maintenance_by_model AS (
    SELECT fm.model_key, COALESCE(SUM(ml.cost), 0) AS maintenance
    FROM public.maintenance_logs ml
    JOIN forklift_model fm ON fm.id = ml.forklift_id
    WHERE ml.performed_at IS NOT NULL
      AND ml.deleted_at IS NULL
      AND ml.performed_at::date BETWEEN _start AND _end
    GROUP BY fm.model_key
  ),
  damages_by_model AS (
    SELECT fm.model_key, COALESCE(SUM(dr.actual_cost), 0) AS damages
    FROM public.damage_records dr
    JOIN forklift_model fm ON fm.id = dr.forklift_id
    WHERE dr.created_at IS NOT NULL
      AND dr.deleted_at IS NULL
      AND dr.created_at::date BETWEEN _start AND _end
    GROUP BY fm.model_key
  )
  SELECT mu.model_key, mu.units,
    COALESCE(r.revenue, 0), COALESCE(m.maintenance, 0), COALESCE(d.damages, 0),
    (COALESCE(r.revenue, 0) - COALESCE(m.maintenance, 0) - COALESCE(d.damages, 0)),
    CASE
      WHEN COALESCE(r.revenue, 0) > 0
        THEN ROUND(((COALESCE(r.revenue, 0) - COALESCE(m.maintenance, 0) - COALESCE(d.damages, 0)) / r.revenue) * 100, 2)
      ELSE 0
    END
  FROM model_units mu
  LEFT JOIN revenue_by_model r ON r.model_key = mu.model_key
  LEFT JOIN maintenance_by_model m ON m.model_key = mu.model_key
  LEFT JOIN damages_by_model d ON d.model_key = mu.model_key
  ORDER BY 6 DESC;
END;
$function$;