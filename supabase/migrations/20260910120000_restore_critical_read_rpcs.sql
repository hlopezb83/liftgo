-- Forward repair for production environments where the original data-integrity
-- migration was only partially applied. Read-only RPCs used by the published UI.

CREATE OR REPLACE FUNCTION public.get_bank_reconciliation_kpis(p_bank_account_id uuid)
RETURNS TABLE(
  total_count bigint,
  matched_count bigint,
  pending_count bigint,
  ignored_count bigint,
  charges numeric,
  credits numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE l.status = 'matched')::bigint,
    count(*) FILTER (WHERE l.status IN ('unmatched', 'suggested'))::bigint,
    count(*) FILTER (WHERE l.status = 'ignored')::bigint,
    coalesce(sum(abs(l.signed_amount)) FILTER (WHERE l.signed_amount < 0), 0),
    coalesce(sum(l.signed_amount) FILTER (WHERE l.signed_amount > 0), 0)
  FROM public.bank_statement_lines l
  WHERE l.bank_account_id = p_bank_account_id
    AND (
      public.has_role((select auth.uid()), 'admin'::app_role)
      OR public.has_role((select auth.uid()), 'administrativo'::app_role)
      OR public.has_role((select auth.uid()), 'auditor'::app_role)
    );
$function$;

REVOKE ALL ON FUNCTION public.get_bank_reconciliation_kpis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bank_reconciliation_kpis(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_feedback_points_total()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(sum(f.points_awarded), 0)::bigint
  FROM public.feedback_reports f
  WHERE f.reporter_id = (select auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.get_my_feedback_points_total() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_feedback_points_total() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_feedback_reports_by_status(
  p_status text,
  p_limit integer DEFAULT 20,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_result jsonb;
BEGIN
  IF p_status IS NULL OR p_status NOT IN (
    'new', 'triage', 'accepted', 'in_progress',
    'resolved', 'closed', 'rejected', 'duplicate'
  ) THEN
    RAISE EXCEPTION 'Estado de feedback inválido.' USING ERRCODE = '22023';
  END IF;

  WITH scoped AS MATERIALIZED (
    SELECT f.*
    FROM public.feedback_reports f
    WHERE f.status = p_status
  ), candidates AS MATERIALIZED (
    SELECT s.*
    FROM scoped s
    WHERE p_before_created_at IS NULL
       OR s.created_at < p_before_created_at
       OR (s.created_at = p_before_created_at AND s.id < p_before_id)
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT v_limit + 1
  ), page_rows AS (
    SELECT c.*
    FROM candidates c
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT v_limit
  )
  SELECT jsonb_build_object(
    'rows', coalesce((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.id DESC)
      FROM page_rows r
    ), '[]'::jsonb),
    'total_count', (SELECT count(*) FROM scoped),
    'has_more', (SELECT count(*) > v_limit FROM candidates),
    'next_created_at', (
      SELECT r.created_at FROM page_rows r
      ORDER BY r.created_at ASC, r.id ASC LIMIT 1
    ),
    'next_id', (
      SELECT r.id FROM page_rows r
      ORDER BY r.created_at ASC, r.id ASC LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_feedback_reports_by_status(text, integer, timestamptz, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feedback_reports_by_status(text, integer, timestamptz, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

