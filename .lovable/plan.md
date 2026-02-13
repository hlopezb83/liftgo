
# Fix: Forklift status not updating when booked

## Problem
When a booking is created, the forklift's status stays "available" because the booking process never updates it. There are two issues:

1. **The `useCreateBooking` mutation only inserts a booking row** -- it never changes the forklift status to "rented"
2. **The forklift dropdown in the booking form shows both "available" and "rented" forklifts**, which is confusing

## Solution

### 1. Update `useCreateBooking` hook (`src/hooks/useForkliftData.ts`)
After inserting a booking, automatically:
- Update the forklift's status to "rented"
- Log the status change in `status_logs`

### 2. Fix the forklift filter in `BookingForm.tsx`
- Only show forklifts with status "available" in the dropdown (not "rented")
- This prevents double-booking

### 3. Fix existing data
- Run a one-time update to set FL-001's status to "rented" since it already has an active booking

## Technical details

### Files modified
- **`src/hooks/useForkliftData.ts`** -- In `useCreateBooking`, after inserting the booking, call `supabase.from("forklifts").update({ status: "rented" })` and insert a status log entry
- **`src/pages/BookingForm.tsx`** -- Change line 48 filter from `f.status === "available" || f.status === "rented"` to `f.status === "available"` only

### Database fix
- Update FL-001's status to "rented" to reflect its current booking
