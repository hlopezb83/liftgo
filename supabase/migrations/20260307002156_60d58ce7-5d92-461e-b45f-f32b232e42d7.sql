
-- Enable btree_gist extension for exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Add exclusion constraint to prevent overlapping bookings for the same forklift
ALTER TABLE public.bookings
ADD CONSTRAINT no_overlapping_bookings
EXCLUDE USING gist (
  forklift_id WITH =,
  daterange(start_date, end_date, '[]') WITH &&
)
WHERE (status != 'cancelled');
