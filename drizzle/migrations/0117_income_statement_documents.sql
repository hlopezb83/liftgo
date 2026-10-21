-- MEJ-001: read-only document drilldown derived from the effective canonical CTEs.
-- This does not replace get_income_statement or change any arithmetic/filter.
-- Fail closed on source drift, SECURITY DEFINER, missing anchors or permissions.
-- No EXECUTE grant is added: activation/ACL requires separate reviewed approval.
DO $migration$
DECLARE
  v_source text;
  v_body text;
  v_from text;
  v_to text;
  v_hash text;
BEGIN
  SELECT prosrc, md5(prosrc) INTO STRICT v_source, v_hash
  FROM pg_proc WHERE oid = 'public.get_income_statement(date,date,text)'::regprocedure
    AND NOT prosecdef;
  IF position('has_role' IN v_source) = 0 OR position('contributing_bill_ids' IN v_source) = 0 THEN
    RAISE EXCEPTION 'MEJ-001: canonical authorization/dedup prerequisites missing';
  END IF;
  IF position('  all_months AS (' IN v_source) = 0 THEN
    RAISE EXCEPTION 'MEJ-001: canonical CTE boundary missing';
  END IF;
  -- Keep the role guard and all canonical CTEs, drop only the aggregate result.
  v_body := 'DECLARE v_result jsonb;' || substr(v_source, position('BEGIN' IN v_source));
  v_body := split_part(v_body, '  all_months AS (', 1);
  v_from := $from0$      i.id,
$from0$;
  v_to := $to0$      i.id, pay.id AS trace_payment_id, i.invoice_number AS trace_folio,
      i.issued_at AS trace_document_date, COALESCE(i.moneda, 'MXN') AS trace_currency,
$to0$;
  IF (length(v_body) - length(replace(v_body, v_from, ''))) / length(v_from) <> 1 THEN
    RAISE EXCEPTION 'MEJ-001: trace anchor 0 missing or ambiguous';
  END IF;
  v_body := replace(v_body, v_from, v_to);
  v_from := $from1$    SELECT cn.id,
$from1$;
  v_to := $to1$    SELECT cn.id, cn.credit_note_number AS trace_folio, COALESCE(cn.currency, 'MXN') AS trace_currency,
$to1$;
  IF (length(v_body) - length(replace(v_body, v_from, ''))) / length(v_from) <> 1 THEN
    RAISE EXCEPTION 'MEJ-001: trace anchor 1 missing or ambiguous';
  END IF;
  v_body := replace(v_body, v_from, v_to);
  v_from := $from2$      sb.id,
$from2$;
  v_to := $to2$      sb.id, sb.bill_number AS trace_folio, COALESCE(sb.currency, 'MXN') AS trace_currency,
