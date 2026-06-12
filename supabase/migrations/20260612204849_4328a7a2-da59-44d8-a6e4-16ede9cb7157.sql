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
  v_today DATE := (now() AT TIME ZONE 'America/Monterrey')::date;
  v_last_prev_month DATE := (date_trunc('month', v_today) - INTERVAL '1 day')::date;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(SUM(f.monthly_rate), 0) INTO v_mrr FROM forklifts f
  WHERE EXISTS (SELECT 1 FROM bookings b WHERE b.forklift_id = f.id AND b.recurring_billing = true
    AND b.start_date <= v_today AND (b.end_date IS NULL OR b.end_date >= v_today));

  SELECT COALESCE(SUM(f.monthly_rate), 0) INTO v_mrr_prev FROM forklifts f
  WHERE EXISTS (SELECT 1 FROM bookings b WHERE b.forklift_id = f.id AND b.recurring_billing = true
    AND b.start_date <= v_last_prev_month AND (b.end_date IS NULL OR b.end_date >= v_last_prev_month));

  SELECT COALESCE(AVG((i.paid_at - i.issued_at::date))::numeric, 0) INTO v_dso FROM invoices i
  WHERE i.status = 'paid' AND i.paid_at IS NOT NULL AND i.paid_at >= (v_today - INTERVAL '90 days');

  SELECT COALESCE(AVG((i.paid_at - i.issued_at::date))::numeric, 0) INTO v_dso_prev FROM invoices i
  WHERE i.status = 'paid' AND i.paid_at IS NOT NULL
    AND i.paid_at >= (v_last_prev_month - INTERVAL '90 days') AND i.paid_at <= v_last_prev_month;

  -- FIX: cartera vencida = saldo (total - pagos), incluye 'partial' y 'overdue'
  SELECT COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0)), 0)
  INTO v_overdue_total
  FROM invoices i
  LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id
  ) p ON p.invoice_id = i.id
  WHERE i.status IN ('sent', 'partial', 'overdue') AND i.due_date < v_today;

  SELECT COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0)), 0)
  INTO v_overdue_total_prev
  FROM invoices i
  LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS paid
    FROM payments
    WHERE payment_date <= v_last_prev_month
    GROUP BY invoice_id
  ) p ON p.invoice_id = i.id
  WHERE i.status IN ('sent', 'partial', 'overdue', 'paid')
    AND i.issued_at <= v_last_prev_month
    AND i.due_date < v_last_prev_month
    AND (i.paid_at IS NULL OR i.paid_at > v_last_prev_month);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'contract_number', c.contract_number, 'customer_name', cu.name,
    'forklift_name', f.name, 'end_date', c.end_date, 'days_remaining', (c.end_date - v_today)
  ) ORDER BY c.end_date), '[]'::jsonb) INTO v_expiring
  FROM contracts c LEFT JOIN customers cu ON cu.id = c.customer_id
  LEFT JOIN forklifts f ON f.id = c.forklift_id
  WHERE c.status = 'active' AND c.end_date IS NOT NULL
    AND c.end_date BETWEEN v_today AND (v_today + INTERVAL '30 days');

  RETURN jsonb_build_object(
    'mrr', v_mrr, 'mrr_prev', v_mrr_prev,
    'dso', ROUND(v_dso, 1), 'dso_prev', ROUND(v_dso_prev, 1),
    'overdue_total', v_overdue_total, 'overdue_total_prev', v_overdue_total_prev,
    'expiring_contracts', v_expiring
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT json_build_object(
    'fleet_counts', (
      SELECT json_build_object(
        'total', COUNT(*),
        'available', COUNT(*) FILTER (WHERE status = 'available'),
        'rented', COUNT(*) FILTER (WHERE status = 'rented'
          AND EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.forklift_id = forklifts.id
              AND b.status = 'confirmed'
              AND CURRENT_DATE BETWEEN b.start_date AND b.end_date
          )),
        'maintenance', COUNT(*) FILTER (WHERE status = 'maintenance'),
        'retired', COUNT(*) FILTER (WHERE status = 'retired'),
        'sold', COUNT(*) FILTER (WHERE status = 'sold')
      ) FROM forklifts
    ),
    'invoice_stats', (
      SELECT json_build_object(
        -- FIX: outstanding_revenue = saldo pendiente (total - pagos)
        'outstanding_revenue', (
          SELECT COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0)), 0)
          FROM invoices i
          LEFT JOIN (
            SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id
          ) p ON p.invoice_id = i.id
          WHERE i.status != 'paid' AND i.status != 'cancelled'
        ),
        'breakdown', COALESCE((
          SELECT json_agg(json_build_object('status', sub.status, 'count', sub.cnt, 'total', sub.sum_total))
          FROM (SELECT status, COUNT(*) as cnt, SUM(total) as sum_total FROM invoices GROUP BY status) sub
        ), '[]'::json)
      )
    ),
    -- FIX: incluye 'partial' y expone balance (saldo restante)
    'overdue_invoices', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', i.id, 'invoice_number', i.invoice_number, 'customer_name', i.customer_name,
        'total', i.total,
        'balance', GREATEST(i.total - COALESCE(p.paid, 0), 0),
        'due_date', i.due_date, 'status', i.status, 'booking_id', i.booking_id
      )), '[]'::json)
      FROM invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id
      ) p ON p.invoice_id = i.id
      WHERE i.status IN ('sent', 'partial', 'overdue')
        AND i.due_date IS NOT NULL
        AND i.due_date < CURRENT_DATE
        AND GREATEST(i.total - COALESCE(p.paid, 0), 0) > 0
    ),
    'overdue_bookings', (
      SELECT COALESCE(json_agg(json_build_object(
        'booking_id', b.id, 'forklift_name', f.name, 'forklift_id', f.id,
        'customer_name', b.customer_name, 'end_date', b.end_date,
        'days_overdue', (CURRENT_DATE - b.end_date)
      ) ORDER BY (CURRENT_DATE - b.end_date) DESC), '[]'::json)
      FROM bookings b JOIN forklifts f ON f.id = b.forklift_id
      WHERE b.status = 'confirmed' AND b.end_date < CURRENT_DATE
    ),
    'maintenance_alerts', (
      SELECT COALESCE(json_agg(json_build_object(
        'forklift_name', f.name, 'forklift_id', f.id, 'next_date', ml.next_service_date
      )), '[]'::json)
      FROM (
        SELECT DISTINCT ON (forklift_id) forklift_id, next_service_date
        FROM maintenance_logs WHERE next_service_date IS NOT NULL
        ORDER BY forklift_id, performed_at DESC
      ) ml JOIN forklifts f ON f.id = ml.forklift_id
      WHERE ml.next_service_date <= (CURRENT_DATE + INTERVAL '7 days')
    ),
    'cash_flow', (
      SELECT COALESCE(json_agg(json_build_object(
        'month', TO_CHAR(month, 'Mon YYYY'), 'month_key', TO_CHAR(month, 'YYYY-MM'),
        'invoiced', invoiced, 'paid', paid
      ) ORDER BY month), '[]'::json)
      FROM (
        SELECT DATE_TRUNC('month', issued_at) as month, SUM(total) as invoiced,
          SUM(CASE WHEN paid_at IS NOT NULL THEN total ELSE 0 END) as paid
        FROM invoices WHERE issued_at >= (CURRENT_DATE - INTERVAL '6 months')
        GROUP BY DATE_TRUNC('month', issued_at)
      ) cf
    ),
    'utilization', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', sub.name, 'utilization', sub.util_pct, 'revenue', sub.revenue
      ) ORDER BY sub.util_pct DESC), '[]'::json)
      FROM (
        SELECT f.name,
          ROUND(COALESCE(SUM(CASE WHEN b.id IS NOT NULL THEN
            LEAST(b.end_date, CURRENT_DATE) - GREATEST(b.start_date, CURRENT_DATE - INTERVAL '30 days')::date + 1
          ELSE 0 END), 0) * 100.0 / 30.0, 1) as util_pct,
          COALESCE(SUM(i.total), 0) as revenue
        FROM forklifts f
        LEFT JOIN bookings b ON b.forklift_id = f.id
          AND b.status = 'confirmed'
          AND b.start_date <= CURRENT_DATE
          AND b.end_date >= (CURRENT_DATE - INTERVAL '30 days')
        LEFT JOIN invoices i ON i.booking_id = b.id AND i.status = 'paid'
        WHERE f.status NOT IN ('retired', 'sold')
        GROUP BY f.id, f.name
      ) sub
    )
  ) INTO result;

  RETURN result;
END;
$function$;