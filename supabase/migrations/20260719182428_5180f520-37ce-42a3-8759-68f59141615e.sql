-- =========================================================
-- BL-43/44/45 — NCs y estatus en cartera, resumen y portal
-- =========================================================

DROP VIEW IF EXISTS public.v_overdue_invoices;
DROP FUNCTION IF EXISTS public.list_invoices_with_balance(text[], date, date, boolean, integer, integer);
DROP VIEW IF EXISTS public.v_invoices_with_balance;

-- 1) Vista con NCs vigentes ------------------------------------------------
CREATE VIEW public.v_invoices_with_balance
WITH (security_invoker = true)
AS
SELECT
  i.*,
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
) cn ON cn.invoice_id = i.id;

COMMENT ON VIEW public.v_invoices_with_balance IS
  'Facturas con paid_amount, credited_amount y balance precalculados. Fuente única de verdad para cartera, cobranza y aging. NCs consideradas: cancellation_status <> ''accepted'' AND status <> ''cancelled''. RLS aplica vía security_invoker.';

GRANT SELECT ON public.v_invoices_with_balance TO authenticated;
GRANT SELECT ON public.v_invoices_with_balance TO service_role;

-- 2) v_overdue_invoices (recreada igual, ahora hereda credited_amount) -----
CREATE VIEW public.v_overdue_invoices
WITH (security_invoker = true)
AS
SELECT
  i.id,
  i.invoice_number,
  i.customer_id,
  i.customer_name,
  i.due_date,
  i.total,
  COALESCE(v.balance, i.total) AS balance,
  CURRENT_DATE - i.due_date AS days_overdue,
  CASE
    WHEN (CURRENT_DATE - i.due_date) <= 30 THEN '0-30'::text
    WHEN (CURRENT_DATE - i.due_date) <= 60 THEN '31-60'::text
    WHEN (CURRENT_DATE - i.due_date) <= 90 THEN '61-90'::text
    ELSE '90+'::text
  END AS bucket
FROM public.invoices i
LEFT JOIN public.v_invoices_with_balance v ON v.id = i.id
WHERE (i.status <> ALL (ARRAY['paid'::text, 'cancelled'::text]))
  AND i.due_date IS NOT NULL
  AND i.due_date < CURRENT_DATE
  AND COALESCE(v.balance, i.total) > 0::numeric;

GRANT SELECT ON public.v_overdue_invoices TO authenticated;
GRANT SELECT ON public.v_overdue_invoices TO service_role;

-- 3) list_invoices_with_balance (recreada con la misma firma y lógica) -----
CREATE OR REPLACE FUNCTION public.list_invoices_with_balance(
  p_statuses          text[]  DEFAULT NULL,
  p_due_from          date    DEFAULT NULL,
  p_due_to            date    DEFAULT NULL,
  p_with_balance_only boolean DEFAULT false,
  p_limit             integer DEFAULT NULL,
  p_offset            integer DEFAULT 0
)
RETURNS SETOF public.v_invoices_with_balance
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_customer_id uuid;
  v_internal boolean;
  v_limit int := GREATEST(COALESCE(p_limit, 2147483647), 0);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_internal := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'administrativo')
             OR public.has_role(v_uid, 'ventas')
             OR public.has_role(v_uid, 'auditor')
             OR public.has_role(v_uid, 'dispatcher')
             OR public.has_role(v_uid, 'mechanic');

  IF v_internal THEN
    RETURN QUERY
      SELECT *
      FROM public.v_invoices_with_balance v
      WHERE (p_statuses IS NULL OR v.status = ANY(p_statuses))
        AND (p_due_from IS NULL OR v.due_date >= p_due_from)
        AND (p_due_to IS NULL OR v.due_date <= p_due_to)
        AND (p_with_balance_only = false OR v.balance > 0)
      ORDER BY v.due_date NULLS LAST, v.issued_at DESC
      LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  IF public.has_role(v_uid, 'customer') THEN
    SELECT c.id INTO v_customer_id
    FROM public.customers c
    WHERE c.auth_user_id = v_uid
      AND c.deleted_at IS NULL
    LIMIT 1;

    IF v_customer_id IS NULL THEN
      RETURN;
    END IF;

    RETURN QUERY
      SELECT *
      FROM public.v_invoices_with_balance v
      WHERE v.customer_id = v_customer_id
        AND (p_statuses IS NULL OR v.status = ANY(p_statuses))
        AND (p_due_from IS NULL OR v.due_date >= p_due_from)
        AND (p_due_to IS NULL OR v.due_date <= p_due_to)
        AND (p_with_balance_only = false OR v.balance > 0)
      ORDER BY v.due_date NULLS LAST, v.issued_at DESC
      LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  RETURN;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_invoices_with_balance(text[], date, date, boolean, integer, integer) TO authenticated;

-- 4) get_customer_summary: agrega outstanding_revenue basado en la vista ---
CREATE OR REPLACE FUNCTION public.get_customer_summary(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bookings jsonb;
  v_invoices jsonb;
  v_totals   jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role) OR
    (has_role(auth.uid(), 'customer'::app_role)
      AND p_customer_id = get_customer_id_for_user(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id, 'booking_number', b.booking_number,
    'start_date', b.start_date, 'end_date', b.end_date, 'status', b.status,
    'forklift', jsonb_build_object('name', f.name, 'model', f.model)
  ) ORDER BY b.start_date DESC), '[]'::jsonb)
  INTO v_bookings
  FROM bookings b
  LEFT JOIN forklifts f ON f.id = b.forklift_id
  WHERE b.customer_id = p_customer_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'invoice_number', i.invoice_number, 'issued_at', i.issued_at,
    'due_date', i.due_date, 'total', i.total, 'status', i.status
  ) ORDER BY i.issued_at DESC), '[]'::jsonb)
  INTO v_invoices
  FROM invoices i
  WHERE i.customer_id = p_customer_id;

  SELECT jsonb_build_object(
    'total_invoiced', COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0),
    'total_paid',     COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0),
    'outstanding_revenue', (
      SELECT COALESCE(SUM(b.balance), 0)
      FROM public.v_invoices_with_balance b
      WHERE b.customer_id = p_customer_id
        AND b.status IN ('sent', 'partial', 'overdue')
    )
  ) INTO v_totals
  FROM invoices
  WHERE customer_id = p_customer_id;

  RETURN jsonb_build_object(
    'bookings', v_bookings,
    'invoices', v_invoices,
    'totals',   v_totals
  );
END;
$function$;

-- 5) get_portal_invoices: excluye draft/cancelled y expone saldos ----------
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