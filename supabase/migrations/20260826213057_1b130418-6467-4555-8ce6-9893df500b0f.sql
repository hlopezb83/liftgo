-- R4-14: la antigüedad de una cancelación en 'pending' (reset stale de 72 h
-- en refresh-cancellation-status) se medía con `updated_at`, un proxy que
-- cualquier UPDATE reinicia (p. ej. el claim de reconcile-stamping-invoices
-- toca invoices.updated_at en cada corrida). Columna dedicada fijada en el
-- claim de cancelación; el refresh cae a updated_at solo si es NULL.
alter table public.invoices
  add column if not exists cancellation_requested_at timestamptz;
alter table public.credit_notes
  add column if not exists cancellation_requested_at timestamptz;
alter table public.payments
  add column if not exists rep_cancellation_requested_at timestamptz;

comment on column public.invoices.cancellation_requested_at is
  'Timestamp de la solicitud de cancelación al SAT (claim). Base del reset stale de 72 h.';
comment on column public.credit_notes.cancellation_requested_at is
  'Timestamp de la solicitud de cancelación al SAT (claim). Base del reset stale de 72 h.';
comment on column public.payments.rep_cancellation_requested_at is
  'Timestamp de la solicitud de cancelación del REP al SAT (claim). Base del reset stale de 72 h.';