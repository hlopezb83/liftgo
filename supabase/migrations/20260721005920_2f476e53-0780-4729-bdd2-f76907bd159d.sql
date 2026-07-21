
-- 1. Columnas de auditoría de timbrado
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stamping_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stamp_variance_checked_at timestamptz;

ALTER TABLE public.invoices
  ALTER COLUMN stamp_variance TYPE numeric(12,4) USING stamp_variance::numeric(12,4);

-- 2. Reprogramar cron reconcile de 15 → 10 minutos (compromiso: menos carga a
--    Facturapi que 5 min, más rápido que 15). Reemplazamos el jobname para
--    reflejar la cadencia real.
DO $$
DECLARE
  old_jobid bigint;
BEGIN
  SELECT jobid INTO old_jobid FROM cron.job WHERE jobname = 'reconcile-stamping-invoices-every-15min';
  IF old_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(old_jobid);
  END IF;
  -- Si ya existe con el nuevo nombre (re-ejecución), no duplicar.
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-stamping-invoices-every-10min') THEN
    -- Nota: el body del http_post se agenda en migración separada
    -- (contiene project ref + service key). Aquí sólo liberamos el schedule
    -- anterior; la re-agendación se hace vía supabase--insert.
    NULL;
  END IF;
END $$;
