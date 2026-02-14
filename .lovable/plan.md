
# Implementation Plan: 8 New Features for ForkliftERP

## 1. Quotation/Estimate Module

**What it does:** Create quotes for customers before committing to a booking. Quotes can be converted into bookings and invoices.

**Database:**
- New `quotes` table: id, quote_number, customer_id, customer_name, forklift_id, start_date, end_date, line_items (jsonb), subtotal, tax_rate, tax_amount, total, status (draft/sent/accepted/declined/expired), valid_until, notes, created_at, updated_at
- New `next_quote_number()` database function (same pattern as `next_invoice_number`)

**New files:**
- `src/hooks/useQuotes.ts` -- CRUD hooks
- `src/pages/QuotesPage.tsx` -- list of all quotes with status filters
- `src/pages/QuoteForm.tsx` -- create/edit quote (reuses `invoiceUtils.ts` for line item generation)
- `src/pages/QuoteDetail.tsx` -- view quote with "Convert to Booking" and "Convert to Invoice" actions

**Changes:**
- `src/App.tsx` -- add routes: `/quotes`, `/quotes/new`, `/quotes/:id`, `/quotes/:id/edit`
- `src/components/AppSidebar.tsx` -- add "Quotes" nav item
- `src/hooks/useForkliftData.ts` -- re-export useQuotes

---

## 2. Recurring Invoices for Long-Term Bookings

**What it does:** For active bookings longer than 30 days, automatically generate monthly invoices via a backend function.

**Database:**
- Add `recurring_billing` boolean column (default false) and `last_billed_date` to `bookings` table

**New files:**
- `supabase/functions/generate-recurring-invoices/index.ts` -- edge function that finds bookings with `recurring_billing=true` and `status='confirmed'`, creates monthly invoices for unbilled periods
- Cron job scheduled daily to call the edge function

**Changes:**
- `src/pages/BookingForm.tsx` -- add "Enable recurring billing" toggle for bookings > 30 days
- `src/pages/CalendarPage.tsx` -- show recurring billing indicator on bookings

---

## 3. Booking Lifecycle (Extend and Early Return)

**What it does:** Add "Extend Booking" and "Early Return" actions to active bookings, with automatic rate recalculation.

**New files:**
- `src/components/BookingActions.tsx` -- dialog component for extend/early-return with date picker and cost preview

**Changes:**
- `src/hooks/useBookings.ts` -- add `useUpdateBooking` mutation
- `src/pages/CalendarPage.tsx` -- add action buttons (Extend / Early Return) to each active booking row
- `src/pages/ForkliftDetail.tsx` -- add same actions to booking entries
- `src/lib/invoiceUtils.ts` -- no changes needed (already calculates costs from date ranges)

---

## 4. Notifications & Activity Feed

**What it does:** A centralized activity log showing recent events across the system (bookings created, invoices overdue, returns completed, maintenance due).

**Database:**
- New `activity_feed` table: id, event_type, entity_type, entity_id, title, description, created_at
- Database trigger on bookings/invoices/return_inspections/maintenance_logs to auto-insert activity entries

**New files:**
- `src/hooks/useActivityFeed.ts` -- query hook with optional filters
- `src/pages/ActivityPage.tsx` -- paginated feed with type filters and links to relevant entities
- `src/components/dashboard/RecentActivity.tsx` -- compact version for the dashboard

**Changes:**
- `src/App.tsx` -- add `/activity` route
- `src/components/AppSidebar.tsx` -- add "Activity" nav item
- `src/pages/Dashboard.tsx` -- add RecentActivity widget

---

## 5. Authentication & Role-Based Access

**What it does:** Multi-user login with Admin, Dispatcher, and Mechanic roles.

**Database:**
- Create `app_role` enum: admin, dispatcher, mechanic
- Create `user_roles` table (id, user_id, role) with RLS
- Create `profiles` table (id, user_id, full_name, avatar_url) with trigger to auto-create on signup
- Create `has_role()` security definer function
- Update RLS policies on all tables: Admin = full access; Dispatcher = read/write bookings, deliveries, customers; Mechanic = read fleet + write maintenance

