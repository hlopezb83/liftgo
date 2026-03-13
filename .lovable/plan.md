

# Codebase Architecture Audit Report

## Executive Summary

The codebase follows generally good patterns: lazy-loaded routes, domain-specific hooks, reusable UI components, and a clear separation between pages and logic hooks. However, several areas need attention, ordered below from most critical to optional.

---

## Priority 1 — Critical Issues

### 1.1 Remaining `as any` casts (16 files, ~30 instances)

Despite the previous cleanup pass, there are still ~30 `as any` casts across production code. Key offenders:

| File | Issue |
|------|-------|
| `useUserManagement.ts` | Casts `(p as any).email`, `(p as any).is_active` — indicates profiles table missing columns or type mismatch |
| `useContractTemplates.ts` | `.update(...as any)` — payload type not matching table schema |
| `useForklifts.ts` | `(fl as any)?.acquisition_cost` and `"costo_venta" as any` — field exists in DB but type not picked up |
| `ForkliftForm.tsx` | `(existing as any).acquisition_cost` and fallback model object cast |
| `DeliveriesPage.tsx` | Update mutation payload cast to `any` |
| `ExpenseFormDialog.tsx` | Insert payload cast |
| `MaintenancePoliciesTab.tsx` | Two mutation calls cast to `any` |
| `BookingForm.tsx` | Form error access via `as any` |

**Recommendation**: Fix each by either updating the Supabase types (regenerating after schema changes), using proper type assertions, or adjusting mutation signatures.

### 1.2 `window.location.reload()` in MaintenancePage

`MaintenancePage.tsx` line 68 uses a full page reload instead of invalidating the TanStack Query cache. This breaks the SPA experience and is inconsistent with every other mutation in the app.

**Recommendation**: Replace with `queryClient.invalidateQueries({ queryKey: ["maintenance_logs"] })`.

---

## Priority 2 — Separation of Concerns

### 2.1 ReportsPage fetches ALL data at the parent level

`ReportsPage.tsx` calls 6 hooks (`useForklifts`, `useBookings`, `useInvoices`, `useMaintenanceLogs`, `useDamageRecords`, `useOperatingExpenses`) and passes all data as props to child report components. This means **all 6 queries run regardless of which report is selected**.

**Recommendation**: Move each hook into its respective report component. The parent should only manage report type selection and date range, passing only the date range down.

### 2.2 Direct Supabase calls in page components

Several pages import `supabase` directly and make ad-hoc queries:

- `DamageTrackingPage.tsx` — inline `useQuery` for photo counts
- `InvoiceDetail.tsx` — direct `supabase.functions.invoke` for stamping/cancellation
- `MaintenancePage.tsx` — direct `supabase.functions.invoke` for recurring generation
- `InvoicesPage.tsx` — direct supabase call for recurring invoice generation
- `CustomerDetailPage.tsx` — direct supabase storage calls
- `CompanySettingsPage.tsx` — direct supabase storage calls

**Recommendation**: Extract these into domain hooks (e.g., `useDamagePhotoCounts`, `useStampCfdi`, `useGenerateRecurringMaintenance`). Pages should never import `supabase` directly.

### 2.3 MaintenancePage has an inline form dialog (~280 lines)

The maintenance creation form dialog (lines 224-266) is defined inline within the page, mixing form state, submission logic, and UI. This is the same pattern that was already fixed for `UserManagementPage`.

**Recommendation**: Extract to `MaintenanceFormDialog.tsx` component with its own form state.

### 2.4 DeliveriesPage is monolithic (~338 lines)

Contains inline form dialog, completion logic with signature handling, and pickup prompt orchestration all in one file.

**Recommendation**: Extract `DeliveryFormDialog` and `DeliveryCompletionFlow` components.

---

## Priority 3 — Consistency Issues

### 3.1 Mixed list-page patterns

Most list pages use `useListPage` (consolidated hook). But `DamageTrackingPage` and `AuditTrailPage` use the older `usePagination` + `useSort` separately, and `DamageTrackingPage` also has redundant filtering logic (both `useListFilters` and manual `extraFiltered`).

**Recommendation**: Migrate the 2 remaining pages to `useListPage` for consistency.

### 3.2 `BookingForm.tsx` doesn't follow the extracted-hook pattern

`ContractForm`, `InvoiceForm`, and `QuoteForm` all delegate logic to `use*FormLogic` hooks. `BookingForm` still has all its logic inline (~170 lines with form state, submission, post-booking flow).

**Recommendation**: Extract `useBookingFormLogic.ts` to match the established pattern.

### 3.3 Inconsistent `PageTransition` wrapper usage

Some pages wrap content in `<PageTransition>` (Dashboard, Calendar, Reports) while others don't (ForkliftForm, BookingForm, InvoiceForm, most detail pages). This creates inconsistent navigation animations.

**Recommendation**: Either apply `PageTransition` consistently to all pages or remove it entirely from the layout level.

---

## Priority 4 — Type Safety and Code Quality

### 4.1 `ForkliftDetail.tsx` imports `useBookings()` without a filter

Line 32: `useBookings(id)` — this passes a forklift ID to a hook that expects an optional forklift filter, but the hook should be verified to actually filter by forklift ID rather than fetching all bookings.

### 4.2 `InvoiceDetail.tsx` fetches ALL bookings to find one

Line 54: `useBookings()` fetches every booking just to `.find()` a single one by ID. This is wasteful.

**Recommendation**: Add a `useBooking(id)` single-fetch hook or use a direct query.

### 4.3 Duplicate `useAuth` export path

`src/hooks/useAuth.ts` is a re-export wrapper for `src/contexts/AuthContext.tsx`. This is fine for backward compatibility but adds an unnecessary indirection layer. Low priority.

---

## Priority 5 — Optional Enhancements

### 5.1 Test files use `as any` extensively

Test files (`exportCsv.test.ts`, `paymentFlow.test.ts`) cast supabase mocks as `any`. Acceptable in tests but could be improved with proper mock typing.

### 5.2 `OperatingExpensesPage` has inline edit form

Similar to MaintenancePage, the edit dialog logic is inline. Could be extracted for consistency.

### 5.3 Sidebar navigation config could be data-driven from routes

`AppSidebar.tsx` duplicates the route-to-module mapping that already exists in `routes.tsx`. A single source of truth would reduce drift risk.

---

## Recommended Execution Order

1. **Fix remaining `as any` casts** — highest type-safety impact (~30 instances across 10 production files)
2. **Replace `window.location.reload`** with query invalidation in MaintenancePage — quick fix, big UX win
3. **Move report data fetching** into individual report components — performance improvement
4. **Extract direct supabase calls** from pages into domain hooks (6 pages affected)
5. **Extract inline form dialogs** from MaintenancePage and DeliveriesPage
6. **Migrate DamageTrackingPage and AuditTrailPage** to `useListPage`
7. **Extract `useBookingFormLogic`** for consistency with other forms
8. **Fix InvoiceDetail fetching all bookings** — add single-booking query
9. **Standardize `PageTransition` usage** across all pages
10. **Optional**: Clean up test `as any` casts and sidebar config duplication

