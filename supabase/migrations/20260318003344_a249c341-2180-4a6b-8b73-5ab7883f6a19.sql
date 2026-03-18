
-- Add booking_number column
ALTER TABLE public.bookings ADD COLUMN booking_number text UNIQUE;

-- Backfill existing bookings with sequential numbers
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.bookings
)
UPDATE public.bookings b
SET booking_number = 'RSV-' || LPAD(n.rn::text, 4, '0')
FROM numbered n
WHERE b.id = n.id;

-- Make it NOT NULL after backfill
ALTER TABLE public.bookings ALTER COLUMN booking_number SET NOT NULL;

-- Create the next_booking_number function (same pattern as next_quote_number etc.)
CREATE OR REPLACE FUNCTION public.next_booking_number()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT 'RSV-' || LPAD(
    (COALESCE(
      (SELECT MAX(NULLIF(regexp_replace(booking_number, '[^0-9]', '', 'g'), '')::int)
       FROM public.bookings),
      0
    ) + 1)::text,
    4, '0'
  );
$$;
