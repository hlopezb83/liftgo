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
        'rented', COUNT(*) FILTER (WHERE status = 'rented'),
        'maintenance', COUNT(*) FILTER (WHERE status = 'maintenance'),
        'retired', COUNT(*) FILTER (WHERE status = 'retired')
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
        GROUP BY f.id, f.name, f.created_at
        LIMIT 10
      ) sub
    )
  ) INTO result;
  
  RETURN result;
END;
$$;