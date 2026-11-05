DO $$ DECLARE r record; b record; BEGIN
 SELECT * INTO STRICT b FROM public.historical_acl_baseline;
 IF b.defaults_hash IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(d) ORDER BY oid)::text) FROM pg_default_acl d)
 OR b.witness_table_acl IS DISTINCT FROM (SELECT relacl::text FROM pg_class WHERE oid='public.historical_acl_witness'::regclass)
 OR b.witness_function_acl IS DISTINCT FROM (SELECT proacl::text FROM pg_proc WHERE oid='public.historical_acl_witness_fn()'::regprocedure) THEN
   RAISE EXCEPTION 'Global defaults or pre-existing object ACLs changed';
 END IF;
 IF b.expected_owner IS DISTINCT FROM (SELECT relowner FROM pg_class WHERE oid='public.delivery_historical_reconciliations'::regclass) THEN
   RAISE EXCEPTION 'Table owner changed';
 END IF;
 IF EXISTS(SELECT FROM pg_proc WHERE oid IN ('public.guard_delivery_historical_reconciliation()'::regprocedure,'public.audit_delivery_historical_reconciliation()'::regprocedure) AND proowner<>b.expected_owner) THEN
   RAISE EXCEPTION 'Function owner changed';
 END IF;
 FOR r IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('sandbox_exec','sandbox_exec_zxefrzfaynnfwazqhwxp','historical "quoted role','anon','authenticated','service_role') LOOP
   IF has_table_privilege(r.oid,'public.delivery_historical_reconciliations','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') THEN
     RAISE EXCEPTION 'Unexpected write/maintenance access for %',r.rolname;
   END IF;
   IF has_table_privilege(r.oid,'public.delivery_historical_reconciliations','SELECT') IS DISTINCT FROM (r.rolname='authenticated') THEN
     RAISE EXCEPTION 'Unexpected SELECT access for %',r.rolname;
   END IF;
   IF has_function_privilege(r.oid,'public.guard_delivery_historical_reconciliation()','EXECUTE')
      OR has_function_privilege(r.oid,'public.audit_delivery_historical_reconciliation()','EXECUTE') THEN
     RAISE EXCEPTION 'Unexpected function EXECUTE for %',r.rolname;
   END IF;
 END LOOP;
 IF NOT has_table_privilege(b.expected_owner,'public.delivery_historical_reconciliations','SELECT,INSERT,UPDATE,DELETE') THEN
   RAISE EXCEPTION 'Owner access lost';
 END IF;
END $$;
SET ROLE sandbox_exec;
DO $$ BEGIN
 BEGIN SELECT count(*) FROM public.delivery_historical_reconciliations; RAISE EXCEPTION 'Sandbox read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.delivery_historical_reconciliations SELECT * FROM public.delivery_historical_reconciliations; RAISE EXCEPTION 'Sandbox insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE sandbox_exec_zxefrzfaynnfwazqhwxp;
DO $$ BEGIN
 BEGIN SELECT count(*) FROM public.delivery_historical_reconciliations; RAISE EXCEPTION 'Specific sandbox read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.delivery_historical_reconciliations SELECT * FROM public.delivery_historical_reconciliations; RAISE EXCEPTION 'Specific sandbox insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'Inherited table/function ACLs removed locally; defaults, witness ACLs and owners unchanged' AS result;
