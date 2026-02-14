

# Bug Fixes and Code Refactoring Plan

## Bugs Found

### 1. React ref warning on ReturnInspectionPage
The console shows "Function components cannot be given refs" for `Dialog` and `EmptyRow` inside `ReturnInspectionPage`. The `EmptyRow` component is used inside `TableBody` but is not wrapped with `React.forwardRef`, which Radix UI table components expect.

### 2. `StatusBadge` missing many statuses
The `StatusBadge` component only maps 9 statuses but the app uses many more: `accepted`, `declined`, `expired`, `completed`, `reported`, `in_repair`, `repaired`, `invoiced`, `good`, `minor_damage`, `major_damage`, `needs_repair`, `created`, `updated`. These all fall through to the unstyled default, making damage conditions and quote statuses look broken.

### 3. Dashboard `counts` not memoized
The `counts`, `pieData`, `statCards`, and `outstandingRevenue` values in `Dashboard.tsx` are recalculated on every render. While not a crash bug, it's wasteful and inconsistent with the rest of the dashboard which uses `useMemo`.

### 4. `handleDelete` in ForkliftDetail navigates before mutation completes
`handleDelete` calls `navigate("/fleet")` and `toast.success` immediately, then fires the delete mutation. If the delete fails, the user has already left the page and sees a confusing error toast.

### 5. `useQuotes` hook defines a manual `Quote` type instead of using `Tables<"quotes">`
This can drift out of sync with the database schema and bypasses type safety from the auto-generated types.

### 6. `useDamageRecords` uses `Partial<DamageRecord>` for inserts
The `useCreateDamageRecord` accepts `Partial<DamageRecord>` which allows missing required fields. Should use `TablesInsert<"damage_records">`.

### 7. `useUpdateBooking` / `useUpdateQuote` / `useUpdateDamageRecord` use `{ id: string; [key: string]: any }`
These bypass TypeScript entirely. Should use proper update types.

### 8. `BookingActions` fetches entire forklifts list just for one forklift
It calls `useForklifts()` to find a single forklift by ID, when the booking already has `forklifts` joined data. The daily/weekly/monthly rates are needed but not on the join -- however this is still wasteful and could use a targeted query.

### 9. InvoiceForm hardcodes euro symbol `"€"` instead of using `formatCurrency`
Lines 173, 194, 199, 202 use `€${value.toFixed(2)}` while the rest of the app uses `formatCurrency()`.

## Refactoring Plan

### A. Fix EmptyRow ref warning
Add `React.forwardRef` to the `EmptyRow` component.

### B. Expand StatusBadge
Add all missing status mappings: `accepted`, `declined`, `expired`, `completed`, `reported`, `in_repair`, `repaired`, `invoiced`, `good`, `minor_damage`, `major_damage`, `needs_repair`.

### C. Memoize Dashboard calculations
Wrap `counts`, `pieData`, `outstandingRevenue`, and `statCards` in `useMemo`.

### D. Fix ForkliftDetail delete ordering
Move `navigate` and `toast.success` into the `onSuccess` callback of the mutation.

### E. Use generated types in hooks
- `useQuotes.ts`: Replace manual `Quote` type with `Tables<"quotes">`, use `TablesInsert`/`TablesUpdate` for mutations.
- `useDamageRecords.ts`: Same -- use `Tables<"damage_records">`, `TablesInsert`, `TablesUpdate`.
- `useBookings.ts` (`useUpdateBooking`): Use `TablesUpdate<"bookings"> & { id: string }`.

### F. Use `formatCurrency` consistently in InvoiceForm
Replace the 4 hardcoded `€` usages with `formatCurrency()`.

### G. Deduplicate Invoice/Quote detail summary pattern
Both `InvoiceDetail` and `QuoteDetail` have an identical totals summary card. Extract a shared `TotalsSummary` component.

### H. Deduplicate Invoice/Quote form customer selector
Both `QuoteForm` and `BookingForm` share nearly identical customer selection UI. Extract a `CustomerSelector` component.

## Technical Details

### Files to modify:
| File | Change |
|------|--------|
| `src/components/EmptyRow.tsx` | Add `forwardRef` |
| `src/components/StatusBadge.tsx` | Add ~12 missing status entries |
| `src/pages/Dashboard.tsx` | Wrap 4 values in `useMemo` |
| `src/pages/ForkliftDetail.tsx` | Move navigate/toast into `onSuccess` |
| `src/hooks/useQuotes.ts` | Use `Tables<"quotes">`, `TablesInsert`, `TablesUpdate` |
| `src/hooks/useDamageRecords.ts` | Use `Tables<"damage_records">`, `TablesInsert`, `TablesUpdate` |
| `src/hooks/useBookings.ts` | Type `useUpdateBooking` properly |
| `src/pages/InvoiceForm.tsx` | Replace `€` with `formatCurrency` |
| `src/components/TotalsSummary.tsx` | **New** -- shared totals card |
| `src/components/CustomerSelector.tsx` | **New** -- shared customer picker |
| `src/pages/InvoiceDetail.tsx` | Use `TotalsSummary` |
| `src/pages/QuoteDetail.tsx` | Use `TotalsSummary` |
| `src/pages/QuoteForm.tsx` | Use `CustomerSelector` |
| `src/pages/BookingForm.tsx` | Use `CustomerSelector` |

### Files to create:
- `src/components/TotalsSummary.tsx` (small shared component)
- `src/components/CustomerSelector.tsx` (shared customer select + name input)

No database changes required. No new dependencies needed.
