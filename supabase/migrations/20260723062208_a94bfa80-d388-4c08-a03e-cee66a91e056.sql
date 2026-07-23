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
    'cash_flow', (
      WITH months AS (
        SELECT
          (DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m)))::date AS month_start,
          ((DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m))) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end,
          m
        FROM generate_series(5, 0, -1) AS m
      ),
      invoiced_cte AS (
        SELECT mo.m,
          COALESCE(SUM(i.total), 0) AS invoiced
        FROM months mo
        LEFT JOIN invoices i
          ON i.issued_at::date BETWEEN mo.month_start AND mo.month_end
          AND i.status <> 'draft'
          AND COALESCE(i.cancellation_status, '') <> 'accepted'
        GROUP BY mo.m
      ),
      credited_cte AS (
        SELECT mo.m,
          COALESCE(SUM(cn.total), 0) AS credited
        FROM months mo
        LEFT JOIN credit_notes cn
          ON cn.issued_at::date BETWEEN mo.month_start AND mo.month_end
          AND cn.status = 'stamped'
        GROUP BY mo.m
      ),
      paid_cte AS (
        SELECT mo.m,
          COALESCE(SUM(p.amount), 0) AS paid
        FROM months mo
        LEFT JOIN payments p
          ON p.payment_date::date BETWEEN mo.month_start AND mo.month_end
        GROUP BY mo.m
      )
      SELECT COALESCE(json_agg(json_build_object(
        'month_label',
          CASE EXTRACT(MONTH FROM months.month_start)::int
            WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
            WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
            WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
            WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dic'
          END || ' ' || TO_CHAR(months.month_start, 'YY'),
        'invoiced', inv.invoiced,
        'credited', cn.credited,
        'net_invoiced', inv.invoiced - cn.credited,
        'paid', pd.paid
      ) ORDER BY months.month_start), '[]'::json)
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
        SELECT f.id, f.name,
          ROUND(
            COALESCE((
              SELECT COUNT(DISTINCT d)::numeric
              FROM bookings b
              CROSS JOIN LATERAL generate_series(
                GREATEST(b.start_date, (CURRENT_DATE - INTERVAL '30 days')::date),
                LEAST(b.end_date, CURRENT_DATE),
                INTERVAL '1 day'
              ) AS d
              WHERE b.forklift_id = f.id
                AND b.status IN ('confirmed', 'completed')
            ), 0) / 30.0 * 100
          , 2) AS util_pct,
          COALESCE((
            SELECT SUM(b.monthly_rate)
            FROM bookings b
            WHERE b.forklift_id = f.id
              AND b.status IN ('confirmed', 'completed')
              AND b.start_date <= CURRENT_DATE
              AND b.end_date >= (CURRENT_DATE - INTERVAL '30 days')::date
          ), 0) AS revenue
        FROM forklifts f
        WHERE f.status <> 'retired'
        LIMIT 10
      ) sub
    ),
    'monthly_utilization', (
      WITH months AS (
        SELECT
          (DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m)))::date AS month_start,
          ((DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m))) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end,
          m
        FROM generate_series(5, 0, -1) AS m
      ),
      fleet_days AS (
        SELECT mo.m, mo.month_start,
          (SELECT COUNT(*) FROM forklifts WHERE status <> 'retired') *
          (mo.month_end - mo.month_start + 1) AS available_days
        FROM months mo
      ),
      rented_days AS (
        SELECT mo.m,
          COUNT(DISTINCT (b.forklift_id::text || '|' || d::text)) AS rented
        FROM months mo
        LEFT JOIN bookings b ON b.status IN ('confirmed', 'completed')
        LEFT JOIN LATERAL generate_series(
          GREATEST(b.start_date, mo.month_start),
          LEAST(b.end_date, mo.month_end),
          INTERVAL '1 day'
        ) AS d ON TRUE
        GROUP BY mo.m
      )
      SELECT COALESCE(json_agg(json_build_object(
        'month_label',
          CASE EXTRACT(MONTH FROM months.month_start)::int
            WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
            WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
            WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
            WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dic'
          END || ' ' || TO_CHAR(months.month_start, 'YY'),
        'utilization', CASE WHEN fd.available_days > 0
          THEN ROUND(rd.rented::numeric / fd.available_days * 100, 2)
          ELSE 0 END
      ) ORDER BY months.month_start), '[]'::json)
      FROM months
      LEFT JOIN fleet_days fd ON fd.m = months.m
      LEFT JOIN rented_days rd ON rd.m = months.m
    )
  ) INTO result;

  RETURN result;
END;
$function$;