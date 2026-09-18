-- BLOQUE 1.2: unifica el nombre del secreto de cron y reagenda usando
-- internal_get_cron_secret() como única fuente de verdad.

CREATE OR REPLACE FUNCTION public.internal_get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name IN ('CRON_SECRET', 'cron_secret')
  ORDER BY (name = 'CRON_SECRET') DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.internal_get_cron_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_get_cron_secret() FROM anon;
REVOKE ALL ON FUNCTION public.internal_get_cron_secret() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_get_cron_secret() TO service_role;

COMMENT ON FUNCTION public.internal_get_cron_secret() IS
  'BLOQUE 1.2: expone vault.CRON_SECRET (canónico) a service_role. Acepta también el alias legacy cron_secret.';

DO $$
DECLARE
  v_secret text;
  v_url_base constant text := 'https://zxefrzfaynnfwazqhwxp.supabase.co/functions/v1';
  v_jobs constant text[][] := ARRAY[
    ['process-cfdi-retry-queue-5min', 'process-cfdi-retry-queue', '*/5 * * * *'],
    ['reconcile-stamping-invoices-5min', 'reconcile-stamping-invoices', '*/5 * * * *']
  ];
  v_job text[];
  v_jobid bigint;
  v_command text;
BEGIN
  SELECT public.internal_get_cron_secret() INTO v_secret;
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE WARNING 'BLOQUE 1.2: CRON_SECRET no encontrado en vault; se omite reagendado.';
    RETURN;
  END IF;

  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'reconcile-stamping-invoices-every-15min',
      'reconcile-stamping-invoices-every-10min',
      'process-cfdi-retry-queue-5min',
      'reconcile-stamping-invoices-5min'
    )
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  FOREACH v_job SLICE 1 IN ARRAY v_jobs LOOP
    v_command := format(
      $cmd$SELECT net.http_post(url := %L, body := '{}'::jsonb, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.internal_get_cron_secret()), timeout_milliseconds := 30000);$cmd$,
      v_url_base || '/' || v_job[2]
    );
    PERFORM cron.schedule(v_job[1], v_job[3], v_command);
  END LOOP;
END $$;