
# Fix: Reset Forklift Status on Booking Cancellation

## The Problem

When you cancel a booking, the code only updates the booking's status to "cancelled" but never changes the forklift back to "available". The `create_booking` database function correctly sets the forklift to "rented" on creation, but there is no equivalent logic for cancellation.

## The Fix

Create a new database function `cancel_booking` that atomically:
1. Sets the booking status to "cancelled"
2. Checks if the forklift has any other active (confirmed) bookings
3. If no other active bookings exist, sets the forklift back to "available"
4. Logs the status change in the status_logs table

Then update the cancel button in the UI to call this new function instead of doing a simple update.

## Technical Details

### 1. New database migration -- `cancel_booking` RPC function

```sql
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_forklift_id uuid;
  v_old_status text;
  v_other_active int;
BEGIN
  -- Get forklift from booking
  SELECT forklift_id INTO v_forklift_id
  FROM bookings WHERE id = p_booking_id;

  -- Cancel the booking
  UPDATE bookings SET status = 'cancelled', updated_at = now()
  WHERE id = p_booking_id;

  -- Check if forklift has other active bookings
  SELECT count(*) INTO v_other_active
  FROM bookings
  WHERE forklift_id = v_forklift_id
    AND id != p_booking_id
    AND status = 'confirmed';

  -- If no other active bookings, set forklift back to available
  IF v_other_active = 0 THEN
    SELECT status INTO v_old_status FROM forklifts WHERE id = v_forklift_id;
    UPDATE forklifts SET status = 'available', updated_at = now()
    WHERE id = v_forklift_id;
    INSERT INTO status_logs (forklift_id, from_status, to_status, note)
    VALUES (v_forklift_id, v_old_status, 'available', 'Booking cancelled');
  END IF;
END;
$$;
```

### 2. Update `BookingActions.tsx`

Replace the `handleCancel` function to call `supabase.rpc('cancel_booking', { p_booking_id: booking.id })` instead of the simple `updateBooking.mutate`. Invalidate both `bookings` and `forklifts` query caches on success.

### 3. Fix existing data

Run a data update to set the 6 forklifts that are currently stuck as "rented" (with all bookings cancelled) back to "available".

### Files affected
- **New migration**: `cancel_booking` function
- **Modified**: `src/components/BookingActions.tsx` -- new cancel handler using the RPC
- **Data fix**: one-time update to correct current forklift statuses
