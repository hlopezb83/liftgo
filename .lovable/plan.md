
# Filter Booking Dropdown to Active Bookings Only

## What changes

In the "New Invoice" form, the "Generate from Booking" dropdown currently shows all bookings including cancelled ones. It will be updated to only show bookings with a `confirmed` status.

## Technical Details

### Modify `src/pages/InvoiceForm.tsx`

In the booking dropdown (`SelectContent`), filter the `bookings` array to only include items where `b.status === "confirmed"` before mapping them to `SelectItem` elements. This is a one-line filter addition -- no other files need to change.
