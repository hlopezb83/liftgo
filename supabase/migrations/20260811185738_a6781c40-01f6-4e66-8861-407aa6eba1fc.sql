ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS discount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.supplier_bills
  DROP CONSTRAINT IF EXISTS supplier_bills_discount_non_negative_chk;

ALTER TABLE public.supplier_bills
  ADD CONSTRAINT supplier_bills_discount_non_negative_chk CHECK (discount >= 0);