$to2$;
  IF (length(v_body) - length(replace(v_body, v_from, ''))) / length(v_from) <> 1 THEN
    RAISE EXCEPTION 'MEJ-001: trace anchor 2 missing or ambiguous';
  END IF;
  v_body := replace(v_body, v_from, v_to);
  v_from := $from3$  sb_accrual_no_coverage AS (
    SELECT
$from3$;
  v_to := $to3$  sb_accrual_no_coverage AS (
    SELECT sb.id AS trace_document_id, NULL::uuid AS trace_payment_id,
$to3$;
  IF (length(v_body) - length(replace(v_body, v_from, ''))) / length(v_from) <> 1 THEN
    RAISE EXCEPTION 'MEJ-001: trace anchor 3 missing or ambiguous';
  END IF;
  v_body := replace(v_body, v_from, v_to);
  v_from := $from4$  sb_accrual_coverage AS (
    SELECT
$from4$;
  v_to := $to4$  sb_accrual_coverage AS (
    SELECT sb.id AS trace_document_id, NULL::uuid AS trace_payment_id,
$to4$;
  IF (length(v_body) - length(replace(v_body, v_from, ''))) / length(v_from) <> 1 THEN
    RAISE EXCEPTION 'MEJ-001: trace anchor 4 missing or ambiguous';
  END IF;
  v_body := replace(v_body, v_from, v_to);
  v_from := $from5$  sb_cash AS (
    SELECT
$from5$;
  v_to := $to5$  sb_cash AS (
    SELECT sb.id AS trace_document_id, sp.id AS trace_payment_id,
$to5$;
  IF (length(v_body) - length(replace(v_body, v_from, ''))) / length(v_from) <> 1 THEN
    RAISE EXCEPTION 'MEJ-001: trace anchor 5 missing or ambiguous';
  END IF;
  v_body := replace(v_body, v_from, v_to);
  v_from := $from6$  oe_lines AS (
    SELECT
$from6$;
  v_to := $to6$  oe_lines AS (
    SELECT oe.id AS trace_document_id,
$to6$;
  IF (length(v_body) - length(replace(v_body, v_from, ''))) / length(v_from) <> 1 THEN
    RAISE EXCEPTION 'MEJ-001: trace anchor 6 missing or ambiguous';
  END IF;
  v_body := replace(v_body, v_from, v_to);
  v_from := $from7$    SELECT oe.month_key, oe.category, oe.amount, oe.description, oe.date_key
$from7$;
  v_to := $to7$    SELECT oe.trace_document_id, oe.month_key, oe.category, oe.amount, oe.description, oe.date_key
$to7$;
  IF (length(v_body) - length(replace(v_body, v_from, ''))) / length(v_from) <> 1 THEN
    RAISE EXCEPTION 'MEJ-001: trace anchor 7 missing or ambiguous';
  END IF;
  v_body := replace(v_body, v_from, v_to);
  v_body := replace(v_body, 'BEGIN', replace($guard$BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date
    OR p_end_date - p_start_date > 3660 OR p_basis IS NULL OR p_basis NOT IN ('accrual','cash')
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100
    OR p_offset IS NULL OR p_offset < 0 OR p_offset > 100000
    OR p_month_keys IS NULL OR cardinality(p_month_keys) NOT BETWEEN 1 AND 120
    OR EXISTS (SELECT 1 FROM unnest(p_month_keys) k WHERE k IS NULL OR k !~ '^\d{4}-(0[1-9]|1[0-2])$')
    OR p_kind IS NULL OR NOT (p_kind IN ('rental_booked','rental_unbooked','sales','other_services','damage_recovery','credit_notes')
      OR p_kind ~ '^exp:[a-z_]+$')
  THEN RAISE EXCEPTION 'Invalid document scope' USING ERRCODE = '22023'; END IF;
  IF NOT COALESCE(public.has_permission('Reportes','read'), false) OR
    (CASE WHEN p_kind LIKE 'exp:%' THEN
      NOT (COALESCE(public.has_permission('Facturas de Proveedor','read'), false) AND COALESCE(public.has_permission('Gastos','read'), false))
    ELSE NOT COALESCE(public.has_permission('Facturas','read'), false) OR
      (p_basis = 'cash' AND p_kind <> 'credit_notes' AND NOT COALESCE(public.has_permission('Pagos','read'), false)) END)
  THEN RAISE EXCEPTION 'Forbidden document access' USING ERRCODE = '42501'; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.get_income_statement(date,date,text)'::regprocedure AND NOT prosecdef)
    IS DISTINCT FROM '__SOURCE_HASH__'
  THEN RAISE EXCEPTION 'Document source version changed; review and refresh MEJ-001' USING ERRCODE = '55000'; END IF;
$guard$, '__SOURCE_HASH__', v_hash));
  v_body := v_body || $tail$  source_documents AS (
    SELECT CASE WHEN p_basis = 'cash' THEN 'payment' ELSE 'invoice' END AS source_type,
      i.id AS document_id, i.trace_payment_id AS payment_id, i.id AS invoice_id,
      i.trace_folio AS folio, i.trace_document_date::date AS document_date,
      i.event_date::date AS event_date, i.month_key, i.trace_currency AS currency,
      i.subtotal AS amount, i.customer_name AS label, i.revenue_kind AS kind,
      NULL::date AS coverage_start, NULL::date AS coverage_end
    FROM inv_classified i
    UNION ALL
    SELECT 'credit_note', c.id, NULL::uuid, c.invoice_id, c.trace_folio,
      c.event_date::date, c.event_date::date, c.month_key, c.trace_currency, c.subtotal,
      c.customer_name || ' — ' || c.invoice_number, 'credit_notes', NULL::date, NULL::date
    FROM cn_base c
    WHERE EXISTS (SELECT 1 FROM invoices visible_invoice WHERE visible_invoice.id = c.invoice_id)
    UNION ALL
    SELECT CASE WHEN p_basis = 'cash' THEN 'supplier_payment' ELSE 'supplier_bill' END,
      s.trace_document_id, s.trace_payment_id, NULL::uuid, b.trace_folio,
      b.issue_date, s.date_key, s.month_key, b.trace_currency, s.amount,
      COALESCE(s.supplier_name, '') || ' · ' || COALESCE(NULLIF(s.description, ''), 'Sin descripción'),
      'exp:' || s.category, b.coverage_start, b.coverage_end
    FROM sb_lines s JOIN sb_base b ON b.id = s.trace_document_id
    UNION ALL
    SELECT 'operating_expense', o.trace_document_id, NULL::uuid, NULL::uuid, NULL::text,
      o.date_key, o.date_key, o.month_key, 'MXN', o.amount,
      'Gasto operativo · ' || COALESCE(NULLIF(o.description, ''), 'Sin descripción'),
      'exp:' || o.category, NULL::date, NULL::date
    FROM oe_dedup o
  ),
  selected_documents AS (
    SELECT source_type, document_id, payment_id, invoice_id, folio, document_date,
      event_date, month_key, currency, label, coverage_start, coverage_end,
      SUM(amount) AS amount
    FROM source_documents
    WHERE kind = p_kind AND month_key = ANY(p_month_keys)
      AND (p_label IS NULL OR label = p_label)
    GROUP BY source_type, document_id, payment_id, invoice_id, folio, document_date,
      event_date, month_key, currency, label, coverage_start, coverage_end
  ),
  page AS (
    SELECT *, source_type || ':' || document_id::text || ':' || COALESCE(payment_id::text, month_key) AS row_key
    FROM selected_documents
    ORDER BY event_date DESC, source_type, document_id, payment_id NULLS FIRST, month_key
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY event_date DESC, source_type, document_id, payment_id NULLS FIRST, month_key) FROM page), '[]'::jsonb),
    'total_count', COUNT(*),
    'total_amount', ROUND(COALESCE(SUM(amount),0),2),
    'rounding_adjustment', ROUND(COALESCE(SUM(amount),0),2) - COALESCE(SUM(ROUND(amount,2)),0),
    'limit', p_limit, 'offset', p_offset, 'currency', 'MXN', 'basis', p_basis
  ) INTO v_result FROM selected_documents;
  RETURN v_result;
END;
$tail$;
  EXECUTE 'CREATE OR REPLACE FUNCTION public.get_income_statement_documents(
    p_start_date date, p_end_date date, p_basis text, p_kind text,
    p_label text, p_month_keys text[], p_limit integer DEFAULT 25, p_offset integer DEFAULT 0
  ) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO public AS ' || quote_literal(v_body);
END;
$migration$;

-- Deny the PostgreSQL default PUBLIC execution grant. No new role ACLs here.
REVOKE ALL ON FUNCTION public.get_income_statement_documents(date,date,text,text,text,text[],integer,integer) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.get_income_statement_documents(date,date,text,text,text,text[],integer,integer)
  IS 'MEJ-001 canonical source documents. Invoker RLS + original financial role guard + source-module permissions. Paginated; activation requires separately approved EXECUTE ACL.';
