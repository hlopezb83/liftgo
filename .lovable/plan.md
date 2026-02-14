
# Refactoring Plan for ForkliftERP

## Overview
The codebase has grown organically and now has several areas where consolidation, extraction, and cleanup would improve maintainability. This plan covers 6 refactoring areas, ordered by impact.

---

## 1. Split the Monolithic `useForkliftData.ts` Hook (285 lines, 6 domains)

This single file contains hooks for forklifts, bookings, customers, invoices, maintenance, and status logs -- all unrelated domains packed together.

**Action**: Split into domain-specific files:
- `src/hooks/useForklifts.ts` -- forklift CRUD + status updates + status logs
- `src/hooks/useBookings.ts` -- booking queries + creation
- `src/hooks/useCustomers.ts` -- customer CRUD
- `src/hooks/useInvoices.ts` -- invoice CRUD
- `src/hooks/useMaintenanceLogs.ts` -- maintenance log queries + creation

Keep `useForkliftData.ts` as a re-export barrel file so existing imports don't break:
```typescript
export * from "./useForklifts";
export * from "./useBookings";
// etc.
```

---

## 2. Extract the Dashboard Into Sub-Components (415 lines)

`Dashboard.tsx` is the largest page at 415 lines with 7+ `useMemo` blocks and 6 chart/card sections all inline.

**Action**: Extract into focused components:
- `src/components/dashboard/StatCards.tsx`
- `src/components/dashboard/AlertsRow.tsx` (overdue invoices + maintenance alerts)
- `src/components/dashboard/FleetStatusChart.tsx`
- `src/components/dashboard/InvoiceBreakdown.tsx`
- `src/components/dashboard/UtilizationCharts.tsx`
- `src/components/dashboard/CashFlowChart.tsx`

Each component receives only the data it needs as props, keeping the dashboard page itself under 60 lines.

---

## 3. Eliminate Repeated Table Page Patterns

Fleet, Invoices, Maintenance, Deliveries, and Customers pages all follow the same structure:
1. Search/filter bar
2. Card wrapping a Table
3. Loading state via `TableSkeleton`
4. Empty state via `EmptyRow`

**Action**: Create a reusable `DataTable` wrapper:
```text
src/components/DataTable.tsx
  Props: isLoading, isEmpty, emptyMessage, columns, data, onRowClick, renderRow
```

This eliminates ~30 repeated lines per page (loading/empty/card/table boilerplate).

---

## 4. Consolidate Currency Formatting

Currency is formatted inconsistently across the app:
- `$` used in Fleet page (`$${f.daily_rate}/day`), ForkliftDetail (`$${forklift.daily_rate}`), and MaintenancePage (`$${log.cost}`)
- `EUR` used in Invoices, Dashboard, CustomerDetail, ReturnInspection pages

**Action**:
- Create `src/lib/formatCurrency.ts` with a single `formatCurrency(amount: number)` function returning `EUR{amount.toFixed(2)}`
- Replace all inline formatting across ~15 occurrences
- Standardize on EUR since invoices (the financial core) already use it

---

## 5. Reduce Dialog Form Boilerplate

MaintenancePage, DeliveriesPage, ReturnInspectionPage, CustomersPage, and EquipmentConfigPage all have:
- 5-10 individual `useState` calls for form fields
- A `resetForm` function that clears them all
- Nearly identical submit/cancel patterns

**Action**: Introduce a lightweight `useFormState` hook:
```typescript
function useFormState<T>(initial: T) {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof T>(key: K, value: T[K]) => 
    setForm(prev => ({ ...prev, [key]: value }));
  const reset = () => setForm(initial);
  return { form, set, reset, setForm };
}
```

This replaces 5-10 `useState` calls + `resetForm` with a single hook per page.

---

## 6. Remove `any` Type Casts

There are ~20 instances of `(b: any)` or `(inv: any)` scattered across CalendarPage, DeliveriesPage, ReturnInspectionPage, ForkliftDetail, and CustomerDetailPage -- mostly for bookings and inspections data that includes joined relations.

**Action**: Define proper types for joined queries:
```typescript
// In useBookings.ts
export type BookingWithForklift = Booking & {
  forklifts: { name: string; model: string } | null;
};
```

Then update the hook return types and remove all `any` casts.

---

## Summary of Changes

| Area | Files Changed | Lines Saved (est.) |
|------|--------------|-------------------|
| Split useForkliftData | 5 new + 1 barrel | 0 (reorganization) |
| Dashboard extraction | 6 new + 1 edit | ~350 from Dashboard |
| DataTable component | 1 new + 5 edits | ~150 total |
| Currency formatting | 1 new + ~10 edits | ~30 + consistency |
| useFormState hook | 1 new + 5 edits | ~80 total |
| Remove `any` casts | ~8 edits | 0 (type safety) |

No functionality changes -- purely structural improvements.
