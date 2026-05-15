-- =====================================================
-- Security hardening: role guards on SECURITY DEFINER RPCs
-- Restrict over-permissive RLS policies
-- =====================================================

-- 1) get_dashboard_stats: add staff-only role guard
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
        'outstanding_revenue', (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE status != 'paid'),
        'breakdown', COALESCE((
          SELECT json_agg(json_build_object('status', sub.status, 'count', sub.cnt, 'total', sub.sum_total))
          FROM (SELECT status, COUNT(*) as cnt, SUM(total) as sum_total FROM invoices GROUP BY status) sub
        ), '[]'::json)
      )
    ),
    'overdue_invoices', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', id, 'invoice_number', invoice_number, 'customer_name', customer_name,
        'total', total, 'due_date', due_date, 'status', status, 'booking_id', booking_id
      )), '[]'::json)
      FROM invoices
      WHERE (status = 'sent' OR status = 'overdue') AND due_date IS NOT NULL AND due_date < CURRENT_DATE
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
      ) ORDER BY sub.revenue DESC), '[]'::json)
      FROM (
        SELECT f.id, f.name,
          LEAST(ROUND(COALESCE(SUM(GREATEST(b.end_date - b.start_date + 1, 0)), 0)::numeric /
            GREATEST(CURRENT_DATE - f.created_at::date, 1) * 100), 100) as util_pct,
          COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.status = 'paid'
            AND i.booking_id IN (SELECT b2.id FROM bookings b2 WHERE b2.forklift_id = f.id)), 0) as revenue
        FROM forklifts f LEFT JOIN bookings b ON b.forklift_id = f.id
        WHERE f.status NOT IN ('sold', 'retired')
        GROUP BY f.id, f.name, f.created_at LIMIT 10
      ) sub
    ),
    'weekly_utilization', (
      SELECT COALESCE(json_agg(json_build_object(
        'week_label', wu.week_label, 'utilization', wu.util_pct
      ) ORDER BY wu.week_start), '[]'::json)
      FROM (
        SELECT ws.week_start,
          'Sem ' || EXTRACT(WEEK FROM ws.week_start)::text AS week_label,
          ROUND(COUNT(DISTINCT CASE WHEN b.id IS NOT NULL THEN f.id END)::numeric /
            NULLIF(COUNT(DISTINCT f.id), 0) * 100) AS util_pct
        FROM generate_series(CURRENT_DATE - INTERVAL '8 weeks', CURRENT_DATE, '1 week'::interval) ws(week_start)
        CROSS JOIN forklifts f
        LEFT JOIN bookings b ON b.forklift_id = f.id AND b.status = 'confirmed'
          AND b.start_date <= ws.week_start + 6 AND b.end_date >= ws.week_start
        WHERE f.status NOT IN ('sold', 'retired') GROUP BY ws.week_start
      ) wu
    ),
    'recent_activity', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', id, 'event_type', event_type, 'entity_type', entity_type,
        'entity_id', entity_id, 'title', title, 'description', description, 'created_at', created_at
      ) ORDER BY created_at DESC), '[]'::json)
      FROM (SELECT * FROM activity_feed ORDER BY created_at DESC LIMIT 20) af
    )
  ) INTO result;
  RETURN result;
END;
$function$;

-- 2) get_insurance_alerts: add staff-only role guard
CREATE OR REPLACE FUNCTION public.get_insurance_alerts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'mechanic'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH base AS (
    SELECT id, name, insurance_expiry, insurance_provider,
      CASE WHEN insurance_expiry IS NOT NULL THEN (insurance_expiry - CURRENT_DATE)::int ELSE NULL END AS days_left
    FROM public.forklifts WHERE status NOT IN ('sold','retired')
  ),
  expiring AS (
    SELECT id, name, insurance_expiry, insurance_provider, days_left FROM base
    WHERE insurance_expiry IS NOT NULL AND days_left <= 30 ORDER BY days_left ASC
  ),
  no_ins AS (SELECT count(*)::int AS c FROM base WHERE insurance_expiry IS NULL)
  SELECT jsonb_build_object(
    'expiring', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'insurance_expiry', insurance_expiry,
      'insurance_provider', insurance_provider, 'days_left', days_left
    )) FROM expiring), '[]'::jsonb),
    'no_insurance_count', (SELECT c FROM no_ins)
  ) INTO result;
  RETURN result;
END;
$$;

-- 3) get_customer_summary: ownership-or-role guard
CREATE OR REPLACE FUNCTION public.get_customer_summary(p_customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_bookings jsonb; v_invoices jsonb; v_totals jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role) OR
    (has_role(auth.uid(), 'customer'::app_role)
      AND p_customer_id = get_customer_id_for_user(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id, 'booking_number', b.booking_number,
    'start_date', b.start_date, 'end_date', b.end_date, 'status', b.status,
    'forklift', jsonb_build_object('name', f.name, 'model', f.model)
  ) ORDER BY b.start_date DESC), '[]'::jsonb)
  INTO v_bookings
  FROM bookings b LEFT JOIN forklifts f ON f.id = b.forklift_id
  WHERE b.customer_id = p_customer_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'invoice_number', i.invoice_number, 'issued_at', i.issued_at,
    'due_date', i.due_date, 'total', i.total, 'status', i.status
  ) ORDER BY i.issued_at DESC), '[]'::jsonb)
  INTO v_invoices FROM invoices i WHERE i.customer_id = p_customer_id;

  SELECT jsonb_build_object(
    'total_invoiced', COALESCE(SUM(total), 0),
    'total_paid', COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0)
  ) INTO v_totals FROM invoices WHERE customer_id = p_customer_id;

  RETURN jsonb_build_object('bookings', v_bookings, 'invoices', v_invoices, 'totals', v_totals);
