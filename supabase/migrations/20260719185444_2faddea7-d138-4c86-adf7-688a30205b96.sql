ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS receptor_rfc text,
  ADD COLUMN IF NOT EXISTS tipo_comprobante text;

ALTER TABLE public.supplier_bills
  DROP CONSTRAINT IF EXISTS supplier_bills_tipo_comprobante_check;

ALTER TABLE public.supplier_bills
  ADD CONSTRAINT supplier_bills_tipo_comprobante_check
  CHECK (tipo_comprobante IS NULL OR tipo_comprobante IN ('I','E','N','P','T'));

CREATE INDEX IF NOT EXISTS supplier_bills_receptor_rfc_idx
  ON public.supplier_bills (receptor_rfc);