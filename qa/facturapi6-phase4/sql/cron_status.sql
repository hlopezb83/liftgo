-- Facturapi 6 · estado de los dos jobs fiscales. SOLO LECTURA.
-- No selecciona `command`: contiene el secreto de cron.
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('process-cfdi-retry-queue-5min', 'reconcile-stamping-invoices-5min')
ORDER BY jobname;

-- Corridas en curso de esos jobs (deben ser 0 antes de cambiar archivos).
SELECT j.jobname, count(*) AS running
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname IN ('process-cfdi-retry-queue-5min', 'reconcile-stamping-invoices-5min')
  AND d.status = 'running'
GROUP BY j.jobname;
