-- 2A-8: ocupación real por reserva (entrega/devolución reales, no sólo fechas plan).
CREATE OR REPLACE VIEW public.v_booking_occupancy
WITH (security_invoker = on) AS
SELECT
  b.id AS booking_id,
  b.forklift_id,
  b.status,
  b.is_e2e,
  GREATEST(
    b.start_date,
    COALESCE((
      SELECT MIN(d.completed_at)::date
      FROM public.deliveries d
      WHERE d.booking_id = b.id
        AND d.type = 'delivery'
        AND d.status = 'completed'
        AND d.completed_at IS NOT NULL
    ), b.start_date)
  ) AS occ_start,
  LEAST(
    public.today_mty(),
    COALESCE(
      (SELECT MAX(ri.inspected_at)::date
         FROM public.return_inspections ri
        WHERE ri.booking_id = b.id),
      (SELECT MIN(d2.completed_at)::date
         FROM public.deliveries d2
        WHERE d2.booking_id = b.id
          AND d2.type = 'return'
          AND d2.status = 'completed'
          AND d2.completed_at IS NOT NULL),
      CASE WHEN b.status = 'completed' THEN b.end_date ELSE public.today_mty() END
    )
  ) AS occ_end
FROM public.bookings b
WHERE b.status IN ('confirmed', 'completed');

