
-- Revoke EXECUTE from anon for SECURITY DEFINER functions in public schema.
-- Keep get_public_branding callable by anon (used on public login pages).
-- Triggers don't need EXECUTE grants at all; revoking is harmless.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname <> 'get_public_branding'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;
