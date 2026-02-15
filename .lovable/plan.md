

# Add Contracts and Payment Tracking Modules

## Overview

Two major gaps in the current ERP workflow:

1. **Contracts**: When a booking is confirmed, there is no formal rental agreement document. We will add a Contracts module that auto-generates a contract from a booking and lets users track its signature status.

2. **Payment Tracking**: Currently an invoice is either unpaid or fully paid. We need to support partial payments, security deposits, and an accounts receivable ledger that shows payment history per invoice.

---

## Part 1: Contracts / Rental Agreements

### Database

**`contracts` table:**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| contract_number | text NOT NULL | Auto-generated (CTR-0001) |
| booking_id | uuid | Links to the booking |
| customer_id | uuid | Links to the customer |
| forklift_id | uuid | Links to the forklift |
| start_date | date | Rental start |
| end_date | date | Rental end |
| daily_rate | numeric | Snapshot of rate |
| weekly_rate | numeric | Snapshot of rate |
| monthly_rate | numeric | Snapshot of rate |
| deposit_amount | numeric DEFAULT 0 | Required security deposit |
| terms_text | text | Free-form terms and conditions |
| status | text DEFAULT 'draft' | draft / sent / signed / cancelled |
| signed_at | timestamptz | When customer signed |
| signed_by | text | Who signed |
| created_at / updated_at | timestamptz | Auto-managed |
| notes | text | Optional |

A database function `next_contract_number()` will auto-generate sequential numbers (CTR-0001, CTR-0002...).

RLS: Admin and Dispatcher full access, Mechanic read-only.

### UI

- **Contracts list page** (`/contracts`): Table with filters by status, search by customer/contract number.
- **Contract detail page** (`/contracts/:id`): Shows all contract info, status badge, PDF download button, and actions (Mark Sent, Mark Signed, Cancel).
- **Generate from Booking**: A "Generate Contract" button on the booking detail (calendar page) that pre-fills a new contract with the booking data.
- **Contract PDF**: A "Download Contract PDF" button that generates a branded PDF with terms, rates, and signature lines using jsPDF (same pattern as InvoicePDFButton).

### New files
- `src/pages/ContractsPage.tsx` -- List page
- `src/pages/ContractDetail.tsx` -- Detail/view page
- `src/pages/ContractForm.tsx` -- Create/edit form
- `src/hooks/useContracts.ts` -- CRUD hooks
- `src/components/ContractPDFButton.tsx` -- PDF generation

### Modified files
- `src/components/AppSidebar.tsx` -- Add "Contracts" nav item
- `src/App.tsx` -- Add routes
- Database migration -- Create table, function, and RLS policies

---

## Part 2: Payment Tracking

### Database

**`payments` table:**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| invoice_id | uuid NOT NULL | Links to the invoice |
| amount | numeric NOT NULL | Payment amount |
| payment_date | date NOT NULL DEFAULT CURRENT_DATE | When payment was received |
| payment_method | text | cash / transfer / check / card |
| reference_number | text | Bank reference or check number |
| notes | text | Optional |
| created_at | timestamptz | Auto-managed |

RLS: Admin and Dispatcher full access, Mechanic read-only.

### Logic changes

- **Invoice balance**: Instead of a binary paid/unpaid status, calculate `balance = total - sum(payments)`.
- **Auto-status update**: When a payment is recorded that brings balance to zero, automatically mark the invoice as "paid" and set `paid_at`.
- **Partial payment support**: Invoices with payments but remaining balance show status "partial".

### UI changes

**Invoice Detail page** (modify `InvoiceDetail.tsx`):
- Add a "Payments" section below the totals showing a table of all recorded payments.
- Add a "Record Payment" button that opens a dialog to enter amount, date, method, and reference.
- Show "Balance Due" prominently: `total - sum(payments)`.
- Pre-fill the payment amount with the remaining balance.

**Invoices list page** (modify `InvoicesPage.tsx`):
- Add "partial" to the status filter tabs.
- Show balance column alongside total.

### New files
- `src/hooks/usePayments.ts` -- Query payments by invoice, create payment mutation
- `src/components/RecordPaymentDialog.tsx` -- Dialog for recording a payment

### Modified files
- `src/pages/InvoiceDetail.tsx` -- Add payments section and record button
- `src/pages/InvoicesPage.tsx` -- Add "partial" tab, balance column

---

## Implementation Sequence

1. Database migration: Create `contracts` and `payments` tables with RLS and helper functions
2. Create `useContracts.ts` and `usePayments.ts` hooks
3. Build Contracts pages (list, detail, form) and PDF button
4. Add payment recording to Invoice Detail
5. Update Invoice list with partial status and balance
6. Update sidebar and routing

---

## Technical Details

### Database migration SQL summary

- `contracts` table with auto-increment contract number function
- `payments` table with invoice foreign key
- RLS policies matching existing patterns (admin/dispatcher full, mechanic read)
- `updated_at` trigger on contracts
- Add "partial" as a recognized invoice status in the workflow

### Routing additions

| Route | Component | Roles |
|-------|-----------|-------|
| /contracts | ContractsPage | admin, dispatcher |
| /contracts/new | ContractForm | admin, dispatcher |
| /contracts/:id | ContractDetail | admin, dispatcher |
| /contracts/:id/edit | ContractForm | admin, dispatcher |

### Sidebar addition

- "Contracts" nav item with a `FileText` (or `ScrollText`) icon, positioned between "Quotes" and "Deliveries" in the navigation order.

