-- A4B-11: saldo del portal con conversion canonica de pagos en otra moneda.
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
         COALESCE(v.tipo_cambio, 1)::numeric AS tipo_cambio,
         -- A4B-11: paid_amount / balance provienen del criterio canonico de
         -- v_invoices_with_balance (convierte pagos en otra moneda con el TC).
         COALESCE(v.paid_amount, 0)::numeric     AS paid_amount,
         COALESCE(v.credited_amount, 0)::numeric AS credited_amount,
         COALESCE(v.balance, 0)::numeric         AS balance
  FROM public.v_invoices_with_balance v
  WHERE has_role((select auth.uid()), 'customer'::app_role)
    AND v.customer_id = get_customer_id_for_user((select auth.uid()))
    AND v.status NOT IN ('draft', 'cancelled')
  ORDER BY v.issued_at DESC;
$function$;

-- B5-02: el resumen del cliente debe usar el mismo universo que el portal
-- (sin borradores) y el criterio canonico de pagos/NC.
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
    has_role((select auth.uid()), 'admin'::app_role) OR
    has_role((select auth.uid()), 'administrativo'::app_role) OR
    has_role((select auth.uid()), 'auditor'::app_role) OR
    has_role((select auth.uid()), 'dispatcher'::app_role) OR
    has_role((select auth.uid()), 'ventas'::app_role) OR
    (has_role((select auth.uid()), 'customer'::app_role)
      AND p_customer_id = get_customer_id_for_user((select auth.uid())))
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

  -- B5-02: los borradores no son documentos emitidos; se excluyen del listado
  -- (el PDF de estado de cuenta consume exactamente estas filas).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'invoice_number', i.invoice_number, 'issued_at', i.issued_at,
    'due_date', i.due_date, 'total', i.total, 'status', i.status,
    'currency', COALESCE(i.moneda, 'MXN'),
    'tipo_cambio', COALESCE(NULLIF(i.tipo_cambio, 0), 1)
  ) ORDER BY i.issued_at DESC), '[]'::jsonb)
  INTO v_invoices
  FROM invoices i
  WHERE i.customer_id = p_customer_id
    AND i.status NOT IN ('draft', 'cancelled');

  SELECT jsonb_build_object(
    -- B5-02: mismo universo que el listado (sin draft ni cancelled) y en MXN.
    'total_invoiced', COALESCE(SUM(v.total_mxn) FILTER (
      WHERE v.status NOT IN ('draft', 'cancelled')
    ), 0),
    -- B5-02: pagos con el criterio canonico de conversion de la vista.
    'total_paid', COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(v.moneda, 'MXN')) = 'MXN' THEN ROUND(v.paid_amount, 2)
        WHEN COALESCE(NULLIF(v.tipo_cambio, 0), 0) > 0 THEN ROUND(v.paid_amount * v.tipo_cambio, 2)
        ELSE 0
      END
    ) FILTER (WHERE v.status NOT IN ('draft', 'cancelled')), 0),
    'total_credited', COALESCE(SUM(
      CASE
        WHEN upper(COALESCE(v.moneda, 'MXN')) = 'MXN' THEN ROUND(v.credited_amount, 2)
        WHEN COALESCE(NULLIF(v.tipo_cambio, 0), 0) > 0 THEN ROUND(v.credited_amount * v.tipo_cambio, 2)
        ELSE 0
      END
    ) FILTER (WHERE v.status NOT IN ('draft', 'cancelled')), 0),
    'outstanding_revenue', COALESCE(SUM(v.balance_mxn) FILTER (
      WHERE v.status IN ('sent', 'partial', 'overdue')
        AND COALESCE(v.cancellation_status, '') <> 'accepted'
    ), 0)
  ) INTO v_totals
  FROM public.v_invoices_with_balance v
  WHERE v.customer_id = p_customer_id;

  RETURN jsonb_build_object(
    'bookings', v_bookings,
    'invoices', v_invoices,
    'totals',   v_totals
  );
END;
$function$;