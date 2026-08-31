-- FIX 401-CRON: unifica el secreto de las tareas programadas y limpia jobs rotos.

-- 1. Garantizar que el Vault tenga CRON_SECRET (se genera si falta).
DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name IN ('CRON_SECRET', 'cron_secret')
  ORDER BY (name = 'CRON_SECRET') DESC
  LIMIT 1;

  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'CRON_SECRET',
      'Secreto compartido para autenticar las tareas programadas (pg_cron -> edge functions).'
    );
  END IF;
END $$;

-- 2. Retirar jobs rotos / duplicados.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'scan-overdue-invoices-daily',
      'generate-recurring-maintenance-monthly'
    )
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

-- 3. Reagendar las tareas HTTP firmando con el secreto del Vault.
DO $$
DECLARE
  v_secret text;
  v_url_base constant text := 'https://zxefrzfaynnfwazqhwxp.supabase.co/functions/v1';
  v_jobs constant text[][] := ARRAY[
    ['process-cfdi-retry-queue-5min', 'process-cfdi-retry-queue', '*/5 * * * *', '30000'],
    ['reconcile-stamping-invoices-5min', 'reconcile-stamping-invoices', '*/5 * * * *', '30000'],
    ['generate-recurring-invoices-daily', 'generate-recurring-invoices', '15 6 * * *', '60000'],
    ['generate-recurring-maintenance-daily', 'generate-recurring-maintenance', '30 6 * * *', '60000']
  ];
  v_job text[];
  v_jobid bigint;
  v_command text;
BEGIN
  SELECT public.internal_get_cron_secret() INTO v_secret;

  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE WARNING 'FIX 401-CRON: CRON_SECRET no disponible; se omite el reagendado.';
    RETURN;
  END IF;

  FOREACH v_job SLICE 1 IN ARRAY v_jobs LOOP
    FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname = v_job[1] LOOP
      PERFORM cron.unschedule(v_jobid);
    END LOOP;

    v_command := format(
      $cmd$SELECT net.http_post(url := %L, body := '{}'::jsonb, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.internal_get_cron_secret(), 'Authorization', 'Bearer ' || public.internal_get_cron_secret()), timeout_milliseconds := %s);$cmd$,
      v_url_base || '/' || v_job[2],
      v_job[4]
    );

    PERFORM cron.schedule(v_job[1], v_job[3], v_command);
  END LOOP;
END $$;