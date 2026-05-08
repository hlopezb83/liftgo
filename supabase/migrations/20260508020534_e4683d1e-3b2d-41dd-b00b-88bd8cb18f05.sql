ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cfdi_xml_url text,
  ADD COLUMN IF NOT EXISTS cfdi_pdf_url text,
  ADD COLUMN IF NOT EXISTS cfdi_error_message text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS razon_social text;