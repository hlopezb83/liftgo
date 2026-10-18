INSERT INTO public.policy_function_baseline(name,definition,md5)
SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),md5(pg_get_functiondef(p.oid))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN('enforce_payment_within_invoice_total','enforce_payment_matches_invoice_currency',
 'sync_invoice_status','guard_invoice_status_integrity','enforce_credit_note_max','fx_convert_amount','fx_is_missing',
 'prevent_payment_mutation_when_rep_stamped','prevent_payment_delete_when_rep_stamped','trg_payment_amount_mxn');
