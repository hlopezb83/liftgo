
# Refactor: Streamline Duplicated Code

## 1. Extract `useAvailableForklifts` hook

The `maintenanceDueIds` memo, `availableForklifts` memo, and the forklift-reset effect are **identical** in both `BookingForm.tsx` and `QuoteForm.tsx` (~40 lines each). Extract them into a single reusable hook.

**New file: `src/hooks/useAvailableForklifts.ts`**

```text
useAvailableForklifts(dateRange) => {
  - Calls useForklifts(), useBookings(), useMaintenanceLogs() internally
  - Computes maintenanceDueIds (3-day buffer)
  - Filters by status === "available", no maintenance due, no overlapping bookings
  - Returns { availableForklifts, forklifts (all), isLoading }
}
```

Both forms will replace ~40 lines of hook/memo/effect code with a single call:

```typescript
const { availableForklifts, forklifts } = useAvailableForklifts(dateRange);
```

The forklift-reset effect stays in each form (it depends on local `forkliftId` state) but shrinks to 3 lines using the hook's output.

## 2. Use existing `PostBookingDeliveryDialog` in BookingForm

`BookingForm.tsx` has the delivery dialog **fully inlined** (~70 lines of JSX + 6 state variables + 2 handlers), despite `PostBookingDeliveryDialog.tsx` already existing as a standalone component with the exact same UI and logic.

Replace the inline dialog and all its state (`showDeliveryForm`, `driverName`, `driverPhone`, `scheduledTime`, `deliveryAddress`, `deliveryNotes`) with:

```tsx
<PostBookingDeliveryDialog
  open={!!postBooking}
  onOpenChange={(o) => { if (!o) handleSkipDelivery(); }}
  bookingId={postBooking?.bookingId}
  forkliftId={postBooking?.forkliftId}
  forkliftName={selectedForkliftName?.name}
  startDate={postBooking?.startDate}
  customerAddress={postBooking?.customerAddress}
  onSkip={handleSkipDelivery}
/>
```

This removes ~80 lines and 6 state variables from BookingForm.

## 3. Remove unused imports from BookingForm

After using the dialog component, these imports are no longer needed in BookingForm:
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`
- `Textarea`, `Input` (only used in the delivery dialog section)
- `Truck`, `CheckCircle2`
- `useCreateDelivery`

## Summary of impact

| File | Change | Lines saved (approx) |
|------|--------|---------------------|
| `src/hooks/useAvailableForklifts.ts` | New shared hook | +35 |
| `src/pages/BookingForm.tsx` | Use hook + use dialog component | -120 |
| `src/pages/QuoteForm.tsx` | Use hook | -35 |
| `src/hooks/useForkliftData.ts` | Re-export new hook | +1 |

Net reduction: ~120 lines removed, single source of truth for availability logic.

## Files to modify
- **Create**: `src/hooks/useAvailableForklifts.ts`
- **Edit**: `src/pages/BookingForm.tsx` -- use hook + replace inline dialog with component
- **Edit**: `src/pages/QuoteForm.tsx` -- use hook
- **Edit**: `src/hooks/useForkliftData.ts` -- add barrel re-export
