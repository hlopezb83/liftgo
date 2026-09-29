-- CxP server pagination and KPI aggregation must remain read-only and preserve
-- caller RLS. Run after migration 20260928140000.
BEGIN;

DO $$
DECLARE
  v_page regprocedure := 'public.get_supplier_bills_page(text,text,text,text,text,text,text,integer,integer,text,boolean)'::regprocedure;
  v_summary regprocedure := 'public.get_accounts_payable_summary()'::regprocedure;
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid = v_page) THEN
    RAISE EXCEPTION 'get_supplier_bills_page must remain SECURITY INVOKER';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = v_summary) THEN
    RAISE EXCEPTION 'get_accounts_payable_summary must remain SECURITY INVOKER';
  END IF;
  IF NOT has_function_privilege('authenticated', v_page, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', v_summary, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must be able to call the CxP read RPCs';
  END IF;
  IF has_function_privilege('anon', v_page, 'EXECUTE')
    OR has_function_privilege('anon', v_summary, 'EXECUTE') THEN
    RAISE EXCEPTION 'anonymous callers must not execute the CxP read RPCs';
  END IF;

  BEGIN
    PERFORM public.get_supplier_bills_page(
      NULL, 'all', NULL, 'all', NULL, 'all', 'all', 0, 101, 'issue_date', true
    );
    RAISE EXCEPTION 'get_supplier_bills_page accepted a page size above 100';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  BEGIN
    PERFORM public.get_supplier_bills_page(
      NULL, 'all', NULL, 'all', '2026-13', 'all', 'all', 0, 25, 'issue_date', true
    );
    RAISE EXCEPTION 'get_supplier_bills_page accepted an invalid month';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
END;
$$;

ROLLBACK;
