

# Standardize Date Pickers Across the App

## Problem

Date selection is inconsistent across modules. Some use the shared calendar popover component (`DatePickerField`), while others use a raw HTML `<Input type="date">` which looks different and behaves differently depending on the browser.

### Current State

| Module | Current Approach |
|--------|-----------------|
| Bookings | `DateRangePickerField` (calendar popover) |
| Quotes | `DatePickerField` + `DateRangePickerField` |
| Deliveries | `DatePickerField` (calendar popover) |
| Maintenance | `DatePickerField` (calendar popover) |
| Booking Actions (Extend/Return) | `DatePickerField` (calendar popover) |
| **Contract Form** | **Raw `<Input type="date">`** -- inconsistent |
| **Record Payment Dialog** | **Raw `<Input type="date">`** -- inconsistent |

## Solution

Replace the two remaining raw `<Input type="date">` usages with the existing `DatePickerField` component. No new component needs to be created -- `DatePickerField` and `DateRangePickerField` already exist and are well-designed. They just need to be used everywhere.

## Changes

### 1. Contract Form (`src/pages/ContractForm.tsx`)

The start and end date fields currently use `<Input type="date">` with string values (`form.start_date`, `form.end_date`). These will be replaced with `DatePickerField`, which works with `Date` objects. The form state and submit handler will be updated to convert between `Date` objects and date strings as needed.

### 2. Record Payment Dialog (`src/components/RecordPaymentDialog.tsx`)

The payment date field currently uses `<Input type="date">` with a string value. This will be replaced with `DatePickerField`, with the same string-to-Date conversion applied.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/ContractForm.tsx` | Replace 2 native date inputs with `DatePickerField`; adjust form state for Date objects |
| `src/components/RecordPaymentDialog.tsx` | Replace 1 native date input with `DatePickerField`; adjust state for Date object |

No new files or components are needed.

