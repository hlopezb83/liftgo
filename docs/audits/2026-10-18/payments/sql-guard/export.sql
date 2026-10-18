SELECT jsonb_pretty(jsonb_build_object(
  'server_version', version(), 'database', current_database(), 'port', inet_server_port(),
  'assertions', (SELECT jsonb_agg(to_jsonb(a) ORDER BY case_id) FROM fixture_attempts a),
  'observations', (SELECT jsonb_object_agg(case_id, observation) FROM fixture_observations),
  'local_guard_definition', pg_get_functiondef('public.enforce_payment_within_invoice_total()'::regprocedure),
  'local_rep_guard_definition', pg_get_functiondef('public.prevent_payment_mutation_when_rep_stamped()'::regprocedure),
  'installed_triggers', (SELECT jsonb_agg(jsonb_build_object('name',tgname,'definition',pg_get_triggerdef(oid)) ORDER BY tgname)
    FROM pg_trigger WHERE tgrelid='public.payments'::regclass AND NOT tgisinternal)
));
