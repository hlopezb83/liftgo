ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS cash_initial_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_safety_buffer numeric NOT NULL DEFAULT 0;