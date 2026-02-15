

# Reorder Forms: Pick Dates First, Then Show Available Forklifts

## What Changes

Both the **New Booking** and **New Quote** forms will be restructured so that:

1. The user selects the **Rental Period** (date range) first
2. The **Forklift selector** appears below, filtered to only show forklifts that have no overlapping confirmed bookings during that period
3. If no dates are selected yet, the forklift dropdown shows a disabled/placeholder state prompting the user to pick dates first

This removes the current "pick a forklift, then get a conflict warning" pattern and replaces it with a streamlined flow where only genuinely available equipment is shown.

---

## Booking Form (`src/pages/BookingForm.tsx`)

### UI reorder
- Move the `DateRangePickerField` above the Forklift `Select`
- Disable the forklift selector until both `startDate` and `endDate` are set

### Filtering logic
- Current: `availableForklifts` filters by `status === "available"` and maintenance-due check
- New: Add an additional filter that excludes forklifts with any overlapping **confirmed** booking in the selected date range (using the already-fetched `allBookings` data)
- Remove the separate `conflict` check and warning banner (no longer needed since conflicting forklifts won't appear)
- Reset `forkliftId` if the user changes dates and the previously selected forklift is no longer available

### Updated available forklifts logic (pseudo-code):
```text
availableForklifts = forklifts
  .filter(status === "available" AND not maintenance-due)
  .filter(no overlapping confirmed booking in allBookings for [startDate, endDate])
```

## Quote Form (`src/pages/QuoteForm.tsx`)

### UI reorder
- Move the `DateRangePickerField` above the Forklift `Select`
- Disable the forklift selector until both dates are set

### Filtering logic
- Currently no availability filtering exists -- add the same overlapping-booking filter using the `allBookings` data (requires importing `useBookings`)
- Also apply the maintenance-due filter for consistency (requires importing `useMaintenanceLogs`)
- Reset `forkliftId` when dates change and the selected forklift becomes unavailable

---

## Technical Details

### BookingForm.tsx changes
- Reorder JSX: `DateRangePickerField` moves before the Forklift `Select` inside the Card
- Update `availableForklifts` memo to incorporate date-range overlap check using `areIntervalsOverlapping`
- Add a `useEffect` that clears `forkliftId` if it's no longer in the filtered list when dates change
- Remove the `conflict` memo and the conflict warning banner (lines ~65-75 and ~175-180)
- Add `disabled` prop or conditional rendering on the Select when no dates are chosen

### QuoteForm.tsx changes
- Import `useBookings` and `useMaintenanceLogs` (via `useForkliftData` barrel)
- Reorder JSX: move `DateRangePickerField` above the Forklift `Select`
- Add `availableForklifts` memo with the same overlap + maintenance logic
- Add `useEffect` to clear `forkliftId` on date change if no longer available
- Disable forklift selector when dates are not set

### Files to modify
- `src/pages/BookingForm.tsx` -- reorder fields, update filtering, remove conflict warning
- `src/pages/QuoteForm.tsx` -- reorder fields, add availability filtering

