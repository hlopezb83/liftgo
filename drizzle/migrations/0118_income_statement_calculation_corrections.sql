-- ER calculation corrections; no table, grant, policy or historical document changes.
-- Preserve both RPC signatures, existing invoker security and execution ACLs.
DO $migration$
DECLARE
  v_signature text;
  v_def text;
  v_old text;
  v_new text;
  v_hash text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.get_income_statement(date,date,text)'::regprocedure AND NOT prosecdef)
    IS DISTINCT FROM '9e833c1cbcbeeae5459baf2a127cfa45' THEN
    RAISE EXCEPTION 'ER0118: unexpected canonical source; review before applying';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.get_income_statement_documents(date,date,text,text,text,text[],integer,integer)'::regprocedure AND NOT prosecdef)
    IS DISTINCT FROM '9c7c57884b8cd954971354a207f887ab' THEN
    RAISE EXCEPTION 'ER0118: unexpected document source; review before applying';
  END IF;
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_income_statement(date,date,text)',
    'public.get_income_statement_documents(date,date,text,text,text,text[],integer,integer)'
  ] LOOP
    IF (SELECT prosecdef FROM pg_proc WHERE oid = v_signature::regprocedure) THEN
      RAISE EXCEPTION 'ER0118: invoker security required';
    END IF;
    v_def := pg_get_functiondef(v_signature::regprocedure);
    v_old := $old0$WHEN p_basis = 'cash' THEN i.status NOT IN ('draft','cancelled') AND pay.id IS NOT NULL$old0$;
    v_new := $new0$WHEN p_basis = 'cash' THEN i.status NOT IN ('draft','cancelled') AND pay.id IS NOT NULL
          AND public.fx_convert_amount(pay.amount, COALESCE(pay.currency, i.moneda, 'MXN'),
            COALESCE(i.moneda, 'MXN'), NULLIF(pay.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)) IS NOT NULL$new0$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'ER0118: anchor 0 missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old1$(pay.amount * COALESCE(NULLIF(pay.exchange_rate, 0), NULLIF(i.tipo_cambio, 0), 1))
                      / (i.total * COALESCE(NULLIF(i.tipo_cambio, 0), 1))$old1$;
    v_new := $new1$public.fx_convert_amount(pay.amount, COALESCE(pay.currency, i.moneda, 'MXN'),
                        COALESCE(i.moneda, 'MXN'), NULLIF(pay.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)) / i.total$new1$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'ER0118: anchor 1 missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old2$SUM(p2.amount)$old2$;
    v_new := $new2$SUM(public.fx_convert_amount(p2.amount, COALESCE(p2.currency, pi.moneda, 'MXN'), COALESCE(pi.moneda, 'MXN'), NULLIF(p2.exchange_rate, 0), NULLIF(pi.tipo_cambio, 0)))$new2$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'ER0118: anchor 2 missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old3$date_trunc('month', COALESCE(f.acquisition_date, f.created_at::date))::date + interval '47 months' >= ms.month_start$old3$;
    v_new := $new3$(COALESCE(f.acquisition_date, f.created_at::date) + interval '48 months - 1 day')::date >= ms.month_start$new3$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'ER0118: anchor 3 missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old4$    LEFT JOIN dup_keys d
      ON d.date_key = oe.date_key
     AND d.amount_key = ROUND(oe.amount::numeric, 2)
     AND d.desc_key = lower(regexp_replace(trim(COALESCE(oe.description, '')), '\s+', ' ', 'g'))
    WHERE d.date_key IS NULL
      AND (
        oe.supplier_bill_id IS NULL
        OR oe.supplier_bill_id NOT IN (SELECT id FROM contributing_bill_ids)
      )$old4$;
    v_new := $new4$    -- A durable source identity, never amount/date/text similarity, selects the source.
    -- Eligibility is independent of the requested range; linked supplier documents
    -- retain their own recognition dates even when they contribute outside this query.
    WHERE NOT EXISTS (SELECT 1 FROM sb_base linked WHERE linked.id = oe.supplier_bill_id)$new4$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'ER0118: anchor 4 missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old5$jsonb_object_agg(forklift_name, dep_total) AS depreciation_by_forklift$old5$;
    v_new := $new5$(SELECT jsonb_object_agg(d.forklift_name, d.total) FROM (
        SELECT p.forklift_name, SUM(p.dep_total) AS total
        FROM depreciation_per_forklift_month p WHERE p.month_key = dm.month_key
        GROUP BY p.forklift_name
      ) d) AS depreciation_by_forklift$new5$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'ER0118: anchor 5 missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old6$    FROM depreciation_per_forklift_month
    GROUP BY month_key$old6$;
    v_new := $new6$    FROM depreciation_per_forklift_month dm
    GROUP BY month_key$new6$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'ER0118: anchor 6 missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old7$      i.booking_id, i.quote_id, i.billing_period_start, i.billing_period_end,$old7$;
    v_new := $new7$      i.booking_id, i.quote_id, i.billing_period_start, i.billing_period_end,
      i.issued_at AS cogs_invoice_date, pay.id AS cogs_payment_id,$new7$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'ER0118: anchor 7 missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    v_old := $old8$  sale_invoice_forklifts AS (
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
$old8$;
    v_new := $new8$  cogs_payment_amounts AS (
    -- Normalize all payments before applying a query range. Invalid FX and
    -- non-positive legacy amounts never consume the sale's cost allocation.
    SELECT cp.id, cp.invoice_id, cp.payment_date, ci.total,
      public.fx_convert_amount(cp.amount, COALESCE(cp.currency, ci.moneda, 'MXN'),
        COALESCE(ci.moneda, 'MXN'), NULLIF(cp.exchange_rate, 0), NULLIF(ci.tipo_cambio, 0)) AS paid_amount
    FROM payments cp JOIN invoices ci ON ci.id = cp.invoice_id
    WHERE p_basis = 'cash' AND cp.amount > 0
      AND EXISTS (SELECT 1 FROM inv_classified selected_sale
        WHERE selected_sale.id = cp.invoice_id AND selected_sale.revenue_kind = 'sales')
  ),
  cogs_payment_running AS (
    SELECT *,
      COALESCE(SUM(paid_amount) OVER (PARTITION BY invoice_id ORDER BY payment_date, id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS paid_before
    FROM cogs_payment_amounts WHERE paid_amount IS NOT NULL AND paid_amount > 0
  ),
  cogs_payment_allocations AS (
    SELECT id, invoice_id,
      CASE WHEN total > 0 THEN
        (LEAST(total, paid_before + paid_amount) - LEAST(total, paid_before)) / total
        ELSE 0 END AS cost_fraction
    FROM cogs_payment_running
  ),
  sale_invoice_forklifts AS (
    SELECT DISTINCT ic.id AS sale_invoice_id, ic.cogs_payment_id,
      ic.month_key, ic.customer_name,
      COALESCE(f.sold_at, ic.cogs_invoice_date) AS event_date,
      CASE WHEN p_basis = 'cash' THEN COALESCE(cpa.cost_fraction, 0) ELSE 1 END AS cost_fraction,
      f.id AS forklift_id, f.name AS forklift_name, f.acquisition_cost,
      COALESCE(f.acquisition_date, f.created_at::date) AS activation_date
    FROM inv_classified ic
    JOIN quote_assigned_forklifts qaf ON qaf.quote_id = ic.quote_id
    JOIN forklifts f ON f.id = qaf.forklift_id
    LEFT JOIN cogs_payment_allocations cpa ON cpa.id = ic.cogs_payment_id AND cpa.invoice_id = ic.id
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
      ) * sif.cost_fraction AS book_value
    FROM sale_invoice_forklifts sif
    WHERE sif.acquisition_cost IS NOT NULL AND sif.acquisition_cost > 0
  ),
  cogs_label_totals AS (
    SELECT month_key, customer_name || ' — ' || forklift_name AS label, SUM(book_value) AS book_value
    FROM cogs_per_sale GROUP BY month_key, customer_name || ' — ' || forklift_name
  ),
  cogs_by_month AS (
    SELECT month_key, SUM(book_value) AS cogs_forklift_sales,
      jsonb_object_agg(label, book_value) FILTER (WHERE book_value > 0) AS cogs_by_forklift
    FROM cogs_label_totals GROUP BY month_key
  ),
$new8$;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'ER0118: anchor 8 missing or ambiguous in %', v_signature;
    END IF;
    v_def := replace(v_def, v_old, v_new);
    IF v_signature = 'public.get_income_statement(date,date,text)' THEN
      v_old := $decl$  v_fx_missing jsonb;$decl$;
      v_new := $decl$  v_fx_missing jsonb;
  v_cogs_fx_missing_ids uuid[];$decl$;
      IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'ER0118: FX declaration missing'; END IF;
      v_def := replace(v_def, v_old, v_new);
      v_old := $month$  SELECT jsonb_agg(to_jsonb(combined.*)) INTO v_months FROM combined;$month$;
      v_new := $month$  SELECT jsonb_agg(to_jsonb(combined.*)),
    (SELECT COALESCE(array_agg(ca.id), ARRAY[]::uuid[]) FROM cogs_payment_amounts ca
      WHERE ca.paid_amount IS NULL AND EXISTS (
        SELECT 1 FROM inv_classified current_sale
        WHERE current_sale.id = ca.invoice_id AND current_sale.revenue_kind = 'sales'
          AND (ca.payment_date, ca.id) < (current_sale.event_date, current_sale.cogs_payment_id)
      ))
    INTO v_months, v_cogs_fx_missing_ids FROM combined;$month$;
      IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'ER0118: month aggregate missing'; END IF;
      v_def := replace(v_def, v_old, v_new);
      v_old := $warnings$    'supplier_bills', ($warnings$;
      v_new := $warnings$    'payments', (
      SELECT COUNT(DISTINCT pay.id)
      FROM public.payments pay JOIN public.invoices i ON i.id = pay.invoice_id
      WHERE p_basis = 'cash'
        AND COALESCE(i.is_e2e, false) = false AND i.status NOT IN ('draft','cancelled')
        AND (COALESCE(i.moneda, 'MXN') = 'MXN' OR COALESCE(NULLIF(i.tipo_cambio, 0), 0) > 0)
        AND public.fx_convert_amount(pay.amount, COALESCE(pay.currency, i.moneda, 'MXN'),
          COALESCE(i.moneda, 'MXN'), NULLIF(pay.exchange_rate, 0), NULLIF(i.tipo_cambio, 0)) IS NULL
        AND (pay.id = ANY(v_cogs_fx_missing_ids) OR pay.payment_date BETWEEN p_start_date AND p_end_date OR EXISTS (
          SELECT 1 FROM public.credit_notes cn WHERE cn.invoice_id = i.id
            AND cn.status NOT IN ('draft','cancelled') AND cn.cfdi_status = 'stamped'
            AND cn.cancellation_status IS DISTINCT FROM 'accepted'
            AND cn.issued_at BETWEEN p_start_date AND p_end_date
        ))
    ),
    'supplier_bills', ($warnings$;
      IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'ER0118: FX warning anchor missing or ambiguous';
      END IF;
      v_def := replace(v_def, v_old, v_new);
    END IF;
    IF v_signature LIKE '%get_income_statement_documents%' THEN
      SELECT md5(prosrc) INTO STRICT v_hash FROM pg_proc
        WHERE oid = 'public.get_income_statement(date,date,text)'::regprocedure AND NOT prosecdef;
      IF position('9e833c1cbcbeeae5459baf2a127cfa45' IN v_def) = 0 THEN
        RAISE EXCEPTION 'ER0118: document fingerprint prerequisite missing';
      END IF;
      v_def := replace(v_def, '9e833c1cbcbeeae5459baf2a127cfa45', v_hash);
    END IF;
    EXECUTE v_def;
  END LOOP;
END;
$migration$;
