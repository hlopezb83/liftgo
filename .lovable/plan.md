

## Localization Fixes Plan

Three remaining issues to address:

### 1. RevenueReport -- Spanish month labels
**File:** `src/components/reports/RevenueReport.tsx`
- Import `es` from `date-fns/locale`
- Pass `{ locale: es }` to the `format()` call on line 24 so month abbreviations render as "Ene", "Feb" instead of "Jan", "Feb"

### 2. Contract PDF -- Currency formatting
**File:** `src/lib/contractPdfGenerator.ts`
- Import `formatCurrency` from `@/lib/formatCurrency`
- Replace `.toFixed(2)` on lines 62, 65, 66, 67 with `formatCurrency()`
- Replace `.toLocaleString(...)` on line 68 with `formatCurrency()`
- Affects: `tarifa_extra`, `tarifa_diaria`, `tarifa_semanal`, `tarifa_mensual`, `deposito`

### 3. PDF Helpers -- Eliminate duplicate formatter
**File:** `src/lib/pdfHelpers.ts`
- Remove the `fmtMXN` function (lines 22-26)
- Import `formatCurrency` from `@/lib/formatCurrency`
- Replace all `fmtMXN()` calls with `formatCurrency()` (lines 126, 127, 174, 178, 189)

**File:** `src/components/QuotePDFButton.tsx`
- Remove `fmtMXN` from the import (unused in file body, but imported)

**File:** `src/components/InvoicePDFButton.tsx`
- Remove `fmtMXN` from the import (unused in file body, but imported)

### Items already done (no action needed)
- Calendar Spanish locale -- already applied
- CashFlowChart Euro symbols -- already fixed

