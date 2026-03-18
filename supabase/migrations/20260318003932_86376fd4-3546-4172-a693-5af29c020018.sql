
-- Add delivery_number column
ALTER TABLE public.deliveries ADD COLUMN delivery_number text UNIQUE;

-- Backfill existing deliveries
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY scheduled_date, created_at) AS rn
  FROM public.deliveries
)
UPDATE public.deliveries d
SET delivery_number = 'ENT-' || LPAD(n.rn::text, 4, '0')
FROM numbered n
WHERE d.id = n.id;

-- Make NOT NULL
ALTER TABLE public.deliveries ALTER COLUMN delivery_number SET NOT NULL;

-- Function to get next delivery number
CREATE OR REPLACE FUNCTION public.next_delivery_number()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT 'ENT-' || LPAD(
    (COALESCE(
      (SELECT MAX(NULLIF(regexp_replace(delivery_number, '[^0-9]', '', 'g'), '')::int)
       FROM public.deliveries),
      0
    ) + 1)::text,
    4, '0'
  );
$$;

-- Trigger to auto-assign delivery_number on insert
CREATE OR REPLACE FUNCTION public.set_delivery_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.delivery_number IS NULL THEN
    NEW.delivery_number := next_delivery_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_delivery_number
  BEFORE INSERT ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_delivery_number();

-- Add inspection_number column
ALTER TABLE public.return_inspections ADD COLUMN inspection_number text UNIQUE;

-- Backfill existing inspections
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY inspected_at, created_at) AS rn
  FROM public.return_inspections
)
UPDATE public.return_inspections r
SET inspection_number = 'DEV-' || LPAD(n.rn::text, 4, '0')
FROM numbered n
WHERE r.id = n.id;

-- Make NOT NULL
ALTER TABLE public.return_inspections ALTER COLUMN inspection_number SET NOT NULL;

-- Function to get next inspection number
CREATE OR REPLACE FUNCTION public.next_inspection_number()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT 'DEV-' || LPAD(
    (COALESCE(
      (SELECT MAX(NULLIF(regexp_replace(inspection_number, '[^0-9]', '', 'g'), '')::int)
       FROM public.return_inspections),
      0
    ) + 1)::text,
    4, '0'
  );
$$;

-- Trigger to auto-assign inspection_number on insert
CREATE OR REPLACE FUNCTION public.set_inspection_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.inspection_number IS NULL THEN
    NEW.inspection_number := next_inspection_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_inspection_number
  BEFORE INSERT ON public.return_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inspection_number();
