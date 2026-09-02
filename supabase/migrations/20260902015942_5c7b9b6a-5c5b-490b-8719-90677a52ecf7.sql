-- F2-1 (FIX-1): una factura cancelada no debe bloquear la re-emisión del mismo periodo.
DROP INDEX IF EXISTS public.uniq_invoices_recurring_period;

CREATE UNIQUE INDEX uniq_invoices_recurring_period
  ON public.invoices (booking_id, billing_period_start, billing_period_end)
  WHERE booking_id IS NOT NULL
    AND billing_period_start IS NOT NULL
    AND billing_period_end IS NOT NULL
    AND status <> 'cancelled'
    AND COALESCE(cancellation_status, '') <> 'accepted';