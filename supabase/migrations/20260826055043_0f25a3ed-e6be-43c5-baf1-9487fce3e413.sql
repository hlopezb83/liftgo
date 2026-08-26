-- N-27 / N-49: estado de cancelación del REP (complemento de pago) ante el SAT.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS rep_cancellation_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS rep_cancellation_motive text,
  ADD COLUMN IF NOT EXISTS rep_substitution_uuid uuid,
  ADD COLUMN IF NOT EXISTS rep_cancellation_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_rep_cancellation_status_check'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_rep_cancellation_status_check
      CHECK (rep_cancellation_status IN ('none','pending','accepted','rejected','expired'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_rep_cancellation_motive_check'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_rep_cancellation_motive_check
      CHECK (rep_cancellation_motive IS NULL OR rep_cancellation_motive IN ('01','02','03','04'));
  END IF;
END $$;

COMMENT ON COLUMN public.payments.rep_cancellation_status IS
  'N-27/N-49: estado de la cancelación del REP ante el SAT. Sirve de claim atómico (none -> pending) para evitar cancelaciones duplicadas.';
COMMENT ON COLUMN public.payments.rep_substitution_uuid IS
  'N-49: UUID del CFDI que sustituye al REP cancelado (obligatorio para motivo 01).';

-- N-32: un UUID de REP solo puede registrarse en un pago de proveedor.
CREATE UNIQUE INDEX IF NOT EXISTS supplier_payments_rep_cfdi_uuid_key
  ON public.supplier_payments (rep_cfdi_uuid)
  WHERE rep_cfdi_uuid IS NOT NULL;