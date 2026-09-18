CREATE OR REPLACE FUNCTION public.get_income_statement(
  p_start_date date,
  p_end_date date,
  p_basis text DEFAULT 'accrual'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months jsonb;
  v_rented_without_cost jsonb;
BEGIN
  -- Authorization: only internal financial roles
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH
  -- Quotes flagged as rental (used to classify invoices linked via quote_id)
  rental_quotes AS (
    SELECT id FROM quotes WHERE quote_type = 'rental'
  ),
  -- Filter invoices according to accounting basis and date range
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
      CASE
        WHEN p_basis = 'cash' THEN i.status = 'paid' AND i.paid_at IS NOT NULL
        ELSE i.status NOT IN ('draft','cancelled')
      END
      AND CASE WHEN p_basis = 'cash' THEN i.paid_at ELSE i.issued_at END
        BETWEEN p_start_date AND p_end_date
  ),
  inv_classified AS (
    SELECT
      i.*,
      (i.booking_id IS NOT NULL OR (i.quote_id IS NOT NULL AND i.quote_id IN (SELECT id FROM rental_quotes))) AS is_rental,
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
      to_char(date_trunc('month', expense_date), 'YYYY-MM') AS month_key,
      jsonb_object_agg(category::text, total) AS expenses
    FROM (
      SELECT
        to_char(date_trunc('month', expense_date), 'YYYY-MM') AS month_key,
        category,
        SUM(amount) AS total
      FROM operating_expenses
      WHERE expense_date BETWEEN p_start_date AND p_end_date
      GROUP BY 1, 2
    ) t
    GROUP BY month_key
  ),
  -- Active bookings overlapping the query window (used to compute depreciation per month)
  active_bookings AS (
    SELECT b.forklift_id, b.start_date, b.end_date
    FROM bookings b
    WHERE b.status IN ('confirmed','completed')
      AND b.start_date <= p_end_date
      AND b.end_date >= p_start_date
  ),
  -- All months in the requested range (even if they have no movement)
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
    WHERE COALESCE(f.acquisition_cost, 0) > 0
    GROUP BY rpm.month_key
  ),
  combined AS (
    SELECT
      ms.month_key,
      to_char(ms.month_start, 'TMMon YYYY') AS month_label,
      COALESCE(rbm.revenue, 0) AS revenue,
      COALESCE(rbm.revenue_rental, 0) AS revenue_rental,
      COALESCE(rbm.revenue_sales, 0) AS revenue_sales,
      COALESCE(mm.maintenance_cost, 0) AS maintenance_cost,
      COALESCE(dm.damage_cost, 0) AS damage_cost,
      COALESCE(dpm.depreciation, 0) AS depreciation,
      COALESCE(em.expenses, '{}'::jsonb) AS expenses,
      COALESCE(rbc.rental_by_customer, '{}'::jsonb) AS rental_by_customer,
      COALESCE(sbc.sales_by_customer, '{}'::jsonb) AS sales_by_customer,
      COALESCE(dpm.depreciation_by_forklift, '{}'::jsonb) AS depreciation_by_forklift
    FROM month_series ms
    LEFT JOIN revenue_by_month rbm ON rbm.month_key = ms.month_key
    LEFT JOIN maint_by_month mm ON mm.month_key = ms.month_key
    LEFT JOIN damage_by_month dm ON dm.month_key = ms.month_key
    LEFT JOIN expenses_by_month em ON em.month_key = ms.month_key
    LEFT JOIN rental_by_customer rbc ON rbc.month_key = ms.month_key
    LEFT JOIN sales_by_customer sbc ON sbc.month_key = ms.month_key
    LEFT JOIN depreciation_per_month dpm ON dpm.month_key = ms.month_key
    -- Drop empty months to mirror the previous client behavior (only months with activity)
    WHERE COALESCE(rbm.revenue, 0) <> 0
       OR COALESCE(mm.maintenance_cost, 0) <> 0
       OR COALESCE(dm.damage_cost, 0) <> 0
       OR COALESCE(dpm.depreciation, 0) <> 0
       OR em.expenses IS NOT NULL
    ORDER BY ms.month_key
  ),
  -- Forklifts rented in the range that have no acquisition_cost set
  rented_in_range AS (
    SELECT DISTINCT forklift_id FROM active_bookings
  ),
  rented_without_cost_rows AS (
    SELECT f.id, f.name
    FROM forklifts f
    JOIN rented_in_range r ON r.forklift_id = f.id
    WHERE COALESCE(f.acquisition_cost, 0) = 0
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb),
    (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM rented_without_cost_rows r)
  INTO v_months, v_rented_without_cost
  FROM combined c;

  RETURN jsonb_build_object(
    'months', COALESCE(v_months, '[]'::jsonb),
    'rented_without_cost', COALESCE(v_rented_without_cost, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_income_statement(date, date, text) TO authenticated;