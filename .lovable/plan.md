

# Recommended New Functionality: Workflow Chaining

After reviewing the entire ERP, here are the highest-impact improvements, ranked by how much they streamline the day-to-day business flow. Each one connects an action to its natural next step.

---

## 1. Return Inspection -> Auto-Generate Final Invoice

**Current gap**: After completing a return inspection, the user has to manually navigate to Invoices, create a new invoice, and re-enter all the booking details. There is no link between the two.

**Proposed flow**: When a return inspection is submitted, a dialog appears asking "Generate final invoice for this rental?" -- pre-filled with the booking's forklift, dates, customer, and calculated rental charges plus any damage costs recorded during inspection. One click creates the invoice and navigates to its detail page.

This is the single biggest time-saver because every rental ends with an inspection AND an invoice.

---

## 2. Delivery Completed -> Prompt Return Pickup Scheduling

**Current gap**: When a delivery is marked "complete", nothing happens. The user must remember to schedule the return pickup later.

**Proposed flow**: When a delivery of type "delivery" is marked complete, a prompt appears: "Schedule return pickup?" Pre-filled with the same forklift, booking, address, and driver -- with the date defaulting to the booking's end date. One click schedules the pickup.

---

## 3. Quote Accepted -> Full Booking + Delivery Flow (not just calendar redirect)

**Current gap**: The "Convert to Booking" button on a quote creates the booking but then redirects to the calendar. It skips the delivery scheduling dialog that the normal booking form offers.

**Proposed fix**: After converting a quote to a booking, show the same post-booking delivery dialog that BookingForm uses, so the user can schedule transport in the same action.

---

## 4. Invoice Marked Paid -> Close Booking (End-of-Lifecycle)

**Current gap**: When the final invoice for a booking is marked "paid", the booking still shows as "confirmed" forever. There is no concept of a completed booking.

**Proposed flow**: When an invoice linked to a booking is marked "paid", automatically update the booking status to "completed". This closes the lifecycle loop and keeps the active bookings list clean.

---

## 5. Maintenance Completed -> Prompt to Return Forklift to Available

**Current gap**: Logging a maintenance service does not change the forklift's status. If a forklift was set to "maintenance", the user must manually go to Fleet and edit it back to "available".

**Proposed flow**: After submitting a maintenance log, if the forklift is currently in "maintenance" status, show a prompt: "Mark this forklift as available again?" One click updates the status and logs the change.

---

## 6. Dashboard Action Center (Quick Actions for Pending Items)

**Current gap**: The dashboard shows alerts (overdue invoices, maintenance due) but they are not actionable -- no buttons to resolve them directly.

**Proposed flow**: Add action buttons to each alert:
- Overdue invoices: "Send Reminder" / "Mark Paid" buttons inline
- Maintenance due: "Log Service" button that opens the maintenance form pre-filled with the forklift
- Expiring bookings (new alert): bookings ending within 3 days, with "Extend" or "Schedule Pickup" buttons

---

## Priority Recommendation

If implementing incrementally, do them in this order:

| Priority | Feature | Why |
|----------|---------|-----|
| 1 | Return Inspection -> Invoice | Eliminates the most manual data re-entry |
| 2 | Invoice Paid -> Complete Booking | Prevents stale data buildup |
| 3 | Quote -> Booking + Delivery | Completes an existing half-built flow |
| 4 | Delivery Complete -> Schedule Pickup | Prevents forgotten pickups |
| 5 | Maintenance -> Mark Available | Small but frequent pain point |
| 6 | Dashboard Action Center | Polish layer on top of existing alerts |

---

## Technical Details

### Feature 1: Return Inspection -> Invoice
- Modify `ReturnInspectionPage.tsx` `onSuccess` callback to open a post-inspection dialog
- Dialog calls `generateLineItems()` from `invoiceUtils.ts` using the booking's forklift and dates, adds a damage line if `damage_cost > 0`
- On confirm, inserts into `invoices` table via existing `useCreateInvoice` hook and navigates to the new invoice detail

### Feature 2: Invoice Paid -> Complete Booking
- Create a database trigger or modify `InvoiceDetail.tsx` `setStatus("paid")` handler
- After marking paid, if `invoice.booking_id` exists, update `bookings.status = 'completed'` and invalidate booking queries
- Preferred approach: a small RPC function `complete_booking_on_payment` for atomicity

### Feature 3: Quote -> Booking + Delivery
- Extract the post-booking delivery dialog from `BookingForm.tsx` into a reusable `PostBookingDeliveryDialog` component
- Use it in both `BookingForm.tsx` and `QuoteDetail.tsx` after `convertToBooking` succeeds

### Feature 4: Delivery Complete -> Schedule Pickup
- In `DeliveriesPage.tsx`, modify `markComplete` to check if the delivery type is "delivery"
- If so, show a dialog pre-filled with booking data to create a "pickup" delivery entry

### Feature 5: Maintenance -> Mark Available
- In `MaintenancePage.tsx` `onSuccess` callback, check if the selected forklift's status is "maintenance"
- If so, show a confirmation prompt, then update the forklift status and insert a `status_logs` entry

### Feature 6: Dashboard Action Center
- Modify `AlertsRow.tsx` to include inline action buttons
- Wire buttons to existing mutation hooks (`useUpdateInvoice`, `useCreateMaintenanceLog`, etc.)

