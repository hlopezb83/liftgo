ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS rep_stamping_started_at timestamptz;

COMMENT ON COLUMN public.payments.rep_stamping_started_at IS
  'Hora en que se reclamó el timbrado del REP. Permite recuperar claims atorados (> 5 min en estado stamping).';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;