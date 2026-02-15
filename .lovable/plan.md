

# Production-Ready Refactoring Plan

## Overview

After a thorough review of the entire codebase, here are the most impactful refactoring and optimization opportunities organized by priority.

---

## 1. Extract Shared "Forklift Selector" Component

The forklift `Select` dropdown with availability filtering and the "no forklifts available" message is duplicated identically in `BookingForm.tsx` and `QuoteForm.tsx` (~15 lines each). Extract into a `ForkliftSelector` component.

**Files:**
- Create `src/components/ForkliftSelector.tsx`
- Edit `src/pages/BookingForm.tsx` -- replace inline select
- Edit `src/pages/QuoteForm.tsx` -- replace inline select

---

## 2. Centralize Status and Constants

Statuses like `["available", "rented", "maintenance", "retired"]` appear in at least 4 files (Fleet, ForkliftDetail, ForkliftForm, StatusBadge). Fuel types `["Diesel", "Electric", "LPG", "Gasoline"]` appear in 2 files. Service types in MaintenancePage, conditions in ReturnInspectionPage -- all hardcoded inline.

Move all domain constants into a single `src/lib/constants.ts` file and import from there. This prevents drift and makes them easy to update when the business changes.

**Files:**
- Create `src/lib/constants.ts`
- Edit 6+ files to import from constants

---

## 3. Extract Reusable "Cost Preview" Card

The cost preview section in `QuoteForm.tsx` (lines 142-159) -- showing line items, subtotal, VAT, and total -- is also used in `InvoiceForm.tsx` (lines 190-208) with slightly different styling. Extract into a `CostSummaryCard` component.

**Files:**
- Create `src/components/CostSummaryCard.tsx`
- Edit `src/pages/QuoteForm.tsx`
- Edit `src/pages/InvoiceForm.tsx`

---

## 4. Extract "Notes" Card Pattern

A `Card` with a `Textarea` for notes appears identically in `QuoteForm`, `InvoiceForm`, and `ForkliftForm` (~8 lines each). Extract into a `NotesCard` component.

**Files:**
- Create `src/components/NotesCard.tsx`
- Edit `src/pages/QuoteForm.tsx`, `InvoiceForm.tsx`, `ForkliftForm.tsx`

---

## 5. Standardize Form Page Header

The back-button + title pattern (`Button variant="ghost" + ArrowLeft + h1`) is copy-pasted across `BookingForm`, `QuoteForm`, `InvoiceForm`, `ForkliftForm`, and `ForkliftDetail` (5 files, ~4 lines each). Extract into a `FormPageHeader` component or extend the existing `PageHeader`.

**Files:**
- Create `src/components/FormPageHeader.tsx` (or extend `PageHeader`)
- Edit 5 form pages

---

## 6. Replace `(d as any)` Type Casts

In `DeliveriesPage.tsx` line 142, there's an unsafe `(d as any).forklifts?.name` cast. The deliveries query should be updated to use a proper join (`select("*, forklifts(name)")`) in `useDeliveries`, then the type will be correct without casting.

**Files:**
- Edit `src/hooks/useDeliveries.ts` -- add join in query
- Edit `src/pages/DeliveriesPage.tsx` -- remove `as any`

---

## 7. Add Missing Pagination

`DamageTrackingPage`, `MaintenancePage`, and `CalendarPage` (All Bookings section) display all records without pagination. As data grows, these will become slow. Add `usePagination` + `TablePagination` to these pages for consistency with Fleet, Customers, Invoices, and Quotes.

**Files:**
- Edit `src/pages/DamageTrackingPage.tsx`
- Edit `src/pages/MaintenancePage.tsx`

---

## 8. Migrate ForkliftForm to `useFormState` Hook

`ForkliftForm` and `CustomersPage` use manual `useState` + inline `set` functions instead of the project's `useFormState` hook (already used in DeliveriesPage, MaintenancePage, ReturnInspectionPage). Migrating keeps form state management consistent.

**Files:**
- Edit `src/pages/ForkliftForm.tsx`
- Edit `src/pages/CustomersPage.tsx`

---

## 9. Clean Up Unused Import in Dashboard

`Dashboard.tsx` imports `Card, CardContent, CardHeader, CardTitle` plus several icons and date utilities. The `formatCurrency` import at the top is used, but `format` from date-fns is used in cashFlowData but the function could be simplified. More importantly, the `Active Bookings` section at the bottom is a duplicate of what already exists on the Calendar page -- consider removing it or linking to the Calendar.

**Files:**
- Edit `src/pages/Dashboard.tsx` -- clean up

---

## 10. Add Search/Filter to Maintenance and Damage Pages

Fleet, Customers, Invoices, and Quotes all have search + filter bars. Maintenance and Damage pages are missing these, making it harder to find records as data grows.

**Files:**
- Edit `src/pages/MaintenancePage.tsx` -- add search input + forklift filter
- Edit `src/pages/DamageTrackingPage.tsx` -- add search + status filter

---

## Summary

| # | Change | Impact | Files |
|---|--------|--------|-------|
| 1 | ForkliftSelector component | Removes duplication | 3 |
| 2 | Constants file | Single source of truth | 7+ |
| 3 | CostSummaryCard | Removes duplication | 3 |
| 4 | NotesCard | Removes duplication | 4 |
| 5 | FormPageHeader | Removes duplication | 6 |
| 6 | Fix unsafe type cast | Type safety | 2 |
| 7 | Add pagination | Performance at scale | 2 |
| 8 | Consistent useFormState | Code consistency | 2 |
| 9 | Dashboard cleanup | Remove redundancy | 1 |
| 10 | Search/filter on all tables | Usability consistency | 2 |

Estimated net: ~5 new small files, ~100 lines removed from existing pages, much more consistent patterns across the app.

