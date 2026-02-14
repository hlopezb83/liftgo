

# Change Default Tax Rate to 16% and Rename "Tax" to "VAT"

## Overview

Two changes across the application:
1. Every hardcoded default tax rate (currently 21%) becomes **16%**
2. Every user-facing label that says "Tax" becomes **"VAT"** (database column names stay unchanged)

---

## Files to Modify

### 1. `src/lib/config.ts`
- Change `DEFAULT_TAX_RATE` from `21` to `16`

### 2. `src/pages/InvoiceForm.tsx`
- Change default `taxRate` state from `0` to `16` (for new invoices)
- Rename the "Tax rate (%)" label to "VAT rate (%)"

### 3. `src/pages/QuoteForm.tsx`
- Change default `taxRate` state from `"21"` to `"16"`
- Rename "Tax Rate (%)" label to "VAT Rate (%)"
- Change `Tax ({taxRate}%)` display text to `VAT ({taxRate}%)`

### 4. `src/components/PostInspectionInvoiceDialog.tsx`
- Change default `taxRate` from `21` to `16`
- Rename "Tax %" label to "VAT %"
- Change `Tax ({taxRate}%)` display text to `VAT ({taxRate}%)`

### 5. `src/components/TotalsSummary.tsx`
- Change `Tax ({taxRate}%)` display text to `VAT ({taxRate}%)`

### 6. `src/components/InvoicePDFButton.tsx`
- Change PDF label from `Tax (...)` to `VAT (...)`

### 7. `supabase/functions/generate-recurring-invoices/index.ts`
- Change hardcoded `taxRate = 21` to `taxRate = 16`

### 8. `src/test/invoiceUtils.test.ts`
- Update test cases that use `21` as the tax rate to use `16` instead

---

## What stays the same

- Database column names (`tax_rate`, `tax_amount`, `tax_id`) remain unchanged -- these are internal identifiers
- The customer "Tax / VAT ID" label on the Customers page already mentions VAT, so no change needed there
- The `computeTotals` function in `invoiceUtils.ts` is rate-agnostic, no changes needed

