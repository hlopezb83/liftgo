

# Production Readiness Plan for ForkliftERP

This plan covers everything needed to take the current MVP to a production-grade application, organized by priority.

---

## Phase 1: Security Hardening (Critical)

The biggest blocker for production is that **all 13 data tables have wide-open security policies** (`USING (true)` / `WITH CHECK (true)`). Any authenticated user can read, modify, or delete any record. This must be fixed before going live.

### 1A. Lock down database policies

Replace the permissive "allow everything" policies on all tables with role-aware rules using the existing `has_role()` function. The approach:

- **Admins**: Full CRUD on all tables
- **Dispatchers**: Full CRUD on bookings, customers, invoices, quotes, deliveries, return inspections, damage records
- **Mechanics**: Read-only on most tables; full CRUD on maintenance_logs and status_logs

Tables affected: `forklifts`, `bookings`, `customers`, `invoices`, `quotes`, `deliveries`, `maintenance_logs`, `status_logs`, `return_inspections`, `damage_records`, `equipment_models`, `documents`, `activity_feed`

### 1B. Enforce RoleGuard on routes

The `RoleGuard` component exists but is never used. Wrap route groups so mechanics cannot access invoices/quotes pages, and dispatchers cannot access equipment config.

### 1C. Add a user management screen (admin only)

Admins need a way to view users and assign roles without direct database access. A simple table showing profiles + role with an edit dropdown.

---

## Phase 2: Data Integrity & Error Handling

### 2A. Wrap multi-table mutations in database functions

Several operations modify multiple tables without transactions:
- **Create Booking**: inserts booking, updates forklift status, inserts status_log -- if step 2 or 3 fails, data is inconsistent
- **Delete Forklift**: deletes status_logs, maintenance_logs, bookings, then forklift
- **Return Inspection**: inserts inspection, updates booking return_status, updates forklift status

Create server-side database functions (RPC) that wrap these in a single transaction.

### 2B. Add global error boundary

There is no React error boundary. A crash in any component takes down the entire app. Add an `ErrorBoundary` component wrapping the route content.

### 2C. Add `onError` handlers to all mutations

Most mutations (create booking, create maintenance log, create inspection) silently fail. Add `onError` callbacks with user-facing toast messages.

---

## Phase 3: Performance & Scalability

### 3A. Move to server-side pagination

The current client-side pagination fetches all rows then slices in the browser. For production with hundreds or thousands of records, this needs database-level `LIMIT`/`OFFSET` with count queries. Affected pages: Fleet, Invoices, Quotes, Customers, Maintenance, Deliveries, Damage Tracking.

### 3B. Fix the calendar O(n x m) rendering

`CalendarPage` runs `bookings.find()` for every cell (forklifts x days). With 50 forklifts and 31 days, that is 1,550 array scans per render. Pre-index bookings by forklift ID into a `Map<string, Booking[]>` to make lookups O(1).

### 3C. Add database indexes

Add indexes on frequently queried columns:
- `bookings(forklift_id)`
- `bookings(customer_id)`
- `invoices(customer_id)`
- `invoices(booking_id)`
- `maintenance_logs(forklift_id)`
- `status_logs(forklift_id)`
- `damage_records(forklift_id)`

### 3D. Add foreign key constraints

Currently no foreign keys exist between tables (e.g., `bookings.forklift_id` does not reference `forklifts.id`). This means orphaned records can accumulate. Add proper FK constraints with `ON DELETE` rules.

---

## Phase 4: UX Polish

### 4A. Add loading and empty states consistently

Some pages show `<Skeleton>` during load, others show nothing. Standardize all pages to use `<TableSkeleton>` for tables and card skeletons for detail pages.

### 4B. Add form validation with Zod

Forms currently use basic `if (!field)` checks. Use `react-hook-form` + `zod` (both already installed) for proper validation with inline field errors. Priority forms: BookingForm, InvoiceForm, QuoteForm, ForkliftForm.

