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
        'rented', (
          SELECT COUNT(DISTINCT b.forklift_id)
          FROM bookings b
          JOIN forklifts f ON f.id = b.forklift_id
          WHERE b.status = 'confirmed'
            AND CURRENT_DATE BETWEEN b.start_date AND b.end_date
            AND f.status NOT IN ('retired', 'sold')
        ),
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
    -- BUG-FIX v7.201: exponer facturas vencidas para "Pronóstico de Cobranza"
    -- y barras de antigüedad del dashboard. Fuente: v_invoices_with_balance.
    'overdue_invoices', COALESCE((
      SELECT json_agg(json_build_object(
        'id', v.id,
        'invoice_number', v.invoice_number,
        'total', v.total,
        'balance', v.balance,
        'balance_mxn', v.balance_mxn,
        'moneda', v.moneda,
        'tipo_cambio', v.tipo_cambio,
        'due_date', v.due_date
      ) ORDER BY v.due_date ASC)
      FROM public.v_invoices_with_balance v
      WHERE v.status IN ('sent', 'partial', 'overdue')
        AND COALESCE(v.cancellation_status, '') <> 'accepted'
        AND v.due_date IS NOT NULL
        AND v.due_date < CURRENT_DATE
        AND COALESCE(v.balance_mxn, 0) > 0
    ), '[]'::json),
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
      paid_cte AS (
        SELECT mo.m,
          COALESCE(SUM(p.amount), 0) AS paid
        FROM months mo
        LEFT JOIN payments p
          ON p.payment_date BETWEEN mo.month_start AND mo.month_end
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
      )
      SELECT COALESCE(json_agg(json_build_object(
        'month_label',
          CASE EXTRACT(MONTH FROM months.month_start)::int
            WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
            WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
            WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
            WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dic'
          END || ' ' || TO_CHAR(months.month_start, 'YY'),
        'invoiced', ic.invoiced,
        'paid', pc.paid,
        'credited', cc.credited
      ) ORDER BY months.month_start), '[]'::json)
      FROM months
      LEFT JOIN invoiced_cte ic ON ic.m = months.m
      LEFT JOIN paid_cte pc ON pc.m = months.m
      LEFT JOIN credited_cte cc ON cc.m = months.m
    ),
    'monthly_utilization', (
      WITH months AS (
        SELECT
          (DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m)))::date AS month_start,
          ((DATE_TRUNC('month', CURRENT_DATE)::date - (make_interval(months => m))) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end,
          m
        FROM generate_series(5, 0, -1) AS m
      ),
      bounded AS (
        SELECT mo.m, mo.month_start,
          mo.month_start AS eff_start,
          LEAST(mo.month_end, CURRENT_DATE) AS eff_end
        FROM months mo
      ),
      fleet_days AS (
        SELECT b.m, b.month_start,
          (SELECT COUNT(*) FROM forklifts WHERE status NOT IN ('retired', 'sold')) *
          GREATEST((b.eff_end - b.eff_start + 1), 0) AS available_days,
          b.eff_start, b.eff_end
        FROM bounded b
      ),
      rented_days AS (
        SELECT fd.m,
          COUNT(DISTINCT (bk.forklift_id::text || '|' || d::text)) AS rented
        FROM fleet_days fd
        LEFT JOIN bookings bk ON bk.status IN ('confirmed', 'completed')
        LEFT JOIN LATERAL generate_series(
          GREATEST(bk.start_date, fd.eff_start),
          LEAST(bk.end_date, fd.eff_end),
          INTERVAL '1 day'
        ) AS d ON TRUE
        GROUP BY fd.m
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