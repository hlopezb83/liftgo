CREATE OR REPLACE FUNCTION public.get_income_statement(p_start_date date, p_end_date date, p_basis text DEFAULT 'accrual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_months jsonb;
  v_rented_without_cost jsonb;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH
  rental_quotes AS (
    SELECT id FROM quotes WHERE quote_type = 'rental' AND COALESCE(is_e2e, false) = false
  ),
  inv AS (
    SELECT
      i.id,
      i.subtotal,
      COALESCE(i.customer_name, 'Sin cliente') AS customer_name,
      i.booking_id,
      i.quote_id,
      CASE WHEN p_basis = 'cash' THEN i.paid_at ELSE i.issued_at END AS event_date
    FROM invoices i
    WHERE
      COALESCE(i.is_e2e, false) = false
      AND CASE
        WHEN p_basis = 'cash' THEN i.status = 'paid' AND i.paid_at IS NOT NULL
        ELSE i.status NOT IN ('draft','cancelled')
      END
      AND CASE WHEN p_basis = 'cash' THEN i.paid_at ELSE i.issued_at END
        BETWEEN p_start_date AND p_end_date
  ),
  inv_classified AS (
    SELECT
      i.*,
      (
        i.booking_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM invoice_bookings ib WHERE ib.invoice_id = i.id)
        OR (i.quote_id IS NOT NULL AND i.quote_id IN (SELECT id FROM rental_quotes))
      ) AS is_rental,
      to_char(date_trunc('month', i.event_date), 'YYYY-MM') AS month_key
    FROM inv i
  ),
  revenue_by_month AS (
    SELECT
      month_key,
      SUM(subtotal) AS revenue,
      SUM(CASE WHEN is_rental THEN subtotal ELSE 0 END) AS revenue_rental,
      SUM(CASE WHEN NOT is_rental THEN subtotal ELSE 0 END) AS revenue_sales
    FROM inv_classified
    GROUP BY month_key
  ),
  rental_by_customer AS (
    SELECT month_key, jsonb_object_agg(customer_name, total) AS rental_by_customer
    FROM (
      SELECT month_key, customer_name, SUM(subtotal) AS total
      FROM inv_classified
      WHERE is_rental
      GROUP BY month_key, customer_name
    ) t
    GROUP BY month_key
  ),
  sales_by_customer AS (
    SELECT month_key, jsonb_object_agg(customer_name, total) AS sales_by_customer
    FROM (
      SELECT month_key, customer_name, SUM(subtotal) AS total
      FROM inv_classified
      WHERE NOT is_rental
      GROUP BY month_key, customer_name
    ) t
    GROUP BY month_key
  ),
  maint_by_month AS (
    SELECT
      to_char(date_trunc('month', performed_at), 'YYYY-MM') AS month_key,
      SUM(COALESCE(cost, 0)) AS maintenance_cost
    FROM maintenance_logs
    WHERE performed_at BETWEEN p_start_date AND p_end_date
    GROUP BY 1
  ),
  damage_by_month AS (
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM') AS month_key,
      SUM(COALESCE(actual_cost, 0)) AS damage_cost
    FROM damage_records
    WHERE created_at::date BETWEEN p_start_date AND p_end_date
    GROUP BY 1
  ),
  expenses_by_month AS (
    SELECT
      month_key,
      jsonb_object_agg(category::text, total) AS expenses
    FROM (
      SELECT
        to_char(date_trunc('month', issue_date), 'YYYY-MM') AS month_key,
        category,
        SUM(subtotal) AS total
      FROM supplier_bills
      WHERE issue_date BETWEEN p_start_date AND p_end_date
        AND status <> 'cancelled'
        AND category IS NOT NULL
      GROUP BY 1, 2
    ) t
    GROUP BY month_key
  ),
  active_bookings AS (
    SELECT b.forklift_id, b.start_date, b.end_date
    FROM bookings b
    WHERE COALESCE(b.is_e2e, false) = false
      AND b.status IN ('confirmed','completed')
      AND b.start_date <= p_end_date
      AND b.end_date >= p_start_date
  ),
  month_series AS (
    SELECT to_char(m, 'YYYY-MM') AS month_key, m AS month_start
    FROM generate_series(date_trunc('month', p_start_date), date_trunc('month', p_end_date), interval '1 month') m
  ),
  rented_per_month AS (
    SELECT
      ms.month_key,
      ab.forklift_id
    FROM month_series ms
    JOIN active_bookings ab
      ON ab.start_date <= (ms.month_start + interval '1 month - 1 day')::date
     AND ab.end_date   >= ms.month_start::date
    GROUP BY ms.month_key, ab.forklift_id
  ),
  depreciation_per_month AS (
    SELECT
      rpm.month_key,
      SUM(f.acquisition_cost / 36.0) AS depreciation,
      jsonb_object_agg(f.name, f.acquisition_cost / 36.0)
        FILTER (WHERE f.acquisition_cost IS NOT NULL AND f.acquisition_cost > 0) AS depreciation_by_forklift
    FROM rented_per_month rpm
    JOIN forklifts f ON f.id = rpm.forklift_id
    WHERE COALESCE(f.is_e2e, false) = false
    GROUP BY rpm.month_key
  ),
  all_months AS (
    SELECT month_key FROM month_series
  ),
  combined AS (
    SELECT
      am.month_key,
      to_char(date_trunc('month', (am.month_key || '-01')::date), 'TMmon yy') AS month_label,
      COALESCE(rbm.revenue, 0) AS revenue,
      COALESCE(rbm.revenue_rental, 0) AS revenue_rental,
      COALESCE(rbm.revenue_sales, 0) AS revenue_sales,
      COALESCE(mbm.maintenance_cost, 0) AS maintenance_cost,
      COALESCE(dbm.damage_cost, 0) AS damage_cost,
      COALESCE(dpm.depreciation, 0) AS depreciation,
      COALESCE(ebm.expenses, '{}'::jsonb) AS expenses,
      COALESCE(rbc.rental_by_customer, '{}'::jsonb) AS rental_by_customer,
      COALESCE(sbc.sales_by_customer, '{}'::jsonb) AS sales_by_customer,
      COALESCE(dpm.depreciation_by_forklift, '{}'::jsonb) AS depreciation_by_forklift
    FROM all_months am
    LEFT JOIN revenue_by_month rbm USING (month_key)
    LEFT JOIN maint_by_month mbm USING (month_key)
    LEFT JOIN damage_by_month dbm USING (month_key)
    LEFT JOIN depreciation_per_month dpm USING (month_key)
    LEFT JOIN expenses_by_month ebm USING (month_key)
    LEFT JOIN rental_by_customer rbc USING (month_key)
    LEFT JOIN sales_by_customer sbc USING (month_key)
    ORDER BY am.month_key
  )
  SELECT jsonb_agg(to_jsonb(combined)) INTO v_months FROM combined;

  SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name))
  INTO v_rented_without_cost
  FROM forklifts f
  WHERE COALESCE(f.is_e2e, false) = false
    AND (f.acquisition_cost IS NULL OR f.acquisition_cost <= 0)
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.forklift_id = f.id
        AND COALESCE(b.is_e2e, false) = false
        AND b.status IN ('confirmed','completed')
        AND b.start_date <= p_end_date
        AND b.end_date >= p_start_date
    );

  RETURN jsonb_build_object(
    'months', COALESCE(v_months, '[]'::jsonb),
    'rented_without_cost', COALESCE(v_rented_without_cost, '[]'::jsonb)
  );
END;
$function$;