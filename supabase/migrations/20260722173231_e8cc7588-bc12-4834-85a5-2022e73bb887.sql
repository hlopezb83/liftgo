CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        'outstanding_revenue', (
          SELECT COALESCE(SUM(v.balance_mxn), 0)
          FROM public.v_invoices_with_balance v
          WHERE v.status IN ('sent', 'partial', 'overdue')
            AND COALESCE(v.cancellation_status, '') <> 'accepted'
        ),
        'breakdown', COALESCE((
          SELECT json_agg(json_build_object('status', sub.status, 'count', sub.cnt, 'total', sub.sum_total))
          FROM (SELECT status, COUNT(*) as cnt, SUM(total) as sum_total FROM invoices GROUP BY status) sub
        ), '[]'::json)
      )
    ),
    'overdue_invoices', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', v.id, 'invoice_number', v.invoice_number, 'customer_name', v.customer_name,
        'total', v.total,
        'balance', v.balance,
        'balance_mxn', v.balance_mxn,
        'due_date', v.due_date, 'status', v.status, 'booking_id', v.booking_id
      )), '[]'::json)
      FROM public.v_invoices_with_balance v
      WHERE v.status IN ('sent', 'partial', 'overdue')
        AND COALESCE(v.cancellation_status, '') <> 'accepted'
        AND v.due_date IS NOT NULL
        AND v.due_date < CURRENT_DATE
        AND v.balance > 0
    ),
    'overdue_bookings', (
      SELECT COALESCE(json_agg(json_build_object(
        'booking_id', b.id, 'forklift_name', f.name, 'forklift_id', f.id,
        'customer_name', b.customer_name, 'end_date', b.end_date,
        'days_overdue', (CURRENT_DATE - b.end_date)
      ) ORDER BY (CURRENT_DATE - b.end_date) DESC), '[]'::json)
      FROM bookings b
      LEFT JOIN forklifts f ON f.id = b.forklift_id
      WHERE b.status = 'confirmed'
        AND b.return_status IS DISTINCT FROM 'returned'
        AND b.end_date < CURRENT_DATE
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
      WITH months AS (
        SELECT (DATE_TRUNC('month', CURRENT_DATE)::date - make_interval(months => m))::date AS m
        FROM generate_series(5, 0, -1) AS m
      ),
      window_start AS (
        SELECT (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months')::date AS d
      ),
      invoiced_cte AS (
        SELECT DATE_TRUNC('month', i.issued_at)::date AS m, SUM(i.total) AS amt
        FROM invoices i, window_start w
        WHERE i.issued_at >= w.d
          AND i.status <> 'cancelled'
          AND i.cancelled_at IS NULL
        GROUP BY 1
      ),
      credited_cte AS (
        SELECT DATE_TRUNC('month', c.issued_at)::date AS m, SUM(c.total) AS amt
        FROM credit_notes c, window_start w
        WHERE c.issued_at >= w.d
          AND COALESCE(c.status, '') <> 'cancelled'
          AND c.cancelled_at IS NULL
        GROUP BY 1
      ),
      paid_cte AS (
        SELECT DATE_TRUNC('month', src.paid_on)::date AS m, SUM(src.amt) AS amt
        FROM (
          SELECT p.payment_date AS paid_on, p.amount AS amt
          FROM payments p
          JOIN invoices i ON i.id = p.invoice_id
          CROSS JOIN window_start w
          WHERE p.payment_date >= w.d
            AND i.status <> 'cancelled'
            AND i.cancelled_at IS NULL
          UNION ALL
          SELECT i.paid_at AS paid_on, i.total AS amt
          FROM invoices i, window_start w
          WHERE i.paid_at IS NOT NULL
            AND i.paid_at >= w.d
            AND i.status <> 'cancelled'
            AND i.cancelled_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.invoice_id = i.id)
        ) src
        GROUP BY 1
      )
      SELECT COALESCE(json_agg(json_build_object(
        'month',     TO_CHAR(months.m, 'Mon YYYY'),
        'month_key', TO_CHAR(months.m, 'YYYY-MM'),
        'invoiced',  COALESCE(inv.amt, 0) - COALESCE(cn.amt, 0),
        'paid',      COALESCE(pd.amt, 0)
      ) ORDER BY months.m), '[]'::json)
      FROM months
      LEFT JOIN invoiced_cte inv ON inv.m = months.m
      LEFT JOIN credited_cte cn  ON cn.m  = months.m
      LEFT JOIN paid_cte     pd  ON pd.m  = months.m
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
    ),
    'monthly_utilization', (
      WITH months AS (
        SELECT
          (DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m)))::date AS month_start,
          ((DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m))) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end
        FROM generate_series(5, 0, -1) AS m
      ),
      fleet AS (
        SELECT COUNT(*)::int AS total FROM forklifts WHERE status NOT IN ('retired', 'sold')
      )
      SELECT COALESCE(json_agg(json_build_object(
        'month_label',
          CASE EXTRACT(MONTH FROM mo.month_start)::int
            WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
            WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
            WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
            WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dic'
          END || ' ' || TO_CHAR(mo.month_start, 'YY'),
        'utilization', CASE
          WHEN fleet.total = 0 THEN 0
          ELSE ROUND(
            COALESCE((
              SELECT SUM(LEAST(b.end_date, mo.month_end) - GREATEST(b.start_date, mo.month_start) + 1)
              FROM bookings b
              JOIN forklifts f ON f.id = b.forklift_id
              WHERE b.status = 'confirmed'
                AND f.status NOT IN ('retired', 'sold')
                AND b.start_date <= mo.month_end
                AND b.end_date >= mo.month_start
            ), 0) * 100.0 / (fleet.total * (mo.month_end - mo.month_start + 1))
          )
        END
      ) ORDER BY mo.month_start), '[]'::json)
      FROM months mo CROSS JOIN fleet
    )
  ) INTO result;

  RETURN result;
END;
$function$;