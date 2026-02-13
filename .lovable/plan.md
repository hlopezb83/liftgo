
# Enhance Customer Form

## What changes
Add four new fields to the customer record and improve the form layout for a more complete CRM experience.

### New fields

| Field | Column name | Type | Required |
|---|---|---|---|
| Tax / VAT ID | `tax_id` | text | No |
| Website | `website` | text | No |
| Contact Person | `contact_person` | text | No |
| Billing Address | `billing_address` | text | No |

### Database
A migration adds the four new nullable text columns to the `customers` table. No data is lost -- existing rows simply get `NULL` for the new fields.

### Customer form dialog (`CustomersPage.tsx`)
The dialog form is reorganized into logical groups:
- **Identity**: Name (required), Company, Tax/VAT ID
- **Contact**: Contact Person, Email, Phone, Website
- **Addresses**: Address, Billing Address
- **Internal**: Notes (converted to a textarea for longer text)

### Customer table
The table stays focused on the key columns (Name, Company, Email, Phone) to avoid clutter. The new fields are visible when editing a customer.

### Data hooks
The `useCreateCustomer` and `useUpdateCustomer` mutations in `useForkliftData.ts` are updated to include the four new fields in their payloads.

## Technical details

### Files modified
- **Database migration** -- `ALTER TABLE customers ADD COLUMN` for `tax_id`, `website`, `contact_person`, `billing_address`
- **`src/hooks/useForkliftData.ts`** -- update create/update mutation payloads to include new fields
- **`src/pages/CustomersPage.tsx`** -- expand the form state, add input fields in a grouped layout, and pass new fields through to mutations
