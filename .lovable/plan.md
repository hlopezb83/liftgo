
# Fix: Date Range Picker Closes Immediately When Reopening

## The Problem

The `DateRangePickerField` has an auto-close effect that triggers whenever both `from` and `to` dates are set. When you reopen the picker to edit an already-selected range, both dates are already present, so the effect fires instantly and closes the popover after 300ms -- too fast to make any change.

## The Fix

In `src/components/DateRangePickerField.tsx`, track when the popover was opened and only auto-close after a **new** selection is made (i.e., the dates actually change while the popover is open).

Replace the current `useEffect` with logic that:
1. Records the initial `from`/`to` values when the popover opens
2. Only auto-closes when the dates differ from what they were at open time (meaning the user made a new selection)

### Implementation

- Add a `useRef` to store the date values at the moment the popover opens
- On `onOpenChange(true)`, snapshot the current `dateRange.from` and `dateRange.to`
- In the `useEffect`, compare current values against the snapshot -- only close if they changed

## File to Modify

- **`src/components/DateRangePickerField.tsx`** -- Update the auto-close logic (lines 22-28) and add a ref to track initial values
