-- ONLY for the empty disposable local database created by the focused runner.
-- Model the observed hosted defaults, plus PUBLIC and a quoted grantee.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='sandbox_exec') THEN CREATE ROLE sandbox_exec NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='sandbox_exec_zxefrzfaynnfwazqhwxp') THEN CREATE ROLE sandbox_exec_zxefrzfaynnfwazqhwxp NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='historical "quoted role') THEN CREATE ROLE "historical ""quoted role" NOLOGIN; END IF;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO sandbox_exec, sandbox_exec_zxefrzfaynnfwazqhwxp;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO "historical ""quoted role" WITH GRANT OPTION;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role, sandbox_exec_zxefrzfaynnfwazqhwxp;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "historical ""quoted role" WITH GRANT OPTION;
CREATE TABLE public.historical_acl_witness(id integer PRIMARY KEY);
CREATE FUNCTION public.historical_acl_witness_fn() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
CREATE TABLE public.historical_acl_baseline AS SELECT
 (SELECT md5(jsonb_agg(to_jsonb(d) ORDER BY oid)::text) FROM pg_default_acl d) AS defaults_hash,
 (SELECT relacl::text FROM pg_class WHERE oid='public.historical_acl_witness'::regclass) AS witness_table_acl,
 (SELECT proacl::text FROM pg_proc WHERE oid='public.historical_acl_witness_fn()'::regprocedure) AS witness_function_acl,
 (SELECT relowner FROM pg_class WHERE oid='public.historical_acl_witness'::regclass) AS expected_owner;
