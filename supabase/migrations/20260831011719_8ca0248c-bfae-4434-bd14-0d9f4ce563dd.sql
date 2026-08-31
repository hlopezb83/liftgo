-- A1-B3 (residual): reconciliación de varianza en notas de crédito, espejo de
-- `invoices.stamp_variance` / `stamp_variance_checked_at` (BL-A5).
ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS stamp_variance numeric,
  ADD COLUMN IF NOT EXISTS stamp_variance_checked_at timestamptz;

COMMENT ON COLUMN public.credit_notes.stamp_variance IS
  'A1-B3: diferencia (total timbrado - credit_notes.total) detectada al timbrar el CFDI de egreso.';