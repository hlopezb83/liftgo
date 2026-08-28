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
  v_overdue_fx_missing INT := 0;
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

  -- FIX A4: la renta mensual se sumaba en crudo aunque la reserva
  -- estuviera pactada en dólares. Se convierte a MXN.
  SELECT COALESCE(SUM(
           COALESCE(b.monthly_rate, f.monthly_rate, 0)
           * CASE WHEN upper(COALESCE(b.currency, 'MXN')) = 'MXN'
                  THEN 1 ELSE COALESCE(NULLIF(b.tipo_cambio, 0), 1) END
         ), 0)
    INTO v_mrr
    FROM bookings b JOIN forklifts f ON f.id = b.forklift_id
   WHERE b.recurring_billing = true AND b.status = 'confirmed'
     AND b.start_date <= v_today
     AND (b.end_date IS NULL OR b.end_date >= v_today)
     AND b.is_e2e IS NOT TRUE
     AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE;

  SELECT COALESCE(SUM(
           COALESCE(b.monthly_rate, f.monthly_rate, 0)
           * CASE WHEN upper(COALESCE(b.currency, 'MXN')) = 'MXN'
                  THEN 1 ELSE COALESCE(NULLIF(b.tipo_cambio, 0), 1) END
         ), 0)
    INTO v_mrr_prev
    FROM bookings b JOIN forklifts f ON f.id = b.forklift_id
   WHERE b.recurring_billing = true AND b.status = 'confirmed'
     AND b.start_date <= v_last_prev_month
     AND (b.end_date IS NULL OR b.end_date >= v_last_prev_month)
     AND b.is_e2e IS NOT TRUE
     AND f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE;

  SELECT COALESCE(AVG((i.paid_at - i.issued_at::date))::numeric, 0) INTO v_dso FROM invoices i
  WHERE i.status = 'paid' AND i.paid_at IS NOT NULL AND i.paid_at >= (v_today - INTERVAL '90 days')
    AND i.is_e2e IS NOT TRUE;

  SELECT COALESCE(AVG((i.paid_at - i.issued_at::date))::numeric, 0) INTO v_dso_prev FROM invoices i
  WHERE i.status = 'paid' AND i.paid_at IS NOT NULL
    AND i.paid_at >= (v_last_prev_month - INTERVAL '90 days') AND i.paid_at <= v_last_prev_month
    AND i.is_e2e IS NOT TRUE;

  -- R13-2 / N-15
  SELECT COALESCE(SUM(v.balance_mxn), 0) INTO v_overdue_total
  FROM public.v_invoices_with_balance v
  WHERE v.status IN ('sent', 'partial', 'overdue') AND v.due_date < v_today
    AND v.fx_missing IS NOT TRUE
    AND v.is_e2e IS NOT TRUE;

  SELECT COUNT(*) INTO v_overdue_fx_missing
  FROM public.v_invoices_with_balance v
  WHERE v.status IN ('sent', 'partial', 'overdue') AND v.due_date < v_today
    AND v.fx_missing IS TRUE
    AND v.is_e2e IS NOT TRUE;

  SELECT COALESCE(SUM(v.balance_mxn), 0) INTO v_overdue_total_prev
  FROM public.v_invoices_with_balance v
  WHERE v.status IN ('sent', 'partial', 'overdue', 'paid')
    AND v.issued_at <= v_last_prev_month
    AND v.due_date < v_last_prev_month
    AND (v.paid_at IS NULL OR v.paid_at > v_last_prev_month)
    AND v.fx_missing IS NOT TRUE
    AND v.is_e2e IS NOT TRUE;

  -- FIX R6-20: excluir clientes E2E y unidades borradas, sin perder los
  -- contratos que no tienen unidad/cliente asignado (LEFT JOIN).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'contract_number', c.contract_number, 'customer_name', cu.name,
    'forklift_name', f.name, 'end_date', c.end_date, 'days_remaining', (c.end_date - v_today)
  ) ORDER BY c.end_date), '[]'::jsonb) INTO v_expiring
  FROM contracts c LEFT JOIN customers cu ON cu.id = c.customer_id
  LEFT JOIN forklifts f ON f.id = c.forklift_id
  WHERE c.status = 'active' AND c.end_date IS NOT NULL
    AND c.end_date BETWEEN v_today AND (v_today + INTERVAL '30 days')
    AND (cu.id IS NULL OR cu.is_e2e IS NOT TRUE)
    AND (f.id IS NULL OR f.deleted_at IS NULL);

  RETURN jsonb_build_object(
    'mrr', v_mrr, 'mrr_prev', v_mrr_prev,
    'dso', ROUND(v_dso, 1), 'dso_prev', ROUND(v_dso_prev, 1),
    'overdue_total', v_overdue_total, 'overdue_total_prev', v_overdue_total_prev,
    'overdue_fx_missing_count', v_overdue_fx_missing,
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
            -- FIX A1: incluye facturas multi-reserva (invoice_bookings) via
            -- la vista de atribucion; ya viene convertida a MXN.
            SELECT SUM(r.total_mxn_share)
            FROM public.v_invoice_forklift_revenue r
            WHERE r.forklift_id = f.id
              AND r.status = 'paid'
              AND r.is_e2e IS NOT TRUE
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