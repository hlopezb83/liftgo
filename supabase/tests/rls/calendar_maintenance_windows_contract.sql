-- This SECURITY DEFINER RPC is safe only while it scopes every branch to the
-- verified organization and returns generic labels to calendar-only roles.
BEGIN;

DO $check$
DECLARE
  v_function oid := 'public.get_calendar_maintenance_windows(date, date, boolean)'::regprocedure;
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid = v_function) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Calendar maintenance RPC must explicitly scope its definer reads';
  END IF;
  IF position('ml.organization_id = v_org' IN pg_get_functiondef(v_function)) = 0
    OR position('f.organization_id = v_org' IN pg_get_functiondef(v_function)) = 0 THEN
    RAISE EXCEPTION 'Calendar maintenance RPC is missing tenant scope';
  END IF;
  IF NOT has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Calendar maintenance RPC must be available to authenticated users';
  END IF;
  IF has_function_privilege('anon', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Calendar maintenance RPC must reject anon';
  END IF;
END;
$check$;

ROLLBACK;