**New files:**
- `src/pages/AuthPage.tsx` -- login/signup form
- `src/hooks/useAuth.ts` -- auth state, login, signup, logout
- `src/components/AuthGuard.tsx` -- route protection wrapper
- `src/components/RoleGuard.tsx` -- conditional rendering based on role
- `src/hooks/useUserRole.ts` -- fetch current user's role

**Changes:**
- `src/App.tsx` -- wrap routes with AuthGuard, add `/auth` route
- `src/components/AppSidebar.tsx` -- show user info, logout button, hide nav items based on role
- All pages -- conditionally disable write actions based on role

---

## 6. PDF Export for Invoices

**What it does:** Generate branded PDF invoices for download or email.

**New files:**
- `supabase/functions/generate-invoice-pdf/index.ts` -- edge function that fetches invoice data and generates PDF HTML, returns as PDF blob
- `src/components/InvoicePDFButton.tsx` -- button component that calls the edge function and triggers download

**Changes:**
- `src/pages/InvoiceDetail.tsx` -- add "Download PDF" button alongside existing Print button

---

## 7. Reporting & Analytics with Export

**What it does:** Date-range filtered reports for fleet utilization, revenue, and maintenance costs with CSV export.

**New files:**
- `src/pages/ReportsPage.tsx` -- date range picker + report type selector (Fleet Utilization, Revenue, Maintenance Costs)
- `src/components/reports/UtilizationReport.tsx` -- table + chart
- `src/components/reports/RevenueReport.tsx` -- table + chart
- `src/components/reports/MaintenanceCostReport.tsx` -- table + chart
- `src/lib/exportCsv.ts` -- utility to convert data arrays to CSV and trigger download

**Changes:**
- `src/App.tsx` -- add `/reports` route
- `src/components/AppSidebar.tsx` -- add "Reports" nav item

---

## 8. Damage Tracking Lifecycle

**What it does:** Link damage found during return inspections to maintenance work orders and chargeback invoices.

**Database:**
- New `damage_records` table: id, inspection_id, forklift_id, booking_id, customer_id, description, estimated_cost, actual_cost, status (reported/in_repair/repaired/invoiced), maintenance_log_id (nullable), invoice_id (nullable), created_at, updated_at

**New files:**
- `src/hooks/useDamageRecords.ts` -- CRUD hooks
- `src/pages/DamageTrackingPage.tsx` -- list of all damage records with status pipeline view
- `src/components/DamageActions.tsx` -- actions: "Create Maintenance Work Order" and "Create Chargeback Invoice"

**Changes:**
- `src/hooks/useReturnInspections.ts` -- on creating inspection with damage, auto-create damage_record
- `src/pages/ReturnInspectionPage.tsx` -- link to damage record from inspection rows
- `src/App.tsx` -- add `/damage` route
- `src/components/AppSidebar.tsx` -- add "Damage Tracking" nav item

---

## Implementation Order

The features will be built in this sequence to manage dependencies:

```text
Phase 1 (Foundation):
  5. Authentication & RBAC    -- required for security on all tables

Phase 2 (Core Business Logic):
  1. Quotation Module         -- no dependencies
  3. Booking Lifecycle         -- extends existing bookings
  2. Recurring Invoices        -- depends on booking lifecycle
  8. Damage Tracking           -- extends return inspections

Phase 3 (Output & Visibility):
  6. PDF Export                -- depends on invoices
  4. Activity Feed             -- depends on all entity types existing
  7. Reports & Export          -- depends on all data sources
```

## Summary

| Feature | New Files | DB Changes | Edge Functions |
|---------|-----------|------------|----------------|
| Quotations | 4 | 1 table + 1 function | No |
| Recurring Invoices | 1 | 2 columns | 1 (cron) |
| Booking Lifecycle | 1 | None | No |
| Activity Feed | 3 | 1 table + triggers | No |
| Auth & RBAC | 5 | 3 tables + function + policies | No |
| PDF Export | 2 | None | 1 |
| Reports & Export | 5 | None | No |
| Damage Tracking | 3 | 1 table | No |
| **Total** | **24** | **6 tables, 2 columns** | **2** |
