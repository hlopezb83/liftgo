CREATE OR REPLACE FUNCTION public.get_customer_summary(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
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
    'due_date', i.due_date, 'total', i.total, 'status', i.status,
    'currency', COALESCE(i.currency, 'MXN'),
    'tipo_cambio', COALESCE(NULLIF(i.tipo_cambio, 0), 1)
  ) ORDER BY i.issued_at DESC), '[]'::jsonb)
  INTO v_invoices
  FROM invoices i
  WHERE i.customer_id = p_customer_id;

  SELECT jsonb_build_object(
    'total_invoiced', COALESCE(SUM(
      ROUND(total * COALESCE(NULLIF(tipo_cambio,0),1), 2)
    ) FILTER (WHERE status <> 'cancelled'), 0),
    'total_paid', (
      SELECT COALESCE(SUM(p.amount * COALESCE(NULLIF(i2.tipo_cambio,0),1)), 0)
      FROM public.payments p
      JOIN public.invoices i2 ON i2.id = p.invoice_id
      WHERE i2.customer_id = p_customer_id
        AND i2.status <> 'cancelled'
    ),
    'outstanding_revenue', (
      SELECT COALESCE(SUM(b.balance_mxn), 0)
      FROM public.v_invoices_with_balance b
      WHERE b.customer_id = p_customer_id
        AND b.status IN ('sent', 'partial', 'overdue')
        AND COALESCE(b.cancellation_status, '') <> 'accepted'
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