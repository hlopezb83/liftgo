-- PERF-002: composite index for payment history lookups by invoice + date
CREATE INDEX IF NOT EXISTS idx_payments_invoice_date
  ON public.payments (invoice_id, payment_date DESC);

-- Bonus: cubrir el trigger sync_invoice_status_from_payments (SUM/MAX por invoice_id)
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id
  ON public.payments (invoice_id);