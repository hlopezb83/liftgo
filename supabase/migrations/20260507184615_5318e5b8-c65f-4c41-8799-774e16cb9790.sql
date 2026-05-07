-- Columnas para periodo de facturación recurrente + índice único parcial de idempotencia
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS billing_period_start date,
  ADD COLUMN IF NOT EXISTS billing_period_end date;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_recurring_period
  ON public.invoices (booking_id, billing_period_start, billing_period_end)
  WHERE booking_id IS NOT NULL
    AND billing_period_start IS NOT NULL
    AND billing_period_end IS NOT NULL;