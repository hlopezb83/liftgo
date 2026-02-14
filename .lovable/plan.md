

# Use Date Range Picker for Start/End Date Pairs

## What changes

Replace paired start/end date pickers with the single-prompt date range picker (the same one used in Bookings) in two places:

### 1. Quote Form (`src/pages/QuoteForm.tsx`)
- Remove the two separate `DatePickerField` components for "Start Date" and "End Date"
- Replace with a single `DateRangePickerField` component labeled "Rental Period"
- Manage state as a single `dateRange` object (type `DateRange`) instead of separate `startDate` / `endDate` states
- Extract `startDate` and `endDate` from `dateRange.from` and `dateRange.to` for the rest of the form logic (line items, submission)
- The "Valid Until" picker remains a single date picker -- no change there

### 2. Reports Page (`src/pages/ReportsPage.tsx`)
- Replace the two separate "From" and "To" `DatePickerField` components with a single `DateRangePickerField` labeled "Date Range"
- Manage state as a single `dateRange` object, deriving `startDate` and `endDate` from it

### What stays the same
- All single-date pickers (Invoice due date, Booking extend/early return, Delivery date, Maintenance service dates, Quote valid-until) remain as `DatePickerField` -- they are not date ranges
- The `DateRangePickerField` component itself needs no changes -- it already works correctly

---

## Technical Details

### QuoteForm changes
- Remove `import { DatePickerField }` (still needed for "Valid Until") -- actually keep both imports
- Add `import { DateRangePickerField }` and `import type { DateRange } from "react-day-picker"`
- Replace `const [startDate, setStartDate] = useState<Date>()` and `const [endDate, setEndDate] = useState<Date>()` with `const [dateRange, setDateRange] = useState<DateRange | undefined>()`
- Derive `const startDate = dateRange?.from` and `const endDate = dateRange?.to` for use in `useMemo` / `handleSubmit`
- In the `useEffect` for loading existing quote data, set `setDateRange({ from: new Date(...), to: new Date(...) })` instead of two separate calls
- Replace the two-column grid of DatePickerFields with: `<DateRangePickerField label="Rental Period" dateRange={dateRange} onSelect={setDateRange} required />`

### ReportsPage changes
- Replace `DatePickerField` import with `DateRangePickerField`
- Replace two date states with a single `dateRange` state, initialized with `{ from: subMonths(new Date(), 1), to: new Date() }`
- Derive `startDate` and `endDate` from the range for report filtering
- Replace the two picker fields with one `DateRangePickerField`
