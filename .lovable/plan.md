

# Architecture Audit Report

## Critical Issues

### 1. QuoteForm.tsx — 348 lines of mixed logic + UI (extract hook)
`QuoteForm.tsx` is the largest page file. It mixes 12+ `useState` calls, 3 `useEffect` blocks, complex line-item computation, rental-meta serialization, and UI rendering in one file. This is the same problem `InvoiceForm` had before its hook extraction.

**Fix**: Extract `useQuoteFormLogic()` hook (mirroring the `useInvoiceFormLogic` pattern).

### 2. ContractForm.tsx — 336 lines, same problem
Contains `replacePlaceholders` utility (duplicated — also exists in `contractPdfGenerator.ts` with different syntax), 4 `useEffect` blocks for auto-fill, form state as plain object with string coercion, and inline template rendering logic.

**Fix**: Extract `useContractFormLogic()` hook; consolidate `replacePlaceholders` into a single shared utility.

### 3. `_rentalMeta` hack — undocumented data smuggling
Quote rental lines are stored by mutating `lineItems[0]._rentalMeta` with `as any`. This hidden metadata lives inside a JSON column with no schema. Both `QuoteForm` and `QuoteDetail` depend on it.

**Fix**: Add a dedicated `rental_meta` JSONB column to the `quotes` table, or store it as a separate top-level field in the payload.

### 4. Pervasive `as any` — 112 occurrences across 12 page files
Used to bypass missing types (e.g., `quote_type` not in generated types, `acquisition_cost`, `is_active`, `email` on profiles). This masks real type errors and makes refactoring risky.

**Fix**: Update the database types by ensuring all columns exist in the schema, and add proper type extensions where needed (e.g., `UserRow` interface).

---

## High-Priority Structural Issues

### 5. ReportsPage / IncomeStatementPage — data fetching in wrong layer
Both pages call 5-6 domain hooks (`useForklifts`, `useBookings`, `useInvoices`, `useMaintenanceLogs`, `useOperatingExpenses`, `useDamageRecords`) then pass raw arrays to child report components. The page acts as a data-fetching orchestrator rather than delegating to each report component.

**Fix**: Each report component should own its own data queries, or create a `useReportData(dateRange)` hook that fetches only the needed data with date-range filters.

### 6. Duplicate `replacePlaceholders` functions
- `ContractForm.tsx` line 42: uses `[KEY]` bracket syntax
- `contractPdfGenerator.ts` line 50: uses `{KEY}` brace syntax

Two incompatible implementations of the same concept.

**Fix**: Consolidate into one utility in `src/lib/templateUtils.ts` that supports both syntaxes, or standardize on one.

### 7. Toast side-effects embedded in hooks
All mutation hooks (`useCreateBooking`, `useCreateInvoice`, `useUpdateQuote`, etc.) call `toast.error()` inside `onError`. This couples data hooks to a specific UI notification library.

**Fix**: This is low-risk and works well in practice. Optional improvement: let callers handle success/error toast via `onError`/`onSuccess` callbacks, removing the default toast from hooks.

---

## Medium-Priority Issues

### 8. `useCustomerPortal` — monolith hook fetching 4 tables
Fetches customers, bookings, invoices, and contracts in a single hook. Not all portal pages need all 4 queries.

**Fix**: Split into individual hooks (`usePortalBookings`, `usePortalInvoices`, etc.) and call only what's needed per page.

### 9. Inconsistent form patterns
- `BookingForm` uses `react-hook-form` + Zod
- `QuoteForm` uses manual `useState` fields
- `ContractForm` uses a single `form` state object with string coercion
- `InvoiceForm` uses `useFormState` custom hook

No single form pattern is standardized.

**Fix**: Standardize on `react-hook-form` + Zod for all form pages, extracting schemas to `formSchemas.ts` (which already exists but only covers bookings, customers, and forklifts).

### 10. Missing `staleTime` on several hooks
Despite the recent optimization pass, these hooks still lack `staleTime`:
- `useQuotes`, `useContracts`, `useDamageRecords`, `useOperatingExpenses`, `useDeliveries`, `useReturnInspections`, `useDrivers`, `useMechanics`, `usePartsInventory`, `useProspects`, `useEquipmentModels`.

**Fix**: Add `staleTime: 60_000` to all list-level queries.

### 11. `useContracts` uses abbreviated variable `qc` for queryClient
Violates the established coding standard ("Avoid ambiguous abbreviations").

**Fix**: Rename to `queryClient` in all hooks that use `qc`.

---

## Low-Priority / Optional Enhancements

### 12. `useFormState` hook only used by InvoiceForm
Custom `useFormState` in `src/hooks/useFormState.ts` is a one-off. If standardizing on `react-hook-form`, this becomes unnecessary.

### 13. `useListPage` / `useListFilters` — solid patterns, no issues found
These are well-structured reusable hooks. No changes needed.

### 14. Edge functions follow consistent patterns
All edge functions properly use `_shared/cors.ts` and `_shared/validate.ts`. No structural issues.

---

## Recommended Execution Order

| Priority | Task | Impact | Effort |
|----------|------|--------|--------|
| 1 | Extract `useQuoteFormLogic` hook from QuoteForm | High | Medium |
| 2 | Extract `useContractFormLogic` hook from ContractForm | High | Medium |
| 3 | Add `staleTime` to remaining 11 hooks | High | Trivial |
| 4 | Eliminate `_rentalMeta` hack (add DB column or structured field) | High | Medium |
| 5 | Consolidate `replacePlaceholders` into shared utility | Medium | Low |
| 6 | Fix `as any` casts by extending types properly | Medium | Medium |
| 7 | Rename `qc` → `queryClient` across hooks | Low | Trivial |
| 8 | Split `useCustomerPortal` into per-resource hooks | Low | Low |
| 9 | Standardize all forms on react-hook-form + Zod | Low | High |
| 10 | Move report data fetching into report components | Low | Medium |

