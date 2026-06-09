-- Normalize RFCs and enforce uniqueness (case/whitespace insensitive)
UPDATE public.suppliers
SET rfc = upper(trim(rfc))
WHERE rfc IS NOT NULL AND rfc <> upper(trim(rfc));

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_rfc_unique_idx
  ON public.suppliers (upper(trim(rfc)))
  WHERE rfc IS NOT NULL AND trim(rfc) <> '';