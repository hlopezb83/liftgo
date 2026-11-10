-- Facturapi 6 · pausa SOLO los dos jobs fiscales durante la ventana.
-- Fail-closed: si no hay exactamente 2 activos, no cambia nada.
DO $$
DECLARE
  v_active integer;
BEGIN
  SELECT count(*) INTO v_active
  FROM cron.job
  WHERE jobname IN ('process-cfdi-retry-queue-5min', 'reconcile-stamping-invoices-5min')
    AND active;
  IF v_active <> 2 THEN
    RAISE EXCEPTION 'fx6: se esperaban 2 jobs fiscales activos y hay %; no se pausa nada', v_active;
  END IF;
  PERFORM cron.alter_job(jobid, active := false)
  FROM cron.job
  WHERE jobname IN ('process-cfdi-retry-queue-5min', 'reconcile-stamping-invoices-5min');
END $$;

SELECT jobname, active
FROM cron.job
WHERE jobname IN ('process-cfdi-retry-queue-5min', 'reconcile-stamping-invoices-5min')
ORDER BY jobname;
