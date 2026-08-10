ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS rep_lookup_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payments.rep_lookup_attempts IS
  'Misses consecutivos del lookup por external_id en reconcile-stamping-invoices. Se resetea al recuperar/reconciliar el REP; a los 5 se revierte a error.';

ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS lookup_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.credit_notes.lookup_attempts IS
  'Misses consecutivos del lookup por external_id en reconcile-stamping-invoices. Se resetea al recuperar/reconciliar la NC; a los 5 se revierte a error.';