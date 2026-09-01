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
  -- FIX: el fallback al tipo de cambio de la FACTURA sólo es válido cuando el
  -- pago está en la misma moneda que la factura. En cross-currency reinterpreta
  -- el importe del pago en otra divisa (p. ej. un pago USD contado como MXN 1:1).
  payment_conv AS (
    SELECT p.invoice_id,
      COALESCE(
        public.fx_to_mxn(p.amount, COALESCE(p.currency, i.moneda), NULLIF(p.exchange_rate, 0)),
        CASE
          WHEN upper(COALESCE(p.currency, i.moneda, 'MXN')) = upper(COALESCE(i.moneda, 'MXN'))
          THEN public.fx_to_mxn(p.amount, i.moneda, i.tipo_cambio)
        END
      ) AS amount_mxn
    FROM public.payments p
    JOIN public.invoices i ON i.id = p.invoice_id
  ),
  paid_by_invoice AS (
    SELECT pc.invoice_id,
      SUM(pc.amount_mxn) AS paid_mxn,
      BOOL_OR(pc.amount_mxn IS NULL) AS fx_missing
    FROM payment_conv pc
    GROUP BY pc.invoice_id
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'invoice_number', i.invoice_number, 'issued_at', i.issued_at,
    'due_date', i.due_date, 'total', i.total, 'status', i.status,
    'currency', COALESCE(i.moneda, 'MXN'),
    'tipo_cambio', i.tipo_cambio,
    'fx_missing', public.fx_is_missing(i.moneda, i.tipo_cambio)
  ) ORDER BY i.issued_at DESC), '[]'::jsonb)
  INTO v_invoices
  FROM invoices i
  WHERE i.customer_id = p_customer_id
    AND i.status NOT IN ('draft', 'cancelled');

  WITH scoped AS (
    SELECT v.*,
           public.fx_is_missing(v.moneda, v.tipo_cambio) AS fx_missing,
           CASE WHEN upper(COALESCE(v.moneda, 'MXN')) = 'MXN'
                THEN 1::numeric ELSE v.tipo_cambio END AS rate
    FROM public.v_invoices_with_balance v
    WHERE v.customer_id = p_customer_id
      AND v.status NOT IN ('draft', 'cancelled')
  ),
  usable AS (
    SELECT * FROM scoped WHERE NOT fx_missing
  )
  SELECT jsonb_build_object(
    'total_invoiced',  COALESCE((SELECT SUM(ROUND(u.total * u.rate, 2)) FROM usable u), 0),
    'total_paid',      COALESCE((SELECT SUM(ROUND(u.paid_amount * u.rate, 2)) FROM usable u), 0),
    'total_credited',  COALESCE((SELECT SUM(ROUND(u.credited_amount * u.rate, 2)) FROM usable u), 0),
    'outstanding_revenue', COALESCE((
      SELECT SUM(ROUND(u.balance * u.rate, 2)) FROM usable u
      WHERE u.status IN ('sent', 'partial', 'overdue')
        AND COALESCE(u.cancellation_status, '') <> 'accepted'
    ), 0),
    -- FIX: la advertencia existente también cubre pagos que no se pudieron
    -- convertir (payments_fx_missing), no sólo el FX de la factura.
    'fx_missing_count', COALESCE((
      SELECT COUNT(*) FROM scoped s
      WHERE s.fx_missing OR COALESCE(s.payments_fx_missing, 0) > 0
    ), 0)
  ) INTO v_totals;

  RETURN jsonb_build_object(
    'bookings', v_bookings,
    'invoices', v_invoices,
    'totals',   v_totals
  );
END;
$function$;