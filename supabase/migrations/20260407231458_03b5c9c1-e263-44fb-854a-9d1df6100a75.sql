ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS facturapi_test_key text,
  ADD COLUMN IF NOT EXISTS facturapi_live_key text;