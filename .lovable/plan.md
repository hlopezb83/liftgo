

# Invoicing Module

## Overview
Add a complete invoicing system that generates invoices from completed bookings, calculates rental costs using forklift rate cards (daily/weekly/monthly), and tracks payment status.

## Database

### New `invoices` table
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| invoice_number | text | not null | Auto-generated (e.g. INV-0001) |
| booking_id | uuid | nullable | FK to bookings |
| customer_id | uuid | nullable | FK to customers |
| customer_name | text | nullable | Denormalized for display |
| line_items | jsonb | '[]' | Array of {description, quantity, unit_price, total} |
| subtotal | numeric | 0 | Sum of line items |
| tax_rate | numeric | 0 | Percentage (e.g. 21) |
| tax_amount | numeric | 0 | Computed from subtotal x rate |
| total | numeric | 0 | subtotal + tax_amount |
| status | text | 'draft' | draft / sent / paid / overdue |
| issued_at | date | CURRENT_DATE | |
| due_date | date | nullable | |
| paid_at | date | nullable | |
| notes | text | nullable | |
| created_at | timestamptz | now() | |
| updated_at | timestamptz | now() | |

RLS: Public access (matching existing pattern -- no auth yet).

### Database function: `next_invoice_number()`
A simple SQL function that returns the next sequential invoice number formatted as `INV-XXXX`.

## Rate Calculation Utility

A client-side utility function `calculateRentalCost(dailyRate, weeklyRate, monthlyRate, days)` that finds the optimal price combination:
- Use monthly rate for every full 30-day block
- Use weekly rate for every full 7-day block of the remainder
- Use daily rate for leftover days
- Falls back gracefully when a rate is zero/null

## New Files

### `src/lib/invoiceUtils.ts`
- `calculateRentalCost()` -- rate optimization function
- `generateLineItems()` -- takes a booking + forklift and produces the line_items array

### `src/pages/InvoicesPage.tsx`
List view with:
- Status filter tabs (All / Draft / Sent / Paid / Overdue)
- Search by invoice number or customer name
- Table: Invoice #, Customer, Total, Status, Issued, Due, Actions
- "New Invoice" button
- Uses `PageHeader`, `TableSkeleton`, `EmptyRow` shared components

### `src/pages/InvoiceForm.tsx`
Create/edit form:
- Select a booking to auto-populate customer and calculate line items
- Editable line items table (add/remove rows, adjust quantities and prices)
- Tax rate input with live total calculation
- Due date picker, notes field
- Uses `DatePickerField`, `FormActions` shared components

### `src/pages/InvoiceDetail.tsx`
Read-only invoice view:
- Clean invoice layout suitable for printing (print button)
- Header with invoice number, dates, status
- Customer details block
- Line items table with subtotal/tax/total
- Status actions: Mark as Sent, Mark as Paid

### `src/hooks/useForkliftData.ts` (additions)
- `useInvoices()` -- list all invoices with optional status filter
- `useInvoice(id)` -- single invoice
- `useCreateInvoice()` -- insert mutation
- `useUpdateInvoice()` -- update mutation (status changes, edits)

## Routing and Navigation

Add to `AppSidebar.tsx`:
- "Invoices" nav item with `Receipt` icon, url `/invoices`

Add to `App.tsx`:
- `/invoices` -- InvoicesPage
- `/invoices/new` -- InvoiceForm
- `/invoices/:id` -- InvoiceDetail
- `/invoices/:id/edit` -- InvoiceForm

## Dashboard Integration

Add a small stat card to the Dashboard showing outstanding invoice value (sum of unpaid invoices).

## Technical Details

### Line items JSON structure
```json
[
  { "description": "Forklift X rental: 2 weeks", "quantity": 2, "unit_price": 500, "total": 1000 },
  { "description": "Forklift X rental: 3 days", "quantity": 3, "unit_price": 85, "total": 255 },
  { "description": "Delivery fee", "quantity": 1, "unit_price": 150, "total": 150 }
]
```

### Rate calculation example
For a 17-day rental with daily=85, weekly=500, monthly=1800:
- 0 months (17 < 30)
- 2 weeks (14 days) = 1000
- 3 days remaining = 255
- Total: 1255

### Invoice number generation (DB function)
```sql
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$
  SELECT 'INV-' || lpad((coalesce(max(
    nullif(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '')::int
  ), 0) + 1)::text, 4, '0')
  FROM invoices;
$$;
```

### Status badge colors
- draft: gray
- sent: blue
- paid: green
- overdue: red
