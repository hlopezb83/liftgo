
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS no_overlapping_bookings;

ALTER TABLE public.bookings
  ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (
    forklift_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'completed'));
