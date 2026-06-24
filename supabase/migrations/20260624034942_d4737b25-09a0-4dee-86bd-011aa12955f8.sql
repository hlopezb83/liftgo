ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS cfdi_xml_url text;