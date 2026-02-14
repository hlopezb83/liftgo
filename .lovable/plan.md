
# Refactoring Plan for ForkliftERP

## Status: ✅ COMPLETED

All 6 refactoring areas have been implemented.

---

## 1. ✅ Split `useForkliftData.ts` into domain hooks
- `src/hooks/useForklifts.ts` — forklift CRUD + status updates + status logs
- `src/hooks/useBookings.ts` — booking queries + creation + `BookingWithForklift` type
- `src/hooks/useCustomers.ts` — customer CRUD
- `src/hooks/useInvoices.ts` — invoice CRUD
- `src/hooks/useMaintenanceLogs.ts` — maintenance log queries + creation
- `src/hooks/useForkliftData.ts` — barrel re-export (existing imports unchanged)

## 2. ✅ Dashboard extracted into sub-components
- `src/components/dashboard/StatCards.tsx`
- `src/components/dashboard/AlertsRow.tsx`
- `src/components/dashboard/FleetStatusChart.tsx`
- `src/components/dashboard/InvoiceBreakdown.tsx`
- `src/components/dashboard/UtilizationCharts.tsx`
- `src/components/dashboard/CashFlowChart.tsx`

## 3. ✅ Currency formatting standardized
- `src/lib/formatCurrency.ts` — single `formatCurrency()` function
- All pages updated to use EUR consistently

## 4. ✅ `useFormState` hook created
- `src/hooks/useFormState.ts`
- Applied to MaintenancePage, DeliveriesPage, ReturnInspectionPage

## 5. ✅ `any` type casts removed
- `BookingWithForklift` type added in `useBookings.ts`
- Removed `(b: any)` casts from CalendarPage, Dashboard, BookingForm, CustomerDetailPage, InvoiceForm
- Remaining `as any` in DeliveriesPage/ReturnInspectionPage are for Supabase joined query types (unavoidable without SDK type overrides)

## 6. DataTable wrapper — deferred
- Pages have enough variation in structure that a generic wrapper would add complexity without clear benefit at current scale.
