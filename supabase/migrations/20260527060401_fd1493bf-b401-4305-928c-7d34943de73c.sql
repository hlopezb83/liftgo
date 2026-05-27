-- Pre-RC hardening: revoke EXECUTE from anon/PUBLIC on all SECURITY DEFINER
-- functions in the public schema. Authenticated users keep access; each
-- function still enforces in-function has_role() checks as defense in depth.
-- This clears Supabase linter 0028 (anon_security_definer_function_executable).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname NOT LIKE 'gbt\_%' ESCAPE '\'  -- skip btree_gist C functions
      AND p.proname NOT IN ('gbtreekey_var_in','gbtreekey_var_out','gbtreekey2_in','gbtreekey2_out','gbtreekey4_in','gbtreekey4_out','gbtreekey8_in','gbtreekey8_out','gbtreekey16_in','gbtreekey16_out','gbtreekey32_in','gbtreekey32_out')
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.sig);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping %: %', r.sig, SQLERRM;
    END;
  END LOOP;
END $$;