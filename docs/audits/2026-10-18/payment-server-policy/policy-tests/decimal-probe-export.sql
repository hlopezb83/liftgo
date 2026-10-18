\set ON_ERROR_STOP on
SELECT jsonb_pretty(payload || jsonb_build_object(
  'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'md5',md5(pg_get_functiondef(p.oid))) ORDER BY p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN('fx_convert_amount','enforce_payment_within_invoice_total','sync_invoice_status','guard_invoice_status_integrity'))))
FROM public.decimal_probe_result;
