-- Cancellation status tracking on invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cancellation_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cancellation_motive text,
  ADD COLUMN IF NOT EXISTS substitution_uuid uuid;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_cancellation_status_check
  CHECK (cancellation_status IN ('none','pending','accepted','rejected','expired'));

-- Payment Complement (REP) tracking on payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS prior_balance numeric,
  ADD COLUMN IF NOT EXISTS payment_form_sat text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rep_facturapi_id text,
  ADD COLUMN IF NOT EXISTS rep_cfdi_uuid uuid,
  ADD COLUMN IF NOT EXISTS rep_cfdi_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS rep_xml_url text,
  ADD COLUMN IF NOT EXISTS rep_pdf_url text,
  ADD COLUMN IF NOT EXISTS rep_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS rep_error_message text;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_rep_cfdi_status_check
  CHECK (rep_cfdi_status IN ('none','pending','stamped','cancelled','error'));

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_rep_status ON public.payments(rep_cfdi_status);