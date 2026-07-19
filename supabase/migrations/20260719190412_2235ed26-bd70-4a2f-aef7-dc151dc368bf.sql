CREATE OR REPLACE FUNCTION public.get_income_statement(
  p_start_date date,
  p_end_date date,
  p_basis text DEFAULT 'accrual'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_months jsonb;
  v_rented_without_cost jsonb;
  v_sold_without_cost jsonb;
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
      i.billing_period_start,
      i.billing_period_end,
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
        OR (i.billing_period_start IS NOT NULL AND i.billing_period_end IS NOT NULL)
      ) AS is_rental,
      to_char(date_trunc('month', i.event_date), 'YYYY-MM') AS month_key
    FROM inv i
  ),
  cn_base AS (
    SELECT
      cn.id,
      cn.subtotal,
      cn.invoice_id,
      cn.issued_at AS event_date,
      to_char(date_trunc('month', cn.issued_at), 'YYYY-MM') AS month_key
    FROM credit_notes cn
    WHERE cn.status NOT IN ('draft','cancelled')
      AND cn.issued_at BETWEEN p_start_date AND p_end_date
  ),
  cn_classified AS (
    SELECT
      cnb.month_key,
      cnb.subtotal,
      (
        i.booking_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM invoice_bookings ib WHERE ib.invoice_id = i.id)
        OR (i.quote_id IS NOT NULL AND i.quote_id IN (SELECT id FROM rental_quotes))
        OR (i.billing_period_start IS NOT NULL AND i.billing_period_end IS NOT NULL)
      ) AS is_rental
    FROM cn_base cnb
    LEFT JOIN invoices i ON i.id = cnb.invoice_id
  ),
  credit_notes_by_month AS (
    SELECT
      month_key,
      SUM(subtotal) AS credit_total,
      SUM(CASE WHEN is_rental THEN subtotal ELSE 0 END) AS credit_rental,
      SUM(CASE WHEN NOT is_rental THEN subtotal ELSE 0 END) AS credit_sales
    FROM cn_classified
    GROUP BY month_key
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
  -- BL-40: sólo mantenimientos ejecutados (completed). Los 'scheduled' son
  -- provisiones que aún no se han confirmado con el mecánico y no deben
  -- cargar P&L hasta que ocurran.
  maint_by_month AS (
    SELECT
      to_char(date_trunc('month', performed_at), 'YYYY-MM') AS month_key,
      SUM(COALESCE(cost, 0)) AS maintenance_cost
    FROM maintenance_logs
    WHERE performed_at BETWEEN p_start_date AND p_end_date
      AND work_status = 'completed'
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
        CASE
          WHEN p_basis = 'cash' THEN to_char(date_trunc('month', sp.payment_date), 'YYYY-MM')
          ELSE to_char(date_trunc('month', sb.issue_date), 'YYYY-MM')
        END AS month_key,
        sb.category,
        SUM(
          CASE
            WHEN p_basis = 'cash' THEN
              CASE
                WHEN COALESCE(sb.total, 0) > 0
                  THEN sb.subtotal * (sp.amount / sb.total)
                ELSE sp.amount
              END
            ELSE sb.subtotal
          END
        ) AS total
      FROM supplier_bills sb
      LEFT JOIN supplier_payments sp
        ON p_basis = 'cash' AND sp.bill_id = sb.id
       AND sp.payment_date BETWEEN p_start_date AND p_end_date
      WHERE sb.status <> 'cancelled'
        AND sb.category IS NOT NULL
        AND CASE
          WHEN p_basis = 'cash' THEN sp.id IS NOT NULL
          ELSE sb.issue_date BETWEEN p_start_date AND p_end_date
        END
      GROUP BY 1, 2
    ) t
    WHERE month_key IS NOT NULL
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
    SELECT
      to_char(m, 'YYYY-MM') AS month_key,
      m::date AS month_start,
      (m + interval '1 month - 1 day')::date AS month_end,
      EXTRACT(day FROM (m + interval '1 month - 1 day'))::int AS days_in_month
    FROM generate_series(date_trunc('month', p_start_date), date_trunc('month', p_end_date), interval '1 month') m
  ),
  rented_days_per_month AS (
    SELECT
      ms.month_key,
      ms.days_in_month,
      ab.forklift_id,
      GREATEST(
        0,
        (LEAST(ab.end_date, ms.month_end) - GREATEST(ab.start_date, ms.month_start) + 1)
      ) AS rented_days
    FROM month_series ms
    JOIN active_bookings ab
      ON ab.start_date <= ms.month_end
     AND ab.end_date   >= ms.month_start
  ),
  rented_days_agg AS (
    SELECT
      month_key,
      days_in_month,
      forklift_id,
      LEAST(days_in_month, SUM(rented_days)::int) AS rented_days
    FROM rented_days_per_month
    GROUP BY month_key, days_in_month, forklift_id
  ),
  depreciation_per_month AS (
    SELECT
      rda.month_key,
      SUM(
        (f.acquisition_cost / 48.0) * (rda.rented_days::numeric / rda.days_in_month)
      ) AS depreciation,
      jsonb_object_agg(
        f.name,
        (f.acquisition_cost / 48.0) * (rda.rented_days::numeric / rda.days_in_month)
      ) FILTER (
        WHERE f.acquisition_cost IS NOT NULL
          AND f.acquisition_cost > 0
          AND rda.rented_days > 0
      ) AS depreciation_by_forklift
    FROM rented_days_agg rda
    JOIN forklifts f ON f.id = rda.forklift_id
    WHERE COALESCE(f.is_e2e, false) = false
      AND rda.rented_days > 0
    GROUP BY rda.month_key
  ),
  sale_invoice_forklifts AS (
    SELECT
      ic.month_key,
      ic.customer_name,
      ic.event_date,
      f.id AS forklift_id,
      f.name AS forklift_name,
      f.acquisition_cost
    FROM inv_classified ic
    JOIN quote_assigned_forklifts qaf ON qaf.quote_id = ic.quote_id
    JOIN forklifts f ON f.id = qaf.forklift_id
    WHERE NOT ic.is_rental
      AND ic.quote_id IS NOT NULL
      AND COALESCE(f.is_e2e, false) = false
  ),
  rented_days_before_sale AS (
    SELECT
      sif.forklift_id,
      sif.event_date,
      COALESCE(SUM(
        GREATEST(0,
          LEAST(b.end_date, (sif.event_date - interval '1 day')::date)
          - b.start_date + 1
        )
      ), 0) AS rented_days
    FROM sale_invoice_forklifts sif
    LEFT JOIN bookings b ON b.forklift_id = sif.forklift_id
      AND COALESCE(b.is_e2e, false) = false
      AND b.status IN ('confirmed','completed')
      AND b.start_date < sif.event_date
    GROUP BY sif.forklift_id, sif.event_date
  ),
  cogs_per_sale AS (
    SELECT
      sif.month_key,
      sif.customer_name,
      sif.forklift_name,
      sif.acquisition_cost,
      GREATEST(0,
        COALESCE(sif.acquisition_cost, 0)
        - COALESCE(sif.acquisition_cost, 0)
          * LEAST(1.0, COALESCE(rdbs.rented_days, 0)::numeric / (48 * 30.0))
      ) AS book_value
    FROM sale_invoice_forklifts sif
    LEFT JOIN rented_days_before_sale rdbs
      ON rdbs.forklift_id = sif.forklift_id
     AND rdbs.event_date  = sif.event_date
    WHERE sif.acquisition_cost IS NOT NULL
      AND sif.acquisition_cost > 0
  ),
  cogs_by_month AS (
    SELECT
      month_key,
      SUM(book_value) AS cogs_forklift_sales,
      jsonb_object_agg(
        customer_name || ' — ' || forklift_name,
        book_value
      ) FILTER (WHERE book_value > 0) AS cogs_by_forklift
    FROM cogs_per_sale
    GROUP BY month_key
  ),
  all_months AS (
    SELECT month_key FROM month_series
  ),
  combined AS (
    SELECT
      am.month_key,
      to_char(date_trunc('month', (am.month_key || '-01')::date), 'TMmon yy') AS month_label,
      GREATEST(0, COALESCE(rbm.revenue, 0) - COALESCE(cnm.credit_total, 0)) AS revenue,
      GREATEST(0, COALESCE(rbm.revenue_rental, 0) - COALESCE(cnm.credit_rental, 0)) AS revenue_rental,
      GREATEST(0, COALESCE(rbm.revenue_sales, 0) - COALESCE(cnm.credit_sales, 0)) AS revenue_sales,
      COALESCE(cnm.credit_total, 0) AS credit_notes,
      COALESCE(mbm.maintenance_cost, 0) AS maintenance_cost,
      COALESCE(dbm.damage_cost, 0) AS damage_cost,
      COALESCE(dpm.depreciation, 0) AS depreciation,
      COALESCE(cbm.cogs_forklift_sales, 0) AS cogs_forklift_sales,
      COALESCE(ebm.expenses, '{}'::jsonb) AS expenses,
      COALESCE(rbc.rental_by_customer, '{}'::jsonb) AS rental_by_customer,
      COALESCE(sbc.sales_by_customer, '{}'::jsonb) AS sales_by_customer,
      COALESCE(dpm.depreciation_by_forklift, '{}'::jsonb) AS depreciation_by_forklift,
      COALESCE(cbm.cogs_by_forklift, '{}'::jsonb) AS cogs_by_forklift
    FROM all_months am
    LEFT JOIN revenue_by_month rbm USING (month_key)
    LEFT JOIN credit_notes_by_month cnm USING (month_key)
    LEFT JOIN maint_by_month mbm USING (month_key)
    LEFT JOIN damage_by_month dbm USING (month_key)
    LEFT JOIN depreciation_per_month dpm USING (month_key)
    LEFT JOIN cogs_by_month cbm USING (month_key)
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

  SELECT jsonb_agg(DISTINCT jsonb_build_object('id', f.id, 'name', f.name))
  INTO v_sold_without_cost
  FROM invoices i
  JOIN quote_assigned_forklifts qaf ON qaf.quote_id = i.quote_id
  JOIN forklifts f ON f.id = qaf.forklift_id
  JOIN quotes q ON q.id = i.quote_id
  WHERE COALESCE(i.is_e2e, false) = false
    AND COALESCE(f.is_e2e, false) = false
    AND i.status NOT IN ('draft','cancelled')
    AND q.quote_type = 'sale'
    AND CASE WHEN p_basis = 'cash' THEN i.paid_at ELSE i.issued_at END
      BETWEEN p_start_date AND p_end_date
    AND (f.acquisition_cost IS NULL OR f.acquisition_cost <= 0);

  RETURN jsonb_build_object(
    'months', COALESCE(v_months, '[]'::jsonb),
    'rented_without_cost', COALESCE(v_rented_without_cost, '[]'::jsonb),
    'sold_without_cost', COALESCE(v_sold_without_cost, '[]'::jsonb)
  );
END;
$function$;