-- FIX R5-11: get_dashboard_stats, subconsulta 'revenue' de utilization.
-- Antes sumaba i.total en crudo (mezclaba USD y MXN). Ahora convierte a
-- MXN con upper(COALESCE(i.moneda,'MXN')) e i.tipo_cambio, mismo criterio
-- de conversion que invoiced_cte.
-- NOTA: migracion ACUMULATIVA — este CREATE OR REPLACE ya incluye el
-- FIX R5-10 (credited_cte).
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
          FROM (SELECT status, COUNT(*) as cnt, SUM(total) as sum_total FROM invoices WHERE is_e2e IS NOT TRUE GROUP BY status) sub
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
          LEAST(ROUND(
            COALESCE(SUM(GREATEST(LEAST(b.end_date, public.today_mty()) - b.start_date + 1, 0)), 0)::numeric /
            GREATEST(public.today_mty() - f.created_at::date, 1) * 100
          ), 100) as util_pct,
          COALESCE((
            -- FIX R5-11: convertir a MXN (antes mezclaba monedas).
            SELECT SUM(CASE
              WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN i.total
              WHEN i.tipo_cambio > 0 THEN i.total * i.tipo_cambio
            END)
            FROM invoices i
            WHERE i.status = 'paid'
              AND i.is_e2e IS NOT TRUE
              AND i.booking_id IN (SELECT b2.id FROM bookings b2 WHERE b2.forklift_id = f.id)
          ), 0) as revenue
        FROM forklifts f
        LEFT JOIN bookings b ON b.forklift_id = f.id
          AND b.status IN ('confirmed', 'completed')
          AND b.start_date <= public.today_mty()
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
        SELECT mo.m,
          COALESCE(SUM(p.amount_mxn), 0) AS paid
        FROM months mo
        LEFT JOIN payments p
          ON p.payment_date BETWEEN mo.month_start AND mo.month_end
        LEFT JOIN invoices pi ON pi.id = p.invoice_id
          AND pi.status <> 'cancelled'
          AND COALESCE(pi.cancellation_status, '') <> 'accepted'
          AND pi.is_e2e IS NOT TRUE
        WHERE pi.id IS NOT NULL OR p.id IS NULL
        GROUP BY mo.m
      ),
      credited_cte AS (
        -- FIX R5-10: conversion a MXN con el tipo_cambio de la factura
        -- asociada (mismo CASE que invoiced_cte), criterio canonico de
        -- NC vigente y exclusion de NCs de facturas E2E.
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

REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC, anon;