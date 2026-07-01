ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS acuse_pdf_url text,
  ADD COLUMN IF NOT EXISTS acuse_xml_url text;