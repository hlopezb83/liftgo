-- R6-B2: get_portal_invoices ahora devuelve tipo_cambio para permitir
-- normalización a MXN en el portal (Estado de Cuenta y detalle).
-- Recreamos la función manteniendo la firma anterior + tipo_cambio numeric.

DROP FUNCTION IF EXISTS public.get_portal_invoices();

CREATE FUNCTION public.get_portal_invoices()
RETURNS TABLE (
  id uuid,
  invoice_number text,
  customer_id uuid,
  status text,
  issued_at date,
  due_date date,
  paid_at date,
  subtotal numeric,
  tax_rate numeric,
  tax_amount numeric,
  total numeric,
  line_items jsonb,
  billing_period_start date,
  billing_period_end date,
  cfdi_pdf_url text,
  cfdi_uuid uuid,
  moneda text,
  tipo_cambio numeric,
  paid_amount numeric,
  credited_amount numeric,
  balance numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT i.id, i.invoice_number, i.customer_id, i.status, i.issued_at,
         i.due_date, i.paid_at, i.subtotal, i.tax_rate, i.tax_amount,
         i.total, i.line_items, i.billing_period_start, i.billing_period_end,
         i.cfdi_pdf_url, i.cfdi_uuid, i.moneda,
         COALESCE(i.tipo_cambio, 1)::numeric AS tipo_cambio,
         COALESCE(p.paid, 0)::numeric      AS paid_amount,
         COALESCE(cn.credited, 0)::numeric AS credited_amount,
         GREATEST(
           i.total - COALESCE(p.paid, 0) - COALESCE(cn.credited, 0),
           0
         )::numeric                        AS balance
  FROM public.invoices i
  LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS paid
    FROM public.payments
    GROUP BY invoice_id
  ) p ON p.invoice_id = i.id
  LEFT JOIN (
    SELECT invoice_id, SUM(total) AS credited
    FROM public.credit_notes
    WHERE cancellation_status <> 'accepted'
      AND status <> 'cancelled'
    GROUP BY invoice_id
  ) cn ON cn.invoice_id = i.id
  WHERE has_role(auth.uid(), 'customer'::app_role)
    AND i.customer_id = get_customer_id_for_user(auth.uid())
    AND i.status NOT IN ('draft', 'cancelled')
  ORDER BY i.issued_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_portal_invoices() TO authenticated;