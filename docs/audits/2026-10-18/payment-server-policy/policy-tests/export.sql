SELECT jsonb_pretty(jsonb_build_object(
 'database',current_database(),'port',inet_server_port(),'version',version(),
 'summary',(SELECT jsonb_build_object('total',count(*),'passed',count(*) FILTER(WHERE passed),'failed',count(*) FILTER(WHERE NOT passed)) FROM policy_expectations),
 'expectations',(SELECT jsonb_agg(to_jsonb(e) ORDER BY name) FROM policy_expectations e),
 'baseline_functions',(SELECT jsonb_agg(to_jsonb(b) ORDER BY name) FROM policy_function_baseline b),
 'installed_functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'md5',md5(pg_get_functiondef(p.oid))) ORDER BY p.oid::regprocedure::text)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(
    'enforce_payment_within_invoice_total','enforce_payment_matches_invoice_currency','sync_invoice_status','guard_invoice_status_integrity',
    'enforce_credit_note_max','fx_convert_amount','fx_is_missing','prevent_payment_mutation_when_rep_stamped','prevent_payment_delete_when_rep_stamped','trg_payment_amount_mxn')),
 'installed_triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'definition',pg_get_triggerdef(oid)) ORDER BY tgrelid::regclass::text,tgname)
   FROM pg_trigger WHERE tgrelid IN('public.payments'::regclass,'public.invoices'::regclass) AND NOT tgisinternal)
));