### 4C. Add confirmation dialogs for destructive actions

Only ForkliftDetail has a delete confirmation. Add similar dialogs for:
- Canceling a booking
- Deleting an invoice
- Updating damage status to "invoiced"

### 4D. Make the app responsive

The calendar and data tables overflow on mobile. Add responsive layouts:
- Collapse tables to card views on small screens
- Make the sidebar default to collapsed on mobile
- Stack form fields vertically on narrow viewports

### 4E. Add dark mode toggle

The CSS already defines a full `.dark` theme but there is no toggle to activate it. Add a theme switcher in the sidebar footer using the installed `next-themes` package.

---

## Phase 5: Operational Features

### 5A. Add CSV/PDF export

`exportCsv.ts` exists but is never used. Wire it up to Fleet, Invoices, Customers, and Maintenance tables with an "Export" button.

### 5B. Add audit trail visibility

The `activity_feed` table and `log_activity()` trigger exist but the triggers are not attached to any tables. Attach the trigger to key tables (bookings, invoices, forklifts, maintenance_logs) so the Activity page actually shows data.

### 5C. Add password reset flow

The auth page has sign-in and sign-up but no "Forgot password?" link. Add a password reset request form using the built-in auth capabilities.

### 5D. Add email notifications via backend functions

Create backend functions for:
- Invoice overdue reminders (triggered by a scheduled function)
- Booking confirmation emails
- Maintenance due alerts

---

## Phase 6: Code Quality

### 6A. Remove remaining `as any` casts

Found in:
- `InvoiceForm.tsx` lines 86, 100 (`line_items as any`)
- `ReturnInspectionPage.tsx` lines 106-107 (`ins as any`)
- `generate-recurring-invoices` edge function (`forklift as any`)

Fix by defining proper types for JSONB fields and using typed joins.

### 6B. Add automated tests

The project has `vitest` configured but only a placeholder test. Add:
- Unit tests for utility functions (`formatCurrency`, `exportCsv`, `invoiceUtils`)
- Integration tests for key hooks (`useBookings`, `useInvoices`)
- Component tests for critical forms

### 6C. Add environment-based configuration

Hardcoded values like tax rate (21%), currency (EUR), and page size (25) should be moved to a configuration file or environment variables so they can be customized per deployment.

---

## Implementation Priority

| Priority | Phase | Effort | Impact |
|----------|-------|--------|--------|
| 1 (do first) | Phase 1: Security | High | Blocks production launch |
| 2 | Phase 2: Data Integrity | Medium | Prevents data corruption |
| 3 | Phase 3A-3B: Performance | Medium | Required at scale |
| 4 | Phase 4B, 4C: Validation | Medium | User trust |
| 5 | Phase 5B, 5C: Audit + Auth | Low | Operational needs |
| 6 | Phase 4D, 4E: Responsive + Dark | Low | Polish |
| 7 | Phase 6: Code Quality | Low | Long-term maintenance |

---

## Technical Summary

| Area | Current State | Production Target |
|------|--------------|-------------------|
| RLS Policies | 13 tables with `USING (true)` | Role-scoped per table |
| Route Protection | `RoleGuard` unused | Applied to all route groups |
| Transactions | Multi-table writes without TX | Database RPCs with transactions |
| Error Handling | No error boundary, sparse `onError` | Global boundary + all mutations handled |
| Pagination | Client-side (all rows fetched) | Server-side with `LIMIT`/`OFFSET` |
| Foreign Keys | None defined | All relationships constrained |
| Indexes | None beyond primary keys | On all FK columns |
| Form Validation | Manual `if` checks | Zod schemas with inline errors |
| Tests | 1 placeholder test | Utilities + hooks + critical forms |
| Type Safety | Several `as any` casts | Zero `any` usage |

Would you like me to start with Phase 1 (Security Hardening)?

