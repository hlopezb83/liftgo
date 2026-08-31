ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS sat_validation_status text
    NOT NULL DEFAULT 'not_validated',
  ADD COLUMN IF NOT EXISTS sat_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS sat_validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_sat_validation_status_check;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_sat_validation_status_check
  CHECK (sat_validation_status IN ('not_validated', 'valid', 'mismatch', 'error'));

COMMENT ON COLUMN public.customers.sat_validation_status IS
  'Resultado de la última validación contra la CSF del SAT (vía PAC). No consume timbre.';

CREATE INDEX IF NOT EXISTS idx_customers_sat_validation_status
  ON public.customers (sat_validation_status)
  WHERE deleted_at IS NULL;