CREATE OR REPLACE FUNCTION public.get_income_statement(p_start_date date, p_end_date date, p_basis text DEFAULT 'accrual'::text)
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
      i.id, i.subtotal, i.invoice_type,
      COALESCE(i.customer_name, 'Sin cliente') AS customer_name,
      i.booking_id, i.quote_id, i.billing_period_start, i.billing_period_end,
      CASE WHEN p_basis = 'cash' THEN i.paid_at ELSE i.issued_at END AS event_date
    FROM invoices i
    WHERE COALESCE(i.is_e2e, false) = false
      AND CASE
        WHEN p_basis = 'cash' THEN i.status = 'paid' AND i.paid_at IS NOT NULL
        ELSE i.status NOT IN ('draft','cancelled')
      END
      AND CASE WHEN p_basis = 'cash' THEN i.paid_at ELSE i.issued_at END
        BETWEEN p_start_date AND p_end_date
  ),
  inv_classified AS (
    SELECT i.*,
      CASE
        WHEN i.invoice_type = 'damage_charge' THEN 'damage_recovery'
        WHEN i.booking_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM invoice_bookings ib WHERE ib.invoice_id = i.id)
          THEN 'rental_booked'
        WHEN (i.quote_id IS NOT NULL AND i.quote_id IN (SELECT id FROM rental_quotes))
          OR (i.billing_period_start IS NOT NULL AND i.billing_period_end IS NOT NULL)
          THEN 'rental_unbooked'
        ELSE 'sales'
      END AS revenue_kind,
      to_char(date_trunc('month', i.event_date), 'YYYY-MM') AS month_key
    FROM inv i
  ),
  cn_base AS (
    SELECT cn.id, cn.subtotal, cn.invoice_id, cn.issued_at AS event_date,
      to_char(date_trunc('month', cn.issued_at), 'YYYY-MM') AS month_key
    FROM credit_notes cn
    WHERE cn.status NOT IN ('draft','cancelled')
      AND cn.issued_at BETWEEN p_start_date AND p_end_date
  ),
  cn_classified AS (
    SELECT cnb.month_key, cnb.subtotal,
      CASE
        WHEN i.invoice_type = 'damage_charge' THEN 'damage_recovery'
        WHEN i.booking_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM invoice_bookings ib WHERE ib.invoice_id = i.id)
          THEN 'rental_booked'
        WHEN (i.quote_id IS NOT NULL AND i.quote_id IN (SELECT id FROM rental_quotes))
          OR (i.billing_period_start IS NOT NULL AND i.billing_period_end IS NOT NULL)
          THEN 'rental_unbooked'
        ELSE 'sales'
      END AS revenue_kind
    FROM cn_base cnb
    LEFT JOIN invoices i ON i.id = cnb.invoice_id
  ),
  credit_notes_by_month AS (
    SELECT month_key, SUM(subtotal) AS credit_total,
      SUM(CASE WHEN revenue_kind = 'rental_booked' THEN subtotal ELSE 0 END) AS credit_rental_booked,
      SUM(CASE WHEN revenue_kind = 'rental_unbooked' THEN subtotal ELSE 0 END) AS credit_rental_unbooked,
      SUM(CASE WHEN revenue_kind = 'sales' THEN subtotal ELSE 0 END) AS credit_sales,
      SUM(CASE WHEN revenue_kind = 'damage_recovery' THEN subtotal ELSE 0 END) AS credit_damage_recovery
    FROM cn_classified GROUP BY month_key
  ),
  revenue_by_month AS (
    SELECT month_key, SUM(subtotal) AS revenue,
      SUM(CASE WHEN revenue_kind = 'rental_booked' THEN subtotal ELSE 0 END) AS revenue_rental_booked,
      SUM(CASE WHEN revenue_kind = 'rental_unbooked' THEN subtotal ELSE 0 END) AS revenue_rental_unbooked,
      SUM(CASE WHEN revenue_kind = 'sales' THEN subtotal ELSE 0 END) AS revenue_sales,
      SUM(CASE WHEN revenue_kind = 'damage_recovery' THEN subtotal ELSE 0 END) AS revenue_damage_recovery
    FROM inv_classified GROUP BY month_key
  ),
  rental_booked_by_customer AS (
    SELECT month_key, jsonb_object_agg(customer_name, total) AS rental_booked_by_customer
    FROM (SELECT month_key, customer_name, SUM(subtotal) AS total FROM inv_classified WHERE revenue_kind = 'rental_booked' GROUP BY month_key, customer_name) t
    GROUP BY month_key
  ),
  rental_unbooked_by_customer AS (
    SELECT month_key, jsonb_object_agg(customer_name, total) AS rental_unbooked_by_customer
    FROM (SELECT month_key, customer_name, SUM(subtotal) AS total FROM inv_classified WHERE revenue_kind = 'rental_unbooked' GROUP BY month_key, customer_name) t
    GROUP BY month_key
  ),
  sales_by_customer AS (
    SELECT month_key, jsonb_object_agg(customer_name, total) AS sales_by_customer
    FROM (SELECT month_key, customer_name, SUM(subtotal) AS total FROM inv_classified WHERE revenue_kind = 'sales' GROUP BY month_key, customer_name) t
    GROUP BY month_key
  ),
  damage_recovery_by_customer AS (
    SELECT month_key, jsonb_object_agg(customer_name, total) AS damage_recovery_by_customer
    FROM (SELECT month_key, customer_name, SUM(subtotal) AS total FROM inv_classified WHERE revenue_kind = 'damage_recovery' GROUP BY month_key, customer_name) t
    GROUP BY month_key
  ),
  maint_by_month AS (
    SELECT to_char(date_trunc('month', performed_at), 'YYYY-MM') AS month_key,
      SUM(COALESCE(cost, 0)) AS maintenance_cost
    FROM maintenance_logs
    WHERE performed_at BETWEEN p_start_date AND p_end_date
      AND work_status = 'completed'
    GROUP BY 1
  ),
  damage_by_month AS (
    SELECT to_char(date_trunc('month', COALESCE(repaired_at, created_at)), 'YYYY-MM') AS month_key,
      SUM(COALESCE(actual_cost, estimated_cost, 0)) AS damage_cost
    FROM damage_records
    WHERE COALESCE(repaired_at, created_at)::date BETWEEN p_start_date AND p_end_date
    GROUP BY 1
  ),
  sb_base AS (
    SELECT
      sb.id, sb.subtotal, sb.total, sb.category::text AS category,
      sb.description, sb.issue_date, sb.coverage_start, sb.coverage_end,
      COALESCE(s.name, 'Sin proveedor') AS supplier_name
    FROM supplier_bills sb
    LEFT JOIN suppliers s ON s.id = sb.supplier_id
    WHERE sb.status <> 'cancelled'
      AND sb.category IS NOT NULL
      AND sb.category NOT IN ('software','depreciacion')
  ),
  sb_accrual_no_coverage AS (
    SELECT
      to_char(date_trunc('month', sb.issue_date), 'YYYY-MM') AS month_key,
      sb.issue_date AS date_key,
      sb.category, sb.description, sb.subtotal AS amount, sb.supplier_name
    FROM sb_base sb
    WHERE p_basis = 'accrual'
      AND (sb.coverage_start IS NULL OR sb.coverage_end IS NULL)
      AND sb.issue_date BETWEEN p_start_date AND p_end_date
  ),
  sb_accrual_coverage AS (
    SELECT
      to_char(date_trunc('month', gs.m), 'YYYY-MM') AS month_key,
      sb.issue_date AS date_key,
      sb.category, sb.description,
      (
        sb.subtotal
        * ( GREATEST(0,
              (LEAST(sb.coverage_end, (date_trunc('month', gs.m) + interval '1 month - 1 day')::date)
               - GREATEST(sb.coverage_start, date_trunc('month', gs.m)::date)
               + 1)
            )::numeric
            / NULLIF((sb.coverage_end - sb.coverage_start + 1)::numeric, 0)
          )
      ) AS amount,
      sb.supplier_name
    FROM sb_base sb
    JOIN LATERAL generate_series(
      date_trunc('month', GREATEST(sb.coverage_start, p_start_date)::timestamp),
      date_trunc('month', LEAST(sb.coverage_end, p_end_date)::timestamp),
      interval '1 month'
    ) gs(m) ON true
    WHERE p_basis = 'accrual'
      AND sb.coverage_start IS NOT NULL
      AND sb.coverage_end IS NOT NULL
      AND sb.coverage_start <= p_end_date
      AND sb.coverage_end >= p_start_date
  ),
  sb_cash AS (
    SELECT
      to_char(date_trunc('month', sp.payment_date), 'YYYY-MM') AS month_key,
      sp.payment_date AS date_key,
      sb.category, sb.description,
      CASE WHEN COALESCE(sb.total, 0) > 0
        THEN sb.subtotal * (sp.amount / sb.total)
        ELSE sp.amount END AS amount,
      sb.supplier_name
    FROM sb_base sb
    JOIN supplier_payments sp ON sp.bill_id = sb.id
    WHERE p_basis = 'cash'
      AND sp.payment_date BETWEEN p_start_date AND p_end_date
  ),
  sb_lines AS (
    SELECT * FROM sb_accrual_no_coverage
    UNION ALL SELECT * FROM sb_accrual_coverage
    UNION ALL SELECT * FROM sb_cash
  ),
  oe_lines AS (
    SELECT
      to_char(date_trunc('month', oe.expense_date), 'YYYY-MM') AS month_key,
      oe.expense_date AS date_key,
      oe.category::text AS category, oe.description, oe.amount
    FROM operating_expenses oe
    WHERE oe.category IS NOT NULL
      AND oe.category NOT IN ('software','depreciacion')
      AND oe.expense_date BETWEEN p_start_date AND p_end_date
  ),
  dup_keys AS (
    SELECT DISTINCT
      date_key,
      ROUND(amount::numeric, 2) AS amount_key,
      lower(regexp_replace(trim(COALESCE(description, '')), '\s+', ' ', 'g')) AS desc_key
    FROM sb_lines
  ),
  oe_dedup AS (
    SELECT oe.month_key, oe.category, oe.amount, oe.description, oe.date_key
    FROM oe_lines oe
    LEFT JOIN dup_keys d
      ON d.date_key = oe.date_key
     AND d.amount_key = ROUND(oe.amount::numeric, 2)
     AND d.desc_key = lower(regexp_replace(trim(COALESCE(oe.description, '')), '\s+', ' ', 'g'))
    WHERE d.date_key IS NULL
  ),
  expense_lines AS (
    SELECT month_key, category, amount FROM sb_lines
    UNION ALL
    SELECT month_key, category, amount FROM oe_dedup
  ),
  expenses_by_month AS (
    SELECT month_key, jsonb_object_agg(category, total) AS expenses
    FROM (
      SELECT month_key, category, SUM(amount) AS total
      FROM expense_lines
      WHERE month_key IS NOT NULL
      GROUP BY month_key, category
    ) t
    GROUP BY month_key
  ),
  -- PL-05: itemized detail per (month, category)
  expense_detail_lines AS (
    SELECT month_key, category, supplier_name AS supplier, description, amount, date_key AS date
    FROM sb_lines
    UNION ALL
    SELECT month_key, category, 'Gasto operativo'::text AS supplier, description, amount, date_key AS date
    FROM oe_dedup
  ),
  expense_detail_per_cat AS (
    SELECT month_key, category, jsonb_agg(
      jsonb_build_object(
        'supplier', supplier,
        'description', COALESCE(description, ''),
        'amount', amount,
        'date', date
      ) ORDER BY date DESC, amount DESC
    ) AS lines
    FROM expense_detail_lines
    WHERE month_key IS NOT NULL
    GROUP BY month_key, category
  ),
  expenses_detail_by_month AS (
    SELECT month_key, jsonb_object_agg(category, lines) AS expenses_detail_by_category
    FROM expense_detail_per_cat
    GROUP BY month_key
  ),
  active_bookings AS (
    SELECT b.forklift_id, b.start_date, b.end_date FROM bookings b
    WHERE COALESCE(b.is_e2e, false) = false
      AND b.status IN ('confirmed','completed')
      AND b.start_date <= p_end_date AND b.end_date >= p_start_date
  ),
  month_series AS (
    SELECT to_char(m, 'YYYY-MM') AS month_key, m::date AS month_start,
      (m + interval '1 month - 1 day')::date AS month_end,
      EXTRACT(day FROM (m + interval '1 month - 1 day'))::int AS days_in_month
    FROM generate_series(date_trunc('month', p_start_date), date_trunc('month', p_end_date), interval '1 month') m
  ),
  forklift_active_months AS (
    SELECT ms.month_key, ms.month_start, ms.month_end, ms.days_in_month,
      f.id AS forklift_id, f.name AS forklift_name, f.acquisition_cost,
      COALESCE(f.acquisition_date, f.created_at::date) AS activation_date,
      f.sold_at
    FROM month_series ms
    CROSS JOIN forklifts f
    WHERE COALESCE(f.is_e2e, false) = false
      AND f.acquisition_cost IS NOT NULL
      AND f.acquisition_cost > 0
      AND COALESCE(f.acquisition_date, f.created_at::date) <= ms.month_end
      AND (f.sold_at IS NULL OR f.sold_at >= ms.month_start)
  ),
  rented_days_per_month AS (
    SELECT ms.month_key, ms.days_in_month, ab.forklift_id,
      GREATEST(0, (LEAST(ab.end_date, ms.month_end) - GREATEST(ab.start_date, ms.month_start) + 1)) AS rented_days
    FROM month_series ms
    JOIN active_bookings ab ON ab.start_date <= ms.month_end AND ab.end_date >= ms.month_start
  ),
  rented_days_agg AS (
    SELECT month_key, days_in_month, forklift_id,
      LEAST(days_in_month, SUM(rented_days)::int) AS rented_days
    FROM rented_days_per_month
    GROUP BY month_key, days_in_month, forklift_id
  ),
  depreciation_per_forklift_month AS (
    SELECT fam.month_key, fam.forklift_id, fam.forklift_name, fam.acquisition_cost,
      (fam.acquisition_cost / 48.0) AS dep_total,
      (fam.acquisition_cost / 48.0)
        * (COALESCE(rda.rented_days, 0)::numeric / fam.days_in_month) AS dep_rented,
      (fam.acquisition_cost / 48.0)
        - (fam.acquisition_cost / 48.0) * (COALESCE(rda.rented_days, 0)::numeric / fam.days_in_month) AS dep_idle
    FROM forklift_active_months fam
    LEFT JOIN rented_days_agg rda
      ON rda.month_key = fam.month_key AND rda.forklift_id = fam.forklift_id
  ),
  depreciation_per_month AS (
    SELECT month_key,
      SUM(dep_rented) AS depreciation_rented,
      SUM(dep_idle) AS depreciation_idle,
      SUM(dep_total) AS depreciation,
      jsonb_object_agg(forklift_name, dep_total) AS depreciation_by_forklift
    FROM depreciation_per_forklift_month
    GROUP BY month_key
  ),
  sale_invoice_forklifts AS (
    SELECT ic.month_key, ic.customer_name, ic.event_date,
      f.id AS forklift_id, f.name AS forklift_name, f.acquisition_cost,
      COALESCE(f.acquisition_date, f.created_at::date) AS activation_date
    FROM inv_classified ic
    JOIN quote_assigned_forklifts qaf ON qaf.quote_id = ic.quote_id
    JOIN forklifts f ON f.id = qaf.forklift_id
    WHERE ic.revenue_kind = 'sales' AND ic.quote_id IS NOT NULL AND COALESCE(f.is_e2e, false) = false
  ),
  cogs_per_sale AS (
    SELECT sif.month_key, sif.customer_name, sif.forklift_name, sif.acquisition_cost,
      GREATEST(
        0,
        COALESCE(sif.acquisition_cost, 0)
          - COALESCE(sif.acquisition_cost, 0)
            * LEAST(
                1.0,
                GREATEST(
                  0,
                  (EXTRACT(YEAR FROM age(sif.event_date, sif.activation_date)) * 12
                   + EXTRACT(MONTH FROM age(sif.event_date, sif.activation_date)))
                )::numeric / 48.0
              )
      ) AS book_value
    FROM sale_invoice_forklifts sif
    WHERE sif.acquisition_cost IS NOT NULL AND sif.acquisition_cost > 0
  ),
  cogs_by_month AS (
    SELECT month_key, SUM(book_value) AS cogs_forklift_sales,
      jsonb_object_agg(customer_name || ' — ' || forklift_name, book_value) FILTER (WHERE book_value > 0) AS cogs_by_forklift
    FROM cogs_per_sale GROUP BY month_key
  ),
  all_months AS (SELECT month_key FROM month_series),
  combined AS (
    SELECT am.month_key,
      to_char(date_trunc('month', (am.month_key || '-01')::date), 'TMmon yy') AS month_label,
      (COALESCE(rbm.revenue, 0) - COALESCE(cnm.credit_total, 0)) AS revenue,
      (COALESCE(rbm.revenue_rental_booked, 0) - COALESCE(cnm.credit_rental_booked, 0)) AS revenue_rental_booked,
      (COALESCE(rbm.revenue_rental_unbooked, 0) - COALESCE(cnm.credit_rental_unbooked, 0)) AS revenue_rental_unbooked,
      (COALESCE(rbm.revenue_sales, 0) - COALESCE(cnm.credit_sales, 0)) AS revenue_sales,
      (COALESCE(rbm.revenue_damage_recovery, 0) - COALESCE(cnm.credit_damage_recovery, 0)) AS revenue_damage_recovery,
      COALESCE(mbm.maintenance_cost, 0) AS maintenance_cost,
      COALESCE(dbm.damage_cost, 0) AS damage_cost,
      -- PL-06: en base efectivo la depreciación no aplica
      CASE WHEN p_basis = 'cash' THEN 0 ELSE COALESCE(dpm.depreciation, 0) END AS depreciation,
      CASE WHEN p_basis = 'cash' THEN 0 ELSE COALESCE(dpm.depreciation_rented, 0) END AS depreciation_rented,
      CASE WHEN p_basis = 'cash' THEN 0 ELSE COALESCE(dpm.depreciation_idle, 0) END AS depreciation_idle,
      COALESCE(cbm.cogs_forklift_sales, 0) AS cogs_forklift_sales,
      COALESCE(ebm.expenses, '{}'::jsonb) AS expenses,
      COALESCE(edm.expenses_detail_by_category, '{}'::jsonb) AS expenses_detail_by_category,
      COALESCE(rbc.rental_booked_by_customer, '{}'::jsonb) AS rental_booked_by_customer,
      COALESCE(rubc.rental_unbooked_by_customer, '{}'::jsonb) AS rental_unbooked_by_customer,
      COALESCE(sbc.sales_by_customer, '{}'::jsonb) AS sales_by_customer,
      COALESCE(drbc.damage_recovery_by_customer, '{}'::jsonb) AS damage_recovery_by_customer,
      CASE WHEN p_basis = 'cash' THEN '{}'::jsonb ELSE COALESCE(dpm.depreciation_by_forklift, '{}'::jsonb) END AS depreciation_by_forklift,
      COALESCE(cbm.cogs_by_forklift, '{}'::jsonb) AS cogs_by_forklift
    FROM all_months am
    LEFT JOIN revenue_by_month rbm ON rbm.month_key = am.month_key
    LEFT JOIN credit_notes_by_month cnm ON cnm.month_key = am.month_key
    LEFT JOIN maint_by_month mbm ON mbm.month_key = am.month_key
    LEFT JOIN damage_by_month dbm ON dbm.month_key = am.month_key
    LEFT JOIN depreciation_per_month dpm ON dpm.month_key = am.month_key
    LEFT JOIN cogs_by_month cbm ON cbm.month_key = am.month_key
    LEFT JOIN expenses_by_month ebm ON ebm.month_key = am.month_key
    LEFT JOIN expenses_detail_by_month edm ON edm.month_key = am.month_key
    LEFT JOIN rental_booked_by_customer rbc ON rbc.month_key = am.month_key
    LEFT JOIN rental_unbooked_by_customer rubc ON rubc.month_key = am.month_key
    LEFT JOIN sales_by_customer sbc ON sbc.month_key = am.month_key
    LEFT JOIN damage_recovery_by_customer drbc ON drbc.month_key = am.month_key
    ORDER BY am.month_key
  )
  SELECT jsonb_agg(to_jsonb(combined.*)) INTO v_months FROM combined;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name)), '[]'::jsonb)
  INTO v_rented_without_cost
  FROM forklifts f
  WHERE COALESCE(f.is_e2e, false) = false
    AND (f.acquisition_cost IS NULL OR f.acquisition_cost = 0)
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.forklift_id = f.id
        AND b.status IN ('confirmed','completed')
        AND b.start_date <= p_end_date AND b.end_date >= p_start_date
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name)), '[]'::jsonb)
  INTO v_sold_without_cost
  FROM forklifts f
  WHERE COALESCE(f.is_e2e, false) = false
    AND (f.acquisition_cost IS NULL OR f.acquisition_cost = 0)
    AND EXISTS (
      SELECT 1
      FROM quote_assigned_forklifts qaf
      JOIN invoices i ON i.quote_id = qaf.quote_id
      WHERE qaf.forklift_id = f.id
        AND COALESCE(i.is_e2e, false) = false
        AND i.status NOT IN ('draft','cancelled')
        AND (CASE WHEN p_basis = 'cash' THEN i.paid_at ELSE i.issued_at END)
            BETWEEN p_start_date AND p_end_date
        AND i.booking_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM invoice_bookings ib WHERE ib.invoice_id = i.id)
        AND i.billing_period_start IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM quotes q
          WHERE q.id = i.quote_id
            AND q.quote_type = 'rental'
            AND COALESCE(q.is_e2e, false) = false
        )
    );

  RETURN jsonb_build_object(
    'months', COALESCE(v_months, '[]'::jsonb),
    'rented_without_cost', v_rented_without_cost,
    'sold_without_cost', v_sold_without_cost
  );
END;
$function$;