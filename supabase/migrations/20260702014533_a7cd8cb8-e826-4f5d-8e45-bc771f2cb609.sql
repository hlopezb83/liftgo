
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS facturapi_env text
  CHECK (facturapi_env IN ('test','live'));

-- Backfill: asumimos que los CFDI históricos ya timbrados se emitieron en producción.
UPDATE public.invoices
   SET facturapi_env = 'live'
 WHERE facturapi_env IS NULL
   AND cfdi_status IN ('stamped','cancelled');
