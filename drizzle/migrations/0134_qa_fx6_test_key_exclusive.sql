-- QA Facturapi 6 preflight: boolean-only exclusivity check of the fixed tenant's
-- test key. PREPARED FOR INDEPENDENT REVIEW; NOT APPLIED. Static SELECT only,
-- no parameters, never returns or raises the key, a hash or other IDs.
-- Does not read facturapi_live_key. EXECUTE only for service_role.
-- The schema default ACL (owner postgres, schema public) also grants EXECUTE to
-- the technical role sandbox_exec_zxefrzfaynnfwazqhwxp; it is revoked below
-- ONLY on this function (no global/default-privilege change). A final
-- assertion aborts the whole migration (rollback) unless the resulting ACL is
-- exactly owner:EXECUTE + service_role:EXECUTE, both without grant option.
CREATE OR REPLACE FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT COALESCE((
    SELECT
      (SELECT count(*) FROM public.billing_secrets b
        WHERE b.organization_id = 'fc2c10e3-278b-4899-8aa1-f802752f1c38'::uuid) = 1
      AND (SELECT count(*) FROM public.company_settings c
        WHERE c.organization_id = 'fc2c10e3-278b-4899-8aa1-f802752f1c38'::uuid) = 1
      AND EXISTS (SELECT 1 FROM public.company_settings c
        WHERE c.organization_id = 'fc2c10e3-278b-4899-8aa1-f802752f1c38'::uuid
          AND c.facturapi_mode = 'test')
      AND EXISTS (SELECT 1 FROM public.billing_secrets b
        WHERE b.organization_id = 'fc2c10e3-278b-4899-8aa1-f802752f1c38'::uuid
          AND b.facturapi_test_key IS NOT NULL
          AND left(b.facturapi_test_key, 8) = 'sk_test_'
          AND length(b.facturapi_test_key) > 8)
      AND NOT EXISTS (SELECT 1 FROM public.billing_secrets own
        JOIN public.billing_secrets other
          ON other.facturapi_test_key = own.facturapi_test_key
         AND other.organization_id IS DISTINCT FROM own.organization_id
        WHERE own.organization_id = 'fc2c10e3-278b-4899-8aa1-f802752f1c38'::uuid)
  ), false);
$function$;

COMMENT ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() IS
  'QA temporal Facturapi 6: true sólo si el tenant fijo tiene una única llave test, modo test y ninguna otra organización comparte la llave. Devuelve sólo booleano.';

REVOKE ALL ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() FROM anon;
REVOKE ALL ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() TO service_role;

DO $acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'sandbox_exec_zxefrzfaynnfwazqhwxp') THEN
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() FROM %I',
      'sandbox_exec_zxefrzfaynnfwazqhwxp');
  END IF;
END
$acl$;

DO $assert$
DECLARE
  v_owner oid;
  v_ok boolean;
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc p
   WHERE p.oid = 'public.qa_fx6_elogistix_test_key_is_exclusive()'::regprocedure;
  SELECT
    (SELECT pg_catalog.array_agg(x ORDER BY x) FROM (
       SELECT a.grantee::text || ':' || a.privilege_type || ':' || a.is_grantable::text AS x
         FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
        WHERE p.oid = 'public.qa_fx6_elogistix_test_key_is_exclusive()'::regprocedure) s)
    IS NOT DISTINCT FROM
    (SELECT pg_catalog.array_agg(x ORDER BY x) FROM (VALUES
       (v_owner::text || ':EXECUTE:false'),
       ((SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')::text || ':EXECUTE:false')) v(x))
  INTO v_ok;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'qa_fx6 ACL inesperada: se esperaba sólo owner y service_role con EXECUTE sin grant option';
  END IF;
END
$assert$;
