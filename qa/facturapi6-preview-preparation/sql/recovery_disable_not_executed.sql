-- RECOVERY ONLY, NOT EXECUTED. Disables the QA verifier without DROP:
-- removing EXECUTE makes the preflight fail closed (RPC error -> 503/blocked).
-- Apply only as a separately reviewed migration if shutdown is required.
REVOKE ALL ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() FROM service_role;
COMMENT ON FUNCTION public.qa_fx6_elogistix_test_key_is_exclusive() IS
  'DEPRECATED: verificador QA temporal Facturapi 6 deshabilitado; sin EXECUTE para ningún rol.';
