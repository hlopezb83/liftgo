ALTER TABLE public.quotes
  ADD COLUMN quote_type text NOT NULL DEFAULT 'rental';

ALTER TABLE public.quotes
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN end_date DROP NOT NULL;