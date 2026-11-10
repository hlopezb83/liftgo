-- Facturapi 6 · reanuda los dos jobs fiscales al cerrar la ventana
-- (también si hubo reversa). Fail-closed: exige exactamente 2 pausados.
DO $$
DECLARE
  v_paused integer;
BEGIN
  SELECT count(*) INTO v_paused
  FROM cron.job
  WHERE jobname IN ('process-cfdi-retry-queue-5min', 'reconcile-stamping-invoices-5min')
    AND NOT active;
  IF v_paused <> 2 THEN
    RAISE EXCEPTION 'fx6: se esperaban 2 jobs fiscales pausados y hay %; revisar a mano', v_paused;
  END IF;
  PERFORM cron.alter_job(jobid, active := true)
  FROM cron.job
  WHERE jobname IN ('process-cfdi-retry-queue-5min', 'reconcile-stamping-invoices-5min');
END $$;

SELECT jobname, active
FROM cron.job
WHERE jobname IN ('process-cfdi-retry-queue-5min', 'reconcile-stamping-invoices-5min')
ORDER BY jobname;
