-- RECOVERY ONLY, NOT EXECUTED. Disables the QA verifier without DROP:
-- removing EXECUTE makes the preflight fail closed (RPC error -> 503/blocked).
-- Apply only as a separately reviewed migration if shutdown is required.
-- Resulting ACL must be exactly owner:EXECUTE (no grant option); else rollback.
REVOKE ALL ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() FROM anon;
REVOKE ALL ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() FROM authenticated;
REVOKE ALL ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() FROM service_role;
DO $acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'sandbox_exec_zxefrzfaynnfwazqhwxp') THEN
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() FROM %I',
      'sandbox_exec_zxefrzfaynnfwazqhwxp');
  END IF;
END
$acl$;
COMMENT ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() IS
  'DEPRECATED: verificador QA temporal Facturapi 6 deshabilitado; sin EXECUTE salvo owner.';
DO $assert$
BEGIN
  IF (SELECT pg_catalog.array_agg(a.grantee::text || ':' || a.privilege_type || ':' || a.is_grantable::text)
        FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
       WHERE p.oid = 'public.qa_fx6_elogistix_test_key_is_exclusive()'::regprocedure)
     IS DISTINCT FROM
     (SELECT ARRAY[p.proowner::text || ':EXECUTE:false'] FROM pg_catalog.pg_proc p
       WHERE p.oid = 'public.qa_fx6_elogistix_test_key_is_exclusive()'::regprocedure) THEN
    RAISE EXCEPTION 'qa_fx6 recuperación: ACL resultante distinta de sólo owner';
  END IF;
END
$assert$;
