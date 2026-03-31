CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
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
        'outstanding_revenue', (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE status != 'paid'),
        'breakdown', COALESCE((
          SELECT json_agg(json_build_object(
            'status', sub.status,
            'count', sub.cnt,
            'total', sub.sum_total
          ))
          FROM (
            SELECT status, COUNT(*) as cnt, SUM(total) as sum_total
            FROM invoices
            GROUP BY status
          ) sub
        ), '[]'::json)
      )
    ),
    'overdue_invoices', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', id,
        'invoice_number', invoice_number,
        'customer_name', customer_name,
        'total', total,
        'due_date', due_date,
        'status', status,
        'booking_id', booking_id
      )), '[]'::json)
      FROM invoices
      WHERE (status = 'sent' OR status = 'overdue')
        AND due_date IS NOT NULL
        AND due_date < CURRENT_DATE
    ),
    'overdue_bookings', (
      SELECT COALESCE(json_agg(json_build_object(
        'booking_id', b.id,
        'forklift_name', f.name,
        'forklift_id', f.id,
        'customer_name', b.customer_name,
        'end_date', b.end_date,
        'days_overdue', (CURRENT_DATE - b.end_date)
      ) ORDER BY (CURRENT_DATE - b.end_date) DESC), '[]'::json)
      FROM bookings b
      JOIN forklifts f ON f.id = b.forklift_id
      WHERE b.status = 'confirmed'
        AND b.end_date < CURRENT_DATE
    ),
    'maintenance_alerts', (
      SELECT COALESCE(json_agg(json_build_object(
        'forklift_name', f.name,
        'forklift_id', f.id,
        'next_date', ml.next_service_date
      )), '[]'::json)
      FROM (
        SELECT DISTINCT ON (forklift_id) forklift_id, next_service_date
        FROM maintenance_logs
        WHERE next_service_date IS NOT NULL
        ORDER BY forklift_id, performed_at DESC
      ) ml
      JOIN forklifts f ON f.id = ml.forklift_id
      WHERE ml.next_service_date <= (CURRENT_DATE + INTERVAL '7 days')
    ),
    'cash_flow', (
      SELECT COALESCE(json_agg(json_build_object(
        'month', TO_CHAR(month, 'Mon YYYY'),
        'month_key', TO_CHAR(month, 'YYYY-MM'),
        'invoiced', invoiced,
        'paid', paid
      ) ORDER BY month), '[]'::json)
      FROM (
        SELECT
          DATE_TRUNC('month', issued_at) as month,
          SUM(total) as invoiced,
          SUM(CASE WHEN paid_at IS NOT NULL THEN total ELSE 0 END) as paid
        FROM invoices
        WHERE issued_at >= (CURRENT_DATE - INTERVAL '6 months')
        GROUP BY DATE_TRUNC('month', issued_at)
      ) cf
    ),
    'utilization', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', sub.name,
        'utilization', sub.util_pct,
        'revenue', sub.revenue
      ) ORDER BY sub.revenue DESC), '[]'::json)
      FROM (
        SELECT
          f.id,
          f.name,
          LEAST(ROUND(
            COALESCE(SUM(GREATEST(b.end_date - b.start_date + 1, 0)), 0)::numeric /
            GREATEST(CURRENT_DATE - f.created_at::date, 1) * 100
          ), 100) as util_pct,
          COALESCE((
            SELECT SUM(i.total)
            FROM invoices i
            WHERE i.status = 'paid'
              AND i.booking_id IN (SELECT b2.id FROM bookings b2 WHERE b2.forklift_id = f.id)
          ), 0) as revenue
        FROM forklifts f
        LEFT JOIN bookings b ON b.forklift_id = f.id
        WHERE f.status NOT IN ('sold', 'retired')
        GROUP BY f.id, f.name, f.created_at
        LIMIT 10
      ) sub
    ),
    'weekly_utilization', (
      SELECT COALESCE(json_agg(json_build_object(
        'week_label', wu.week_label,
        'utilization', wu.util_pct
      ) ORDER BY wu.week_start), '[]'::json)
      FROM (
        SELECT
          ws.week_start,
          'Sem ' || EXTRACT(WEEK FROM ws.week_start)::text AS week_label,
          ROUND(
            COUNT(DISTINCT CASE WHEN b.id IS NOT NULL THEN f.id END)::numeric /
            NULLIF(COUNT(DISTINCT f.id), 0) * 100
          ) AS util_pct
        FROM generate_series(
          CURRENT_DATE - INTERVAL '8 weeks',
          CURRENT_DATE,
          '1 week'::interval
        ) ws(week_start)
        CROSS JOIN forklifts f
        LEFT JOIN bookings b
          ON b.forklift_id = f.id
          AND b.status = 'confirmed'
          AND b.start_date <= ws.week_start + 6
          AND b.end_date >= ws.week_start
        WHERE f.status NOT IN ('sold', 'retired')
        GROUP BY ws.week_start
      ) wu
    ),
    'recent_activity', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', id,
        'event_type', event_type,
        'entity_type', entity_type,
        'entity_id', entity_id,
        'title', title,
        'description', description,
        'created_at', created_at
      ) ORDER BY created_at DESC), '[]'::json)
      FROM (
        SELECT * FROM activity_feed ORDER BY created_at DESC LIMIT 20
      ) af
    )
  ) INTO result;

  RETURN result;
END;
$$;