-- Preserve the existing drill-down RPC for older clients. The new one exposes
-- the same credit-note basis used by report_revenue_by_month, so each row and
-- its CSV can reconcile gross revenue to net invoiced revenue.
CREATE FUNCTION public.report_revenue_month_invoices_with_credits(_month_key text)
RETURNS TABLE(
  id uuid,
  invoice_number text,
  customer_name text,
  issued_at date,
  total numeric,
  status text,
  moneda text,
  tipo_cambio numeric,
  credited_mxn numeric
)
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_permission('Reportes', 'read') THEN
    RAISE EXCEPTION 'Permiso insuficiente: se requiere Reportes/read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT i.id, i.invoice_number, i.customer_name, i.issued_at,
    i.total, i.status, i.moneda, i.tipo_cambio,
    COALESCE(n.credited_mxn, 0)
  FROM public.invoices i
  LEFT JOIN LATERAL (
    SELECT SUM(public.fx_to_mxn(cn.total, i.moneda, i.tipo_cambio)) AS credited_mxn
    FROM public.credit_notes cn
    WHERE cn.invoice_id = i.id
      AND cn.cancellation_status <> 'accepted'
      AND cn.status <> 'cancelled'
      AND cn.cfdi_status = 'stamped'
  ) n ON true
  WHERE i.status NOT IN ('draft', 'cancelled')
    AND i.is_e2e IS NOT TRUE
    AND to_char(date_trunc('month', i.issued_at), 'YYYY-MM') = _month_key
  ORDER BY public.fx_to_mxn(i.total, i.moneda, i.tipo_cambio) DESC NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.report_revenue_month_invoices_with_credits(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_revenue_month_invoices_with_credits(text)
  TO authenticated;
