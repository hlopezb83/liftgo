-- RPC: Get customer summary (bookings + invoices) in single call
CREATE OR REPLACE FUNCTION public.get_customer_summary(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bookings jsonb;
  v_invoices jsonb;
  v_totals jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'booking_number', b.booking_number,
    'start_date', b.start_date,
    'end_date', b.end_date,
    'status', b.status,
    'forklift', jsonb_build_object('name', f.name, 'model', f.model)
  ) ORDER BY b.start_date DESC), '[]'::jsonb)
  INTO v_bookings
  FROM bookings b
  LEFT JOIN forklifts f ON f.id = b.forklift_id
  WHERE b.customer_id = p_customer_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'issued_at', i.issued_at,
    'due_date', i.due_date,
    'total', i.total,
    'status', i.status
  ) ORDER BY i.issued_at DESC), '[]'::jsonb)
  INTO v_invoices
  FROM invoices i
  WHERE i.customer_id = p_customer_id;

  SELECT jsonb_build_object(
    'total_invoiced', COALESCE(SUM(total), 0),
    'total_paid', COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0)
  )
  INTO v_totals
  FROM invoices
  WHERE customer_id = p_customer_id;

  RETURN jsonb_build_object(
    'bookings', v_bookings,
    'invoices', v_invoices,
    'totals', v_totals
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_summary(uuid) TO authenticated;