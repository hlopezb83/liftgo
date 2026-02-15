
# Customer Portal (Self-Service)

## Overview

Add a separate, publicly accessible portal where your customers can log in with their own credentials and view their rental data -- active bookings, contracts, invoices, and payment history. They will NOT share the same login system as your internal staff; instead, each customer record gets linked to a dedicated auth account with a new "customer" role.

---

## How It Works

The portal reuses the same authentication system but introduces a **fourth role**: `customer`. When a customer logs in, the `AuthGuard` detects their role and routes them to a completely separate layout (no sidebar, no admin tools) -- a clean, read-only dashboard showing only their own data.

```text
+------------------+          +---------------------+
|   Staff Login    |          |  Customer Login     |
|  (admin/disp/    |          |  (portal/login)     |
|   mechanic)      |          |                     |
+--------+---------+          +---------+-----------+
         |                              |
    role: admin/                   role: customer
    dispatcher/mechanic                 |
         |                              |
    Full ERP App               Customer Portal
    (sidebar + all pages)      (read-only dashboard)
+--------+---------+          +---------+-----------+
| Fleet, Invoices, |          | My Rentals          |
| Contracts, etc.  |          | My Invoices         |
|                  |          | My Contracts        |
|                  |          | Download PDFs       |
+------------------+          +---------------------+
```

---

## What Changes

### 1. Database

**Add `customer` to the `app_role` enum:**
- Extend the existing enum: `ALTER TYPE app_role ADD VALUE 'customer';`

**Link customers to auth accounts -- add column to `customers`:**
- `user_id` (uuid, nullable, references auth.users) -- when set, this customer has portal access

**RLS policies for customer role:**
- Customers can SELECT their own rows from `bookings`, `invoices`, `contracts`, `payments`, `deliveries` where `customer_id` matches their linked customer record
- A helper function `get_customer_id_for_user(uuid)` returns the customer.id for a given auth user_id

### 2. Customer Invitation Flow (Admin UI)

On the **Customer Detail page**, add an "Invite to Portal" button:
1. Admin enters the customer's email
2. System creates a Supabase auth account (via edge function using service role key)
3. Assigns the `customer` role to that account
4. Links the `customers.user_id` to the new auth user
5. Sends a password reset email so the customer can set their password

This is done via an edge function (`invite-customer`) since creating accounts on behalf of others requires the service role key.

### 3. Auth Routing

**Modify `AuthGuard.tsx`:**
- After login, check the user's role
- If role is `customer`, render the `CustomerPortalLayout` instead of the main ERP layout
- Internal users continue to see the full ERP as before

**New portal routes** (all under `/portal/`):
| Route | Component | Description |
|-------|-----------|-------------|
| /portal | PortalDashboard | Summary: active rentals, outstanding invoices |
| /portal/rentals | PortalRentals | List of bookings with status |
| /portal/invoices | PortalInvoices | List of invoices with download |
| /portal/invoices/:id | PortalInvoiceDetail | Invoice detail + payment history |
| /portal/contracts | PortalContracts | List of contracts with PDF download |

### 4. Portal UI

**CustomerPortalLayout** -- a minimal layout with:
- A top header bar with company logo, customer name, and logout button
- No sidebar (clean, simple interface)
- Navigation tabs: Dashboard | Rentals | Invoices | Contracts

**PortalDashboard:**
- Card: Active Rentals count + list of current bookings
- Card: Outstanding Balance (sum of unpaid invoices)
- Card: Recent Invoices (last 5)

**PortalRentals:**
- Table showing all bookings: forklift name, dates, status
- Read-only (no edit/cancel ability)

**PortalInvoices:**
- Table: invoice number, date, total, balance, status
- Click to view detail
- "Download PDF" button per invoice

**PortalInvoiceDetail:**
- Full invoice details with line items
- Payment history table
- Download PDF button

**PortalContracts:**
- Table: contract number, dates, status
- "Download PDF" button per contract

### 5. Edge Function: `invite-customer`

- Accepts: `customer_id`, `email`
- Uses service role key to create auth user
- Inserts `customer` role into `user_roles`
- Updates `customers.user_id`
- Sends password reset email
- Returns success/error

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/invite-customer/index.ts` | Edge function to create customer auth account |
| `src/layouts/CustomerPortalLayout.tsx` | Minimal portal shell (header + tabs) |
| `src/pages/portal/PortalDashboard.tsx` | Customer dashboard |
| `src/pages/portal/PortalRentals.tsx` | Bookings list |
| `src/pages/portal/PortalInvoices.tsx` | Invoices list |
| `src/pages/portal/PortalInvoiceDetail.tsx` | Invoice + payments detail |
| `src/pages/portal/PortalContracts.tsx` | Contracts list |
| `src/hooks/useCustomerPortal.ts` | Hook to fetch the customer record linked to current auth user |

## Files to Modify

| File | Change |
|------|--------|
| DB migration | Add `customer` to enum, add `user_id` to customers, RLS policies |
| `src/App.tsx` | Add portal routes |
| `src/components/AuthGuard.tsx` | Route customer-role users to portal layout |
| `src/pages/CustomerDetailPage.tsx` | Add "Invite to Portal" button |
| `src/hooks/useUserRole.ts` | Add `customer` to AppRole type |

---

## Technical Details

### RLS Helper Function

```sql
CREATE OR REPLACE FUNCTION get_customer_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM customers WHERE user_id = p_user_id LIMIT 1;
$$;
```

### Customer RLS Policy Example (invoices)

```sql
CREATE POLICY "Customers read own invoices"
ON invoices FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'customer') AND
  customer_id = get_customer_id_for_user(auth.uid())
);
```

This pattern repeats for bookings, contracts, payments, and deliveries.

### Security Considerations

- Customer accounts can ONLY read data -- no INSERT, UPDATE, or DELETE
- Data is scoped to their own customer_id via RLS
- The invite edge function uses the service role key (already available as a secret)
- Customers cannot access any internal ERP routes; the AuthGuard redirects them to `/portal`
- Internal users cannot accidentally get the `customer` role (invitation is admin-controlled)

### Implementation Sequence

1. Database migration: extend enum, add `user_id` column, create helper function, add RLS policies
2. Create `invite-customer` edge function
3. Build portal layout and pages
4. Modify AuthGuard for role-based routing
5. Add invitation button to CustomerDetailPage
6. Update AppRole type
