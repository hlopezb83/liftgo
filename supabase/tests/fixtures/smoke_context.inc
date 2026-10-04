-- Common prerequisite: migrations must provision an initial organization.
-- Only the caller's transaction is affected; every suite ends with ROLLBACK.
DO $ctx$
DECLARE v_org uuid;
BEGIN
  SELECT id INTO v_org FROM public.organizations
    WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'SETUP: falta la organización inicial'; END IF;
  PERFORM set_config('app.organization_id', v_org::text, true);
END $ctx$;
