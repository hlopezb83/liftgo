DO $control$
DECLARE
  r record;
  n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'save_invoice_with_sources';
  IF n <> 1 THEN RAISE EXCEPTION 'control0127: expected 1 function, found %', n; END IF;

  SELECT p.* INTO r FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'save_invoice_with_sources';

  IF r.oid::regprocedure::text <> 'save_invoice_with_sources(jsonb,uuid[],uuid,integer,uuid,uuid,uuid,integer)' THEN
    RAISE EXCEPTION 'control0127: signature %', r.oid::regprocedure::text; END IF;
  IF r.pronargs <> 8 OR r.pronargdefaults <> 7 THEN
    RAISE EXCEPTION 'control0127: args %/defaults %', r.pronargs, r.pronargdefaults; END IF;
  IF NOT r.proretset OR r.prorettype <> 'public.invoices'::regtype THEN
    RAISE EXCEPTION 'control0127: return type'; END IF;
  IF (SELECT lanname FROM pg_language WHERE oid = r.prolang) <> 'plpgsql' THEN
    RAISE EXCEPTION 'control0127: language'; END IF;
  IF r.provolatile <> 'v' THEN RAISE EXCEPTION 'control0127: volatility %', r.provolatile; END IF;
  IF r.prosecdef THEN RAISE EXCEPTION 'control0127: SECURITY DEFINER'; END IF;
  IF r.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[] THEN
    RAISE EXCEPTION 'control0127: proconfig %', r.proconfig; END IF;
  IF encode(sha256(convert_to(r.prosrc, 'UTF8')), 'hex') <> '3da89a8ad513f4e90613380eb9afc84cc1c1047120f5bee3846531a2e4858c98' THEN
    RAISE EXCEPTION 'control0127: prosrc sha256 %', encode(sha256(convert_to(r.prosrc, 'UTF8')), 'hex'); END IF;

  IF r.proacl IS NULL THEN RAISE EXCEPTION 'control0127: NULL acl implies PUBLIC EXECUTE'; END IF;
  IF EXISTS (SELECT 1 FROM aclexplode(r.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'control0127: PUBLIC has EXECUTE'; END IF;
  IF EXISTS (SELECT 1 FROM aclexplode(r.proacl) a WHERE a.grantee = 'anon'::regrole AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'control0127: anon has EXECUTE in ACL'; END IF;
  IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'control0127: anon effective EXECUTE'; END IF;
  IF NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'control0127: authenticated lacks EXECUTE'; END IF;
  IF NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'control0127: service_role lacks EXECUTE'; END IF;
END
$control$;