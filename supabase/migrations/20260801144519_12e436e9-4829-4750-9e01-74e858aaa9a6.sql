CREATE OR REPLACE FUNCTION public.expire_stale_quotes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  -- R10-DB-01: guard de defensa en profundidad. La función expira cotizaciones
  -- de todos los tenants; sólo el cron/edge (service_role) debe ejecutarla.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'expire_stale_quotes: sólo service_role puede ejecutarla';
  END IF;

  WITH updated AS (
    UPDATE public.quotes
       SET status = 'expired', updated_at = now()
     WHERE status IN ('sent','draft')
       AND valid_until IS NOT NULL
       AND valid_until < public.today_mty()
     RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.expire_stale_quotes()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.expire_stale_quotes() FROM public, anon, authenticated';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.expire_stale_quotes()') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.expire_stale_quotes() TO service_role';
  END IF;
END $lgp_guard$;
