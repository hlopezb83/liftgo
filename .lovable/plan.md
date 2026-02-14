
# Unified Date Range Picker for Bookings

Replace the two separate date pickers (Start Date / End Date) with a single inline date range calendar. After picking the start date, the calendar stays open and lets you pick the end date -- no extra clicks needed.

## How it will work

1. A single "Booking Dates" field shows the selected range (e.g. "Feb 14 - Mar 10")
2. Clicking it opens a popover with a calendar in **range** mode
3. First click sets the start date, second click sets the end date, then the popover closes automatically
4. The selected range is visually highlighted on the calendar

## Technical Details

### 1. New `DateRangePickerField` component (`src/components/DateRangePickerField.tsx`)
- Uses `react-day-picker` in `mode="range"` with a `DateRange` type (`{ from?: Date; to?: Date }`)
- Wrapped in a Popover that auto-closes once both `from` and `to` are set
- Displays formatted range in the trigger button (e.g. "Feb 14 - Mar 10, 2026")
- Shows two months side-by-side on desktop (`numberOfMonths={2}`)

### 2. Update `BookingForm.tsx`
- Replace the two `DatePickerField` components and the `startDate`/`endDate` state with a single `dateRange: DateRange` state
- Wire the new `DateRangePickerField` into the form
- Keep all existing conflict detection and recurring billing logic -- just source dates from `dateRange.from` and `dateRange.to` instead of separate state variables

### 3. No changes needed to
- The existing `DatePickerField` component (still used elsewhere for single dates)
- Database schema or backend logic
- Any other pages
