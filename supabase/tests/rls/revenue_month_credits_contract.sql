-- The report drill-down must run with caller RLS and expose credit-note amounts.
BEGIN;

DO $check$
DECLARE
  v_definer boolean;
  v_has_credit_column boolean;
BEGIN
  SELECT p.prosecdef INTO v_definer
  FROM pg_proc p
  WHERE p.oid = 'public.report_revenue_month_invoices_with_credits(text)'::regprocedure;

  IF v_definer IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Revenue detail RPC must be SECURITY INVOKER';
  END IF;

  SELECT position(
    'credited_mxn numeric' IN pg_get_function_result(
      'public.report_revenue_month_invoices_with_credits(text)'::regprocedure
    )
  ) > 0 INTO v_has_credit_column;

  IF NOT v_has_credit_column THEN
    RAISE EXCEPTION 'Revenue detail RPC must expose credited_mxn';
  END IF;
END;
$check$;

ROLLBACK;
