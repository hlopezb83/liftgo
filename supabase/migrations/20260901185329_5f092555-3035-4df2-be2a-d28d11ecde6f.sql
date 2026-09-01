-- POLÍTICA: la facturación recurrente deja de generarse automáticamente.
-- El operador decide cómo agrupar reservas en cada factura, así que el
-- borrador se crea SOLO desde el asistente manual de Facturas.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'generate-recurring-invoices-daily',
      'generate-recurring-invoices-monthly'
    )
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;