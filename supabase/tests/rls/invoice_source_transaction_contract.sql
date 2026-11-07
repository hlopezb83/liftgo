-- Schema-replay gate for the additive RPC. Behavioral rollback coverage lives
-- in scripts/tests/invoice-source-transaction.test.mjs (memory-only fixture).
BEGIN;
DO $contract$
DECLARE v_oid oid; v_function record; v_error text;
BEGIN
  v_oid := to_regprocedure('public.save_invoice_with_sources(jsonb,uuid[],uuid,integer,uuid,uuid,uuid,integer)');
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Missing save_invoice_with_sources RPC'; END IF;
  SELECT * INTO v_function FROM pg_proc WHERE oid=v_oid;
  IF v_function.prosecdef OR NOT v_function.proretset
     OR v_function.prorettype <> 'public.invoices'::regtype
     OR v_function.pronargdefaults <> 7
     OR v_function.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp'] THEN
    RAISE EXCEPTION 'Invoice source RPC must preserve INVOKER, row contract, defaults and search_path';
  END IF;
  IF has_function_privilege('anon',v_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected invoice source RPC ACL';
  END IF;
  IF EXISTS (SELECT 1 FROM aclexplode(v_function.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC must not execute the invoice source RPC';
  END IF;
  IF to_regprocedure('public.save_invoice_with_bookings(jsonb,uuid[],uuid,integer)') IS NULL
     OR to_regprocedure('public.save_invoice_with_bookings(jsonb,uuid[],uuid,integer,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Existing invoice save signatures must remain available';
  END IF;

  -- Invalid envelopes fail before touching data, on the fully migrated schema.
  BEGIN
    PERFORM public.save_invoice_with_sources('[]'::jsonb);
    RAISE EXCEPTION 'Array payload was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error NOT LIKE '%deben ser un objeto%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_invoice_with_sources(
      p_invoice=>'{}'::jsonb, p_invoice_id=>'12700000-0000-4000-8000-000000000001',
      p_extension_id=>'12700000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Source effects were accepted on an edit';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error NOT LIKE '%sólo pueden ligarse%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_invoice_with_sources(
      p_invoice=>'{"quote_id":"12700000-0000-4000-8000-000000000003"}'::jsonb,
      p_accept_quote_id=>'12700000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Quote source without a version was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error NOT LIKE '%versión válida%' THEN RAISE; END IF;
  END;
END;
$contract$;
ROLLBACK;
