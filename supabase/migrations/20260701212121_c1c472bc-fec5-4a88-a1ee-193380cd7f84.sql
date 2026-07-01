ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS global_periodicity text,
  ADD COLUMN IF NOT EXISTS global_months text,
  ADD COLUMN IF NOT EXISTS global_year int;

COMMENT ON COLUMN public.invoices.global_periodicity IS 'CFDI 4.0 Información Global: 01 Diaria, 02 Semanal, 03 Quincenal, 04 Mensual, 05 Bimestral. Requerido cuando receptor_rfc = XAXX010101000.';
COMMENT ON COLUMN public.invoices.global_months IS 'CFDI 4.0 Información Global: mes 01-12 (mensual) o 13-18 (bimestral).';
COMMENT ON COLUMN public.invoices.global_year IS 'CFDI 4.0 Información Global: año del periodo consolidado.';