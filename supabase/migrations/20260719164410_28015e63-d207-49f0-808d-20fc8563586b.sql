
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'expire-stale-quotes-daily';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'expire-stale-quotes-daily',
  '0 7 * * *',
  $$SELECT public.expire_stale_quotes();$$
);