GRANT SELECT ON public.v_booking_occupancy TO authenticated;
GRANT SELECT ON public.v_booking_occupancy TO service_role;

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
        'rented', COUNT(*) FILTER (WHERE status = 'rented'),
        'maintenance', COUNT(*) FILTER (WHERE status = 'maintenance'),
        'out_of_service', COUNT(*) FILTER (WHERE status = 'out_of_service'),
        'retired', COUNT(*) FILTER (WHERE status = 'retired'),
        'sold', COUNT(*) FILTER (WHERE status = 'sold')
      ) FROM forklifts
      WHERE deleted_at IS NULL AND is_e2e IS NOT TRUE
    ),
    'invoice_stats', (
      SELECT json_build_object(
        'outstanding_revenue', (
          SELECT COALESCE(SUM(v.balance_mxn), 0)
          FROM public.v_invoices_with_balance v
          WHERE v.status IN ('sent', 'partial', 'overdue')
            AND COALESCE(v.cancellation_status, '') <> 'accepted'
            AND v.is_e2e IS NOT TRUE
        ),
        'breakdown', COALESCE((
          SELECT json_agg(json_build_object('status', sub.status, 'count', sub.cnt, 'total', sub.sum_total))
          FROM (
            SELECT status, COUNT(*) as cnt,
              -- FIX R6-21: convertir a MXN antes de sumar (antes mezclaba
              -- USD y MXN 1:1 en el desglose por estatus).
              SUM(CASE
                WHEN upper(COALESCE(moneda, 'MXN')) = 'MXN' THEN total
                WHEN tipo_cambio IS NOT NULL AND tipo_cambio > 0 THEN total * tipo_cambio
                ELSE 0
              END) as sum_total
            FROM invoices WHERE is_e2e IS NOT TRUE GROUP BY status
          ) sub
        ), '[]'::json)
      )
    ),
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
        AND v.due_date < public.today_mty()
        AND COALESCE(v.balance_mxn, 0) > 0
        AND v.is_e2e IS NOT TRUE
    ), '[]'::json),
    'overdue_bookings', COALESCE((
      SELECT json_agg(json_build_object(
        'booking_id', x.booking_id,
        'forklift_name', x.forklift_name,
        'forklift_id', x.forklift_id,
        'customer_name', x.customer_name,
        'end_date', x.end_date,
        'days_overdue', x.days_overdue
      ) ORDER BY x.end_date ASC)
      FROM (
        SELECT b.id AS booking_id,
               f.name AS forklift_name,
               f.id   AS forklift_id,
               c.name AS customer_name,
               b.end_date,
               (public.today_mty() - b.end_date)::int AS days_overdue
        FROM public.bookings b
        JOIN public.forklifts f ON f.id = b.forklift_id
        LEFT JOIN public.customers c ON c.id = b.customer_id
        WHERE b.status = 'confirmed'
          AND b.is_e2e IS NOT TRUE
          AND b.end_date < public.today_mty()
          AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
      ) x
    ), '[]'::json),
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
          -- 2A-8: días realmente ocupados (entrega/devolución reales) en vez
          -- de las fechas planeadas de la reserva.
          LEAST(ROUND(
            COALESCE(SUM(GREATEST(o.occ_end - o.occ_start + 1, 0)), 0)::numeric /
            GREATEST(public.today_mty() - f.created_at::date, 1) * 100
          ), 100) as util_pct,
          COALESCE((
            -- FIX A1: incluye facturas multi-reserva (invoice_bookings) via
            -- la vista de atribucion; ya viene convertida a MXN.
            SELECT SUM(r.total_mxn_share)
            FROM public.v_invoice_forklift_revenue r
            WHERE r.forklift_id = f.id
              AND r.status = 'paid'
              AND r.is_e2e IS NOT TRUE
          ), 0) as revenue
        FROM forklifts f
        LEFT JOIN public.v_booking_occupancy o ON o.forklift_id = f.id
          AND o.is_e2e IS NOT TRUE
          AND o.occ_start <= public.today_mty()
        WHERE f.status NOT IN ('sold', 'retired')
          AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
        GROUP BY f.id, f.name, f.created_at
        LIMIT 10
      ) sub
    ),
    'maintenance_alerts', (
      SELECT COALESCE(json_agg(json_build_object(
        'forklift_name', f.name,
        'forklift_id', f.id,
        'next_date', ml.next_service_date
      ) ORDER BY ml.next_service_date ASC), '[]'::json)
      FROM (
        SELECT DISTINCT ON (forklift_id) forklift_id, next_service_date
        FROM maintenance_logs
        WHERE next_service_date IS NOT NULL
          AND deleted_at IS NULL
          AND is_e2e IS NOT TRUE
        ORDER BY forklift_id, performed_at DESC
      ) ml
      JOIN forklifts f ON f.id = ml.forklift_id
      WHERE ml.next_service_date <= (public.today_mty() + INTERVAL '7 days')
        AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
    ),
    'cash_flow', (
      WITH months AS (
        SELECT
          (DATE_TRUNC('month', public.today_mty())::date - (make_interval(months => m)))::date AS month_start,
          ((DATE_TRUNC('month', public.today_mty())::date - (make_interval(months => m))) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end,
          m
        FROM generate_series(5, 0, -1) AS m
      ),
      invoiced_cte AS (
        SELECT mo.m,
          COALESCE(SUM(CASE
            WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN i.total
            WHEN i.tipo_cambio IS NOT NULL AND i.tipo_cambio > 0 THEN i.total * i.tipo_cambio
            ELSE 0
          END), 0) AS invoiced
        FROM months mo
        LEFT JOIN invoices i
          ON i.issued_at::date BETWEEN mo.month_start AND mo.month_end
          AND i.status <> 'draft'
          AND COALESCE(i.cancellation_status, '') <> 'accepted'
          AND i.is_e2e IS NOT TRUE
        GROUP BY mo.m
      ),
      paid_cte AS (
        SELECT mo.m, COALESCE(SUM(src.amt), 0) AS paid
        FROM months mo
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            p.amount_mxn,
            p.amount * COALESCE(
              NULLIF(p.exchange_rate, 0),
              NULLIF(pi.tipo_cambio, 0),
              CASE WHEN upper(COALESCE(p.currency, 'MXN')) = 'MXN' THEN 1 END
            )
          ) AS amt
          FROM payments p
          JOIN invoices pi ON pi.id = p.invoice_id
            AND pi.status <> 'cancelled'
            AND COALESCE(pi.cancellation_status, '') <> 'accepted'
            AND pi.is_e2e IS NOT TRUE
          WHERE p.payment_date BETWEEN mo.month_start AND mo.month_end
          UNION ALL
          SELECT COALESCE(CASE
            WHEN upper(COALESCE(i2.moneda, 'MXN')) = 'MXN' THEN i2.total
            WHEN i2.tipo_cambio IS NOT NULL AND i2.tipo_cambio > 0 THEN i2.total * i2.tipo_cambio
          END, 0)
          FROM invoices i2
          WHERE i2.status = 'paid'
            AND i2.paid_at IS NOT NULL
            AND i2.paid_at::date BETWEEN mo.month_start AND mo.month_end
            AND COALESCE(i2.cancellation_status, '') <> 'accepted'
            AND i2.is_e2e IS NOT TRUE
            AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.invoice_id = i2.id)
        ) src ON TRUE
        GROUP BY mo.m
      ),
      credited_cte AS (
        SELECT mo.m,
          COALESCE(SUM(CASE
            WHEN upper(COALESCE(cn.currency, 'MXN')) = 'MXN' THEN cn.total
            WHEN inv.tipo_cambio IS NOT NULL AND inv.tipo_cambio > 0 THEN cn.total * inv.tipo_cambio
            ELSE 0
          END), 0) AS credited
        FROM months mo
        LEFT JOIN credit_notes cn
          ON cn.issued_at::date BETWEEN mo.month_start AND mo.month_end
          AND cn.cfdi_status = 'stamped'
          AND cn.status <> 'cancelled'
          AND cn.cancellation_status IS DISTINCT FROM 'accepted'
        LEFT JOIN invoices inv
          ON inv.id = cn.invoice_id
          AND inv.is_e2e IS NOT TRUE
        WHERE cn.id IS NULL OR inv.id IS NOT NULL
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
          (DATE_TRUNC('month', public.today_mty())::date - (make_interval(months => m)))::date AS month_start,
          ((DATE_TRUNC('month', public.today_mty())::date - (make_interval(months => m))) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end,
          m
        FROM generate_series(5, 0, -1) AS m
      ),
      bounded AS (
        SELECT mo.m, mo.month_start,
          mo.month_start AS eff_start,
          LEAST(mo.month_end, public.today_mty()) AS eff_end
        FROM months mo
      ),
      fleet_days AS (
        SELECT b.m, b.month_start,
          (SELECT COUNT(*) FROM forklifts WHERE status NOT IN ('retired', 'sold')
            AND deleted_at IS NULL AND is_e2e IS NOT TRUE) *
          GREATEST((b.eff_end - b.eff_start + 1), 0) AS available_days,
          b.eff_start, b.eff_end
        FROM bounded b
      ),
      rented_days AS (
        -- 2A-8: usa ocupación real (entrega/devolución) por reserva.
        SELECT fd.m,
          COUNT(DISTINCT (bk.forklift_id::text || '|' || d::text)) AS rented
        FROM fleet_days fd
        LEFT JOIN public.v_booking_occupancy bk ON bk.is_e2e IS NOT TRUE
        LEFT JOIN LATERAL generate_series(
          GREATEST(bk.occ_start, fd.eff_start),
          LEAST(bk.occ_end, fd.eff_end),
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