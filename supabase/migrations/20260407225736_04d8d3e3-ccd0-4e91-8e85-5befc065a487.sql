
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS facturapi_invoice_id text;

ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS facturapi_mode text DEFAULT 'test';
