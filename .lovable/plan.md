

# Fix: Quote "sent" status showing as "Sin Pagar"

## Problem
`STATUS_LABELS` maps `sent` to `"Sin Pagar"` globally. This is correct for invoices but incorrect for quotes, where it should display `"Enviada"`.

## Solution
The `StatusBadge` component and the `QuotesPage` filter both rely on `STATUS_LABELS[status]`. Since we cannot have two meanings for the same key in a flat map, the fix is to override the label specifically in the quotes context:

**File: `src/pages/QuotesPage.tsx`**
- Define a local `QUOTE_STATUS_LABELS` that overrides `sent` → `"Enviada"` for the filter dropdown.

**File: `src/components/StatusBadge.tsx`** (or in QuotesPage directly)
- Pass a label override or render a custom badge in the quotes table/cards so that `sent` displays as `"Enviada"` instead of `"Sin Pagar"`.

Alternatively, the simplest approach: add a `labelOverride` or use a wrapper in `QuotesPage` that maps `sent` → `"Enviada"` before passing to `StatusBadge`, without changing the global constant (which invoices still need).

### Changes
1. **`src/pages/QuotesPage.tsx`**: Use a local label map for the status filter and render a custom StatusBadge that remaps `sent` to `"Enviada"` in both the table and mobile cards.

