-- CxP list/dashboard queries stay bounded to the requested page and aggregate
-- totals in PostgreSQL. Both functions are SECURITY INVOKER so table RLS remains
-- the authority for organization and role isolation.

CREATE OR REPLACE FUNCTION public.get_supplier_bills_page(
  p_search text,
  p_status text,
  p_supplier_id text,
  p_category text,
  p_month text,
  p_approval text,
  p_rep text,
  p_page integer,
  p_page_size integer,
  p_sort_by text,
  p_sort_desc boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_count bigint;
  v_items jsonb;
  v_search text := nullif(btrim(p_search), '');
BEGIN
  IF p_page IS NULL OR p_page < 0 OR p_page > 100000 THEN
    RAISE EXCEPTION 'Página fuera de rango' USING ERRCODE = '22023';
  END IF;
  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100 THEN
    RAISE EXCEPTION 'El tamaño de página debe estar entre 1 y 100' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(v_search, '')) > 200 THEN
    RAISE EXCEPTION 'La búsqueda no puede exceder 200 caracteres' USING ERRCODE = '22023';
  END IF;
  IF p_month IS NOT NULL AND p_month <> 'all'
    AND p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mes inválido' USING ERRCODE = '22023';
  END IF;

  WITH bill_base AS (
    SELECT
      b.id, b.bill_number, b.supplier_id, b.cfdi_uuid, b.folio, b.serie,
      b.issue_date, b.due_date, b.subtotal, b.tax_amount, b.retention_isr,
      b.retention_iva, b.total, b.currency, b.exchange_rate,
      b.payment_method_sat, b.payment_form_sat, b.cfdi_use, b.category,
      b.description, b.status, b.balance, b.xml_url, b.pdf_url,
      b.cfdi_xml_url, b.receptor_rfc, b.tipo_comprobante, b.coverage_start,
      b.coverage_end, b.notes, b.created_by, b.created_at, b.updated_at,
      b.approval_status, b.approved_by, b.approved_at, b.rejected_by,
      b.rejected_at, b.approval_notes, b.payment_in_progress_at,
      s.id AS joined_supplier_id, s.name AS supplier_name
    FROM public.supplier_bills AS b
    LEFT JOIN public.suppliers AS s ON s.id = b.supplier_id
  ), filtered_bills AS MATERIALIZED (
    SELECT *
    FROM bill_base AS b
    WHERE (p_status IS NULL OR p_status = 'all' OR b.status::text = p_status)
      AND (p_supplier_id IS NULL OR p_supplier_id = 'all' OR b.supplier_id::text = p_supplier_id)
      AND (p_category IS NULL OR p_category = 'all' OR b.category::text = p_category)
      AND (p_approval IS NULL OR p_approval = 'all' OR b.approval_status::text = p_approval)
      AND (
        p_month IS NULL OR p_month = 'all' OR
        (b.issue_date >= to_date(p_month || '-01', 'YYYY-MM-DD')
          AND b.issue_date < (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month')::date)
      )
      AND (
        v_search IS NULL OR strpos(
          lower(concat_ws(' ', b.bill_number, b.cfdi_uuid, b.folio, b.description, b.supplier_name)),
          lower(v_search)
        ) > 0
      )
      AND (
        coalesce(p_rep, 'all') = 'all'
        OR (p_rep = 'not_required' AND NOT EXISTS (
          SELECT 1 FROM public.supplier_payments AS p
          WHERE p.bill_id = b.id AND p.rep_required
        ))
        OR (p_rep = 'pending' AND EXISTS (
          SELECT 1 FROM public.supplier_payments AS p
          WHERE p.bill_id = b.id AND p.rep_required AND p.rep_status = 'pending'
        ))
        OR (p_rep = 'rejected' AND EXISTS (
          SELECT 1 FROM public.supplier_payments AS p
          WHERE p.bill_id = b.id AND p.rep_required AND p.rep_status = 'rejected'
        ))
        OR (p_rep = 'received'
          AND EXISTS (
            SELECT 1 FROM public.supplier_payments AS p
            WHERE p.bill_id = b.id AND p.rep_required
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.supplier_payments AS p
            WHERE p.bill_id = b.id AND p.rep_required AND p.rep_status <> 'received'
          ))
      )
  ), ordered_bills AS (
    SELECT b.*, row_number() OVER (ORDER BY
      CASE WHEN p_sort_by = 'bill_number' AND NOT coalesce(p_sort_desc, false) THEN b.bill_number END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'bill_number' AND coalesce(p_sort_desc, false) THEN b.bill_number END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'supplier' AND NOT coalesce(p_sort_desc, false) THEN lower(b.supplier_name) END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'supplier' AND coalesce(p_sort_desc, false) THEN lower(b.supplier_name) END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'issue_date' AND NOT coalesce(p_sort_desc, false) THEN b.issue_date END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'issue_date' AND coalesce(p_sort_desc, true) THEN b.issue_date END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'due_date' AND NOT coalesce(p_sort_desc, false) THEN b.due_date END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'due_date' AND coalesce(p_sort_desc, false) THEN b.due_date END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'total' AND NOT coalesce(p_sort_desc, false) THEN b.total END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'total' AND coalesce(p_sort_desc, false) THEN b.total END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'balance' AND NOT coalesce(p_sort_desc, false) THEN b.balance END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'balance' AND coalesce(p_sort_desc, false) THEN b.balance END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'status' AND NOT coalesce(p_sort_desc, false) THEN b.status::text END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'status' AND coalesce(p_sort_desc, false) THEN b.status::text END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'approval_status' AND NOT coalesce(p_sort_desc, false) THEN b.approval_status::text END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'approval_status' AND coalesce(p_sort_desc, false) THEN b.approval_status::text END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'category' AND NOT coalesce(p_sort_desc, false) THEN b.category::text END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'category' AND coalesce(p_sort_desc, false) THEN b.category::text END DESC NULLS LAST,
      b.issue_date DESC,
      b.id ASC
    ) AS page_order
    FROM filtered_bills AS b
  ), page_rows AS (
    SELECT b.*
    FROM ordered_bills AS b
    ORDER BY b.page_order
    LIMIT p_page_size OFFSET (p_page * p_page_size)
  )
  SELECT
    (SELECT count(*) FROM filtered_bills),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'bill_number', b.bill_number,
        'supplier_id', b.supplier_id,
        'cfdi_uuid', b.cfdi_uuid,
        'folio', b.folio,
        'serie', b.serie,
        'issue_date', b.issue_date,
        'due_date', b.due_date,
        'subtotal', b.subtotal,
        'tax_amount', b.tax_amount,
        'retention_isr', b.retention_isr,
        'retention_iva', b.retention_iva,
        'total', b.total,
        'currency', b.currency,
        'exchange_rate', b.exchange_rate,
        'payment_method_sat', b.payment_method_sat,
        'payment_form_sat', b.payment_form_sat,
        'cfdi_use', b.cfdi_use,
        'category', b.category,
        'description', b.description,
        'status', b.status,
        'balance', b.balance,
        'xml_url', b.xml_url,
        'pdf_url', b.pdf_url,
        'cfdi_xml_url', b.cfdi_xml_url,
        'receptor_rfc', b.receptor_rfc,
        'tipo_comprobante', b.tipo_comprobante,
        'coverage_start', b.coverage_start,
        'coverage_end', b.coverage_end,
        'notes', b.notes,
        'created_by', b.created_by,
        'created_at', b.created_at,
        'updated_at', b.updated_at,
        'approval_status', b.approval_status,
        'approved_by', b.approved_by,
        'approved_at', b.approved_at,
        'rejected_by', b.rejected_by,
        'rejected_at', b.rejected_at,
        'approval_notes', b.approval_notes,
        'payment_in_progress_at', b.payment_in_progress_at,
        'suppliers', CASE WHEN b.joined_supplier_id IS NULL THEN NULL
          ELSE jsonb_build_object('id', b.joined_supplier_id, 'name', b.supplier_name) END
      ) ORDER BY b.page_order
    ), '[]'::jsonb)
  INTO v_total_count, v_items
  FROM page_rows AS b;

  RETURN jsonb_build_object('items', v_items, 'totalCount', v_total_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_accounts_payable_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Monterrey')::date;
  v_month_start date;
  v_kpis jsonb;
  v_months jsonb;
BEGIN
  v_month_start := date_trunc('month', v_today)::date;

  WITH bill_values AS MATERIALIZED (
    SELECT
      b.id, b.status, b.approval_status, b.due_date, b.balance, b.total,
      b.exchange_rate,
      (upper(coalesce(b.currency, 'MXN')) <> 'MXN'
        AND (b.exchange_rate IS NULL OR b.exchange_rate <= 0 OR b.exchange_rate = 1
          OR b.exchange_rate::text = 'NaN')) AS fx_missing,
      CASE
        WHEN upper(coalesce(b.currency, 'MXN')) = 'MXN' THEN b.balance
        WHEN b.exchange_rate > 0 AND b.exchange_rate <> 1 AND b.exchange_rate::text <> 'NaN'
          THEN b.balance * b.exchange_rate
        ELSE NULL
      END AS balance_mxn,
      CASE
        WHEN upper(coalesce(b.currency, 'MXN')) = 'MXN' THEN b.total
        WHEN b.exchange_rate > 0 AND b.exchange_rate <> 1 AND b.exchange_rate::text <> 'NaN'
          THEN b.total * b.exchange_rate
        ELSE NULL
      END AS total_mxn
    FROM public.supplier_bills AS b
  ), bill_kpis AS (
    SELECT
      coalesce(sum(balance_mxn) FILTER (
        WHERE status <> 'draft' AND balance > 0 AND balance_mxn IS NOT NULL
      ), 0) AS total_pending,
      coalesce(sum(balance_mxn) FILTER (
        WHERE status <> 'draft' AND balance > 0 AND balance_mxn IS NOT NULL
          AND due_date < v_today
      ), 0) AS total_overdue,
      coalesce(sum(balance_mxn) FILTER (
        WHERE status <> 'draft' AND balance > 0 AND balance_mxn IS NOT NULL
          AND due_date >= v_today AND due_date <= v_today + 7
      ), 0) AS total_due_soon,
      coalesce(sum(total_mxn) FILTER (
        WHERE approval_status = 'pending' AND status <> 'paid' AND total_mxn IS NOT NULL
      ), 0) AS total_to_approve,
      count(*) FILTER (
        WHERE approval_status = 'pending' AND status <> 'paid'
      ) AS count_to_approve,
      count(*) FILTER (
        WHERE status <> 'draft' AND balance > 0 AND fx_missing
      ) AS fx_missing_count
    FROM bill_values
    WHERE status <> 'cancelled' AND approval_status <> 'rejected'
  ), paid_this_month AS (
    SELECT coalesce(sum(
      CASE
        WHEN upper(coalesce(b.currency, 'MXN')) = 'MXN' THEN p.amount
        WHEN b.exchange_rate > 0 AND b.exchange_rate <> 1 AND b.exchange_rate::text <> 'NaN'
          THEN p.amount * b.exchange_rate
        ELSE 0
      END
    ), 0) AS paid_mxn
    FROM public.supplier_payments AS p
    JOIN public.supplier_bills AS b ON b.id = p.bill_id
    WHERE p.payment_date >= v_month_start
      AND p.payment_date < (v_month_start + interval '1 month')::date
      AND b.status <> 'cancelled'
      AND b.approval_status <> 'rejected'
      AND (
        upper(coalesce(b.currency, 'MXN')) = 'MXN'
        OR (b.exchange_rate > 0 AND b.exchange_rate <> 1 AND b.exchange_rate::text <> 'NaN')
      )
  ), rep_kpis AS (
    SELECT count(*) AS rep_pending
    FROM public.supplier_payments AS p
    JOIN public.supplier_bills AS b ON b.id = p.bill_id
    WHERE p.rep_required AND p.rep_status = 'pending'
      AND b.status <> 'cancelled' AND b.approval_status <> 'rejected'
  )
  SELECT jsonb_build_object(
    'totalPendiente', k.total_pending,
    'totalVencido', k.total_overdue,
    'totalPorVencer', k.total_due_soon,
    'pagadoMesActual', paid.paid_mxn,
    'totalPorAprobar', k.total_to_approve,
    'countPorAprobar', k.count_to_approve,
    'repPendientes', rep.rep_pending,
    'fxMissingCount', k.fx_missing_count
  )
  INTO v_kpis
  FROM bill_kpis AS k CROSS JOIN paid_this_month AS paid CROSS JOIN rep_kpis AS rep;

  SELECT coalesce(jsonb_agg(month_key ORDER BY month_key DESC), '[]'::jsonb)
  INTO v_months
  FROM (
    SELECT DISTINCT to_char(issue_date, 'YYYY-MM') AS month_key
    FROM public.supplier_bills
  ) AS months;

  RETURN jsonb_build_object('kpis', v_kpis, 'availableMonths', v_months);
END;
$$;

REVOKE ALL ON FUNCTION public.get_supplier_bills_page(text, text, text, text, text, text, text, integer, integer, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_accounts_payable_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_bills_page(text, text, text, text, text, text, text, integer, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accounts_payable_summary() TO authenticated;
