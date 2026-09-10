CREATE OR REPLACE FUNCTION public.get_bank_statement_lines_page(
  p_bank_account_id uuid,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH term AS (
    SELECT nullif(btrim(p_search), '') AS raw
  ), pattern AS (
    -- QA-BANK-04: escapa %, _ y \ para que la busqueda sea literal.
    SELECT CASE
      WHEN raw IS NULL THEN NULL
      ELSE '%' || replace(replace(replace(raw, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    END AS like_pattern
    FROM term
  ), filtered AS (
    SELECT
      l.id, l.import_id, l.bank_account_id, l.posted_date, l.description,
      l.signed_amount, l.reference, l.status, l.matched_payment_id,
      l.matched_supplier_payment_id, l.suggested_payment_id,
      l.suggested_supplier_payment_id, l.match_score, l.matched_at,
      l.ignored_reason
    FROM public.bank_statement_lines l
    CROSS JOIN pattern pt
    WHERE l.bank_account_id = p_bank_account_id
      AND (
        public.has_role((select auth.uid()), 'admin'::app_role)
        OR public.has_role((select auth.uid()), 'administrativo'::app_role)
        OR public.has_role((select auth.uid()), 'auditor'::app_role)
      )
      AND (p_status IS NULL OR l.status::text = p_status)
      AND (
        pt.like_pattern IS NULL
        OR l.description ILIKE pt.like_pattern ESCAPE '\'
        OR coalesce(l.reference, '') ILIKE pt.like_pattern ESCAPE '\'
        OR abs(l.signed_amount)::text ILIKE pt.like_pattern ESCAPE '\'
      )
  ), page_rows AS (
    SELECT *
      FROM filtered
     ORDER BY posted_date DESC, id DESC
     LIMIT greatest(1, least(coalesce(p_page_size, 50), 100))
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'rows', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.posted_date DESC, p.id DESC)
         FROM page_rows p),
      '[]'::jsonb
    ),
    'total_count', (SELECT count(*) FROM filtered)
  );
$function$;

REVOKE ALL ON FUNCTION public.get_bank_statement_lines_page(uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_statement_lines_page(uuid, text, text, integer, integer) TO authenticated, service_role;