END;
$$;

-- 4) get_financial_kpis: add staff-only role guard
CREATE OR REPLACE FUNCTION public.get_financial_kpis()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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

  SELECT COALESCE(SUM(i.total), 0) INTO v_overdue_total FROM invoices i
  WHERE i.status IN ('sent', 'partial') AND i.due_date < v_today;

  SELECT COALESCE(SUM(i.total), 0) INTO v_overdue_total_prev FROM invoices i
  WHERE i.status IN ('sent', 'partial', 'paid') AND i.issued_at <= v_last_prev_month
    AND i.due_date < v_last_prev_month AND (i.paid_at IS NULL OR i.paid_at > v_last_prev_month);

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

-- 5) get_mrr_detail: add staff-only role guard
CREATE OR REPLACE FUNCTION public.get_mrr_detail()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result json;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT json_build_object(
    'items', COALESCE(json_agg(json_build_object(
      'forklift_id', f.id, 'forklift_name', f.name, 'model', f.model,
      'manufacturer', f.manufacturer, 'serial_number', f.serial_number,
      'monthly_rate', COALESCE(f.monthly_rate, 0),
      'daily_rate', COALESCE(f.daily_rate, 0),
      'weekly_rate', COALESCE(f.weekly_rate, 0),
      'customer_name', c.name, 'customer_id', c.id,
      'booking_number', active_booking.booking_number,
      'start_date', active_booking.start_date, 'end_date', active_booking.end_date
    )), '[]'::json),
    'total_mrr', COALESCE(SUM(f.monthly_rate), 0)
  ) INTO result
  FROM forklifts f
  JOIN LATERAL (
    SELECT b.customer_id, b.booking_number, b.start_date, b.end_date
    FROM bookings b
    WHERE b.forklift_id = f.id AND b.status = 'confirmed'
      AND CURRENT_DATE BETWEEN b.start_date AND b.end_date
    ORDER BY b.start_date DESC LIMIT 1
  ) active_booking ON true
  LEFT JOIN customers c ON c.id = active_booking.customer_id
  WHERE f.status = 'rented';
  RETURN result;
END;
$$;

-- 6) get_forklift_financials: add staff-only role guard
CREATE OR REPLACE FUNCTION public.get_forklift_financials(p_forklift_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb; v_revenue numeric; v_maintenance_cost numeric;
  v_acquisition_cost numeric; v_days_rented integer;
  v_days_since_acquired integer; v_hourometer_history jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(SUM(i.total), 0) INTO v_revenue
  FROM invoices i JOIN bookings b ON b.id = i.booking_id
  WHERE b.forklift_id = p_forklift_id AND i.status IN ('paid', 'partial', 'sent', 'overdue');

  SELECT COALESCE(SUM(cost), 0) INTO v_maintenance_cost
  FROM maintenance_logs WHERE forklift_id = p_forklift_id;

  SELECT COALESCE(acquisition_cost, 0), GREATEST((CURRENT_DATE - created_at::date), 1)
  INTO v_acquisition_cost, v_days_since_acquired
  FROM forklifts WHERE id = p_forklift_id;

  SELECT COALESCE(SUM(LEAST(end_date, CURRENT_DATE) - start_date), 0) INTO v_days_rented
  FROM bookings WHERE forklift_id = p_forklift_id AND status IN ('confirmed', 'completed');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'delivery_id', d.id, 'delivery_number', d.delivery_number, 'type', d.type,
    'date', d.scheduled_date, 'hours_reading', d.hours_reading, 'booking_id', d.booking_id
  ) ORDER BY d.scheduled_date, d.type), '[]'::jsonb)
  INTO v_hourometer_history
  FROM deliveries d WHERE d.forklift_id = p_forklift_id AND d.hours_reading IS NOT NULL;

  result := jsonb_build_object(
    'revenue', v_revenue, 'maintenance_cost', v_maintenance_cost,
    'acquisition_cost', v_acquisition_cost,
    'gross_margin', v_revenue - v_maintenance_cost,
    'roi_percent', CASE WHEN v_acquisition_cost > 0
      THEN ROUND(((v_revenue - v_maintenance_cost) / v_acquisition_cost) * 100, 1) ELSE 0 END,
    'days_rented', v_days_rented, 'days_since_acquired', v_days_since_acquired,
    'utilization_percent', CASE WHEN v_days_since_acquired > 0
      THEN LEAST(100, ROUND((v_days_rented::numeric / v_days_since_acquired) * 100, 1)) ELSE 0 END,
    'hourometer_history', v_hourometer_history
  );
  RETURN result;
END;
$function$;

-- 7) activity_feed: drop unrestricted authenticated read; staff-specific policies remain
DROP POLICY IF EXISTS "Authenticated read activity_feed" ON public.activity_feed;
CREATE POLICY "Staff read activity_feed" ON public.activity_feed
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'mechanic'::app_role)
  );

-- 8) contract_templates: close anonymous gap, restrict to internal staff
DROP POLICY IF EXISTS "Authenticated read contract_templates" ON public.contract_templates;
CREATE POLICY "Staff read contract_templates" ON public.contract_templates
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role)
  );

-- 9) audit_logs: remove dispatcher and ventas read access (sensitive PII in JSONB)
DROP POLICY IF EXISTS "Dispatchers read audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Ventas read audit_logs" ON public.audit_logs;