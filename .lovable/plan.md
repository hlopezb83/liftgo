
# Auto-Schedule Delivery After Booking

When a booking is created, the system will automatically prompt the user to schedule the delivery -- with most fields pre-filled from the booking data.

## How it will work

1. After clicking "Create Booking", a success dialog appears instead of immediately navigating away
2. The dialog says "Booking created! Schedule the delivery?" with two options:
   - **Schedule Delivery** -- opens a pre-filled delivery form right in the dialog
   - **Skip** -- navigates to the calendar as before
3. The delivery form is pre-filled with:
   - Type: "delivery" (locked)
   - Forklift: auto-set from the booking
   - Linked Booking: auto-set
   - Date: set to the booking's start date
   - Address: pulled from the customer's address (if an existing customer was selected)
4. The user only needs to optionally add driver info, time, and notes, then hit "Schedule"
5. After scheduling (or skipping), the user is navigated to the calendar

## Technical Details

### 1. Modify `BookingForm.tsx`

- Add a new state: `postBookingState` that stores the newly created booking ID, forklift ID, start date, and customer address after a successful booking
- Instead of navigating on `onSuccess`, show a confirmation dialog
- Import `useCreateDelivery` from the deliveries hook
- Add a `Dialog` with a compact delivery form that has fields pre-filled:
  - `forklift_id` = the selected forklift
  - `booking_id` = the returned booking ID
  - `scheduled_date` = the booking start date
  - `address` = selected customer's address (if available)
  - `type` = "delivery"
- On delivery submit success, navigate to `/calendar` with a combined success toast
- "Skip" button also navigates to `/calendar`

### 2. No other file changes needed

The `useCreateDelivery` hook and `deliveries` table already exist. No schema changes required. The booking form just gains a post-creation step.
