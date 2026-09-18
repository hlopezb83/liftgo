-- FIX-FE-01: reportes agregados server-side
CREATE OR REPLACE FUNCTION public.report_revenue_by_month(_start date, _end date)
RETURNS TABLE (month_key text, invoiced numeric, paid numeric, invoice_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH scoped AS (
    SELECT
      to_char(date_trunc('month', i.issued_at), 'YYYY-MM') AS month_key,
      CASE
        WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN i.total
        WHEN i.tipo_cambio IS NOT NULL AND i.tipo_cambio > 0 THEN i.total * i.tipo_cambio
        ELSE i.total
      END AS total_mxn,
      i.status
    FROM public.invoices i
    WHERE i.status NOT IN ('draft', 'cancelled')
      AND i.is_e2e IS NOT TRUE
      AND i.issued_at::date BETWEEN _start AND _end
  )
  SELECT s.month_key, SUM(s.total_mxn), COALESCE(SUM(s.total_mxn) FILTER (WHERE s.status = 'paid'), 0), COUNT(*)::int
  FROM scoped s GROUP BY s.month_key ORDER BY s.month_key;
$$;
REVOKE ALL ON FUNCTION public.report_revenue_by_month(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_revenue_by_month(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_revenue_month_invoices(_month_key text)
RETURNS TABLE (id uuid, invoice_number text, customer_name text, issued_at timestamptz, total numeric, status text, moneda text, tipo_cambio numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.invoice_number, i.customer_name, i.issued_at, i.total, i.status, i.moneda, i.tipo_cambio
  FROM public.invoices i
  WHERE i.status NOT IN ('draft', 'cancelled')
    AND i.is_e2e IS NOT TRUE
    AND to_char(date_trunc('month', i.issued_at), 'YYYY-MM') = _month_key
  ORDER BY CASE
      WHEN upper(COALESCE(i.moneda, 'MXN')) = 'MXN' THEN i.total
      WHEN i.tipo_cambio IS NOT NULL AND i.tipo_cambio > 0 THEN i.total * i.tipo_cambio
      ELSE i.total END DESC;
$$;
REVOKE ALL ON FUNCTION public.report_revenue_month_invoices(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_revenue_month_invoices(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_utilization_by_unit(_start date, _end date)
RETURNS TABLE (forklift_id uuid, name text, booked_days integer, total_days integer, utilization integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH range_days AS (SELECT GREATEST((_end - _start)::int + 1, 1) AS total_days),
  unit_days AS (
    SELECT b.forklift_id, COUNT(DISTINCT d)::int AS booked_days
    FROM public.bookings b
    CROSS JOIN LATERAL generate_series(GREATEST(b.start_date::date, _start), LEAST(b.end_date::date, _end), interval '1 day') AS d
    WHERE b.status <> 'cancelled' AND b.is_e2e IS NOT TRUE
      AND b.start_date::date <= _end AND b.end_date::date >= _start
    GROUP BY b.forklift_id
  )
  SELECT f.id, f.name, COALESCE(ud.booked_days, 0), r.total_days,
    LEAST(ROUND(COALESCE(ud.booked_days, 0)::numeric * 100 / r.total_days), 100)::int
  FROM public.forklifts f
  CROSS JOIN range_days r
  LEFT JOIN unit_days ud ON ud.forklift_id = f.id
  WHERE f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
  ORDER BY 5 DESC, f.name;
$$;
REVOKE ALL ON FUNCTION public.report_utilization_by_unit(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_utilization_by_unit(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_utilization_by_model(_start date, _end date)
RETURNS TABLE (model text, units integer, available integer, rented integer, booked_days integer, total_days integer, utilization integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH active AS (
    SELECT f.id, f.status,
      CASE WHEN NULLIF(btrim(COALESCE(f.manufacturer, '')), '') IS NOT NULL
        THEN btrim(f.manufacturer) || ' ' || COALESCE(f.model, '') ELSE f.name END AS model_key
    FROM public.forklifts f
    WHERE f.deleted_at IS NULL AND f.is_e2e IS NOT TRUE
      AND lower(COALESCE(f.status, '')) NOT IN ('sold', 'retired', 'vendido', 'retirado')
  ),
  range_days AS (SELECT GREATEST((_end - _start)::int + 1, 1) AS total_days),
  unit_days AS (
    SELECT b.forklift_id, COUNT(DISTINCT d)::int AS booked_days
    FROM public.bookings b
    CROSS JOIN LATERAL generate_series(GREATEST(b.start_date::date, _start), LEAST(b.end_date::date, _end), interval '1 day') AS d
    WHERE b.status <> 'cancelled' AND b.is_e2e IS NOT TRUE
      AND b.start_date::date <= _end AND b.end_date::date >= _start
    GROUP BY b.forklift_id
  ),
  per_unit AS (
    SELECT a.model_key, a.status, COALESCE(ud.booked_days, 0) AS booked_days
    FROM active a LEFT JOIN unit_days ud ON ud.forklift_id = a.id
  )
  SELECT p.model_key, COUNT(*)::int,
    COUNT(*) FILTER (WHERE p.status = 'available')::int,
    COUNT(*) FILTER (WHERE p.status = 'rented')::int,
    SUM(p.booked_days)::int,
    (COUNT(*) * r.total_days)::int,
    LEAST(ROUND(SUM(p.booked_days)::numeric * 100 / (COUNT(*) * r.total_days)), 100)::int
  FROM per_unit p CROSS JOIN range_days r
  GROUP BY p.model_key, r.total_days
  ORDER BY 7 DESC, p.model_key;
$$;
REVOKE ALL ON FUNCTION public.report_utilization_by_model(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_utilization_by_model(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_maintenance_cost_by_unit(_start date, _end date)
RETURNS TABLE (name text, work_count integer, total_cost numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(f.name, 'Desconocido'), COUNT(*)::int, COALESCE(SUM(ml.cost), 0)
  FROM public.maintenance_logs ml
  LEFT JOIN public.forklifts f ON f.id = ml.forklift_id
  WHERE ml.deleted_at IS NULL AND ml.is_e2e IS NOT TRUE
    AND ml.performed_at IS NOT NULL
    AND ml.performed_at::date BETWEEN _start AND _end
  GROUP BY ml.forklift_id, f.name
  ORDER BY 3 DESC;
$$;
REVOKE ALL ON FUNCTION public.report_maintenance_cost_by_unit(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_maintenance_cost_by_unit(date, date) TO authenticated;