-- ============================================================================
-- BL-A5 (prometido en v7.114.0, ahora real): reconciliación del total
-- timbrado. stamp-cfdi compara el total devuelto por Facturapi contra
-- invoices.total tras un timbrado exitoso; estas columnas registran la
-- varianza detectada SIN romper el flujo 'stamped'.
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stamp_variance numeric;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stamp_variance_checked_at timestamptz;

COMMENT ON COLUMN public.invoices.stamp_variance IS
  'BL-A5: varianza (total timbrado Facturapi - total local) detectada al timbrar. NULL hasta la primera verificación.';

COMMENT ON COLUMN public.invoices.stamp_variance_checked_at IS
  'BL-A5: momento en que se comparó el total timbrado contra invoices.total.';
