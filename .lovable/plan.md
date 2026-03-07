

## Double Booking Prevention at Database Level

### Problem
The `create_booking` RPC has no overlap check. Prevention currently relies only on client-side filtering in `useAvailableForklifts.ts`, which is susceptible to race conditions (two users booking the same forklift simultaneously).

### Solution

**Database migration** with two changes:

1. **Enable `btree_gist` extension** (required for exclusion constraints mixing equality + range operators).

2. **Add exclusion constraint** on `bookings` table that prevents overlapping date ranges for the same forklift (only for active bookings):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.bookings
ADD CONSTRAINT no_overlapping_bookings
EXCLUDE USING gist (
  forklift_id WITH =,
  daterange(start_date, end_date, '[]') WITH &&
)
WHERE (status != 'cancelled');
```

3. **Add overlap check inside `create_booking` RPC** before the INSERT, to raise a user-friendly error message instead of a raw constraint violation:

```sql
IF EXISTS (
  SELECT 1 FROM bookings
  WHERE forklift_id = p_forklift_id
    AND status != 'cancelled'
    AND daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
) THEN
  RAISE EXCEPTION 'El montacargas ya tiene una reserva en esas fechas';
END IF;
```

This gives two layers of protection: a friendly check in the RPC, and an unbreakable constraint at the database level.

### Technical Detail
- `daterange(start_date, end_date, '[]')` creates an inclusive range on both ends
- `&&` is the "overlaps" operator for ranges
- The `WHERE` clause excludes cancelled bookings from the constraint
- Existing data must not have conflicts, or the constraint creation will fail

