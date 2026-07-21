-- EC-A1/EC-A2: programación de los crons CFDI con pg_cron + pg_net.
--
-- Hasta ahora process-cfdi-retry-queue y reconcile-stamping-invoices no tenían
-- ningún schedule: existían como edge functions pero nadie las invocaba.
-- Aquí se programan ambas cada 5 minutos vía net.http_post contra el proyecto
-- (mismo patrón idempotente de expire-stale-quotes-daily / purge-old-notifications-daily
-- / mark-overdue-supplier-bills-daily: unschedule previo + cron.schedule).
--
-- Autenticación: las funciones exigen `Authorization: Bearer <CRON_SECRET>`
-- (guarda interna, mismo patrón que generate-recurring-maintenance). El secreto
-- se lee de Supabase Vault (secret con name='cron_secret') o, como fallback, del
-- setting de base de datos `app.settings.cron_secret`. Si no está configurado,
-- la migración AVISA y omite el schedule en vez de fallar (no rompe dev/staging).
--
-- También se añade invoices.stamping_attempts: contador de intentos de
-- reconciliación usado por reconcile-stamping-invoices para rendirse (marcar
-- 'error') tras 10 descargas de XML fallidas.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stamping_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoices.stamping_attempts IS
  'EC-A2: intentos de reconcile-stamping-invoices por descargar el XML de Facturapi. Tras 10 intentos fallidos la factura pasa de stamping a error.';

DO $$
DECLARE
  v_secret text;
  v_url_base constant text := 'https://zxefrzfaynnfwazqhwxp.supabase.co/functions/v1';
  v_jobs constant text[][] := ARRAY[
    ['process-cfdi-retry-queue-5min', 'process-cfdi-retry-queue'],
    ['reconcile-stamping-invoices-5min', 'reconcile-stamping-invoices']
  ];
  v_job text[];
  v_jobid bigint;
  v_command text;
BEGIN
  -- 1. CRON_SECRET desde Supabase Vault (secret name='cron_secret').
  -- vault.decrypted_secrets solo existe si la extensión supabase_vault está
  -- habilitada; to_regclass evita el error de schema/tabla inexistente.
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets
     WHERE name = 'cron_secret'
     LIMIT 1;
  END IF;

  -- 2. Fallback: setting de base de datos.
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    v_secret := current_setting('app.settings.cron_secret', true);
  END IF;

  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE WARNING 'retry_queue_cron: CRON_SECRET no encontrado en vault (name=cron_secret) ni en app.settings.cron_secret; se omiten los cron jobs CFDI. Crea el secreto y re-aplica esta migración.';
    RETURN;
  END IF;

  FOREACH v_job SLICE 1 IN ARRAY v_jobs LOOP
    -- Re-programación idempotente (mismo patrón que expire-stale-quotes-daily).
    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = v_job[1];
    IF v_jobid IS NOT NULL THEN
      PERFORM cron.unschedule(v_jobid);
    END IF;

    v_command := format(
      $cmd$SELECT net.http_post(url := %L, body := '{}'::jsonb, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %L'), timeout_milliseconds := 30000);$cmd$,
      v_url_base || '/' || v_job[2],
      v_secret
    );

    PERFORM cron.schedule(v_job[1], '*/5 * * * *', v_command);
  END LOOP;
END $$;
