# R2: extension invoice currency

Audited base: `7ac56b7b904f79fdb0b194dbccd97d67f364273a`.

The regression uses the production `useBookingExtension` query, `useExtensionPrefill`, React Hook Form state, invoice form handlers, line builder, totals and validation schema. Only Supabase transport and notifications are mocked. A generic nested SELECT projection prevents the transport mock from returning booking columns that the query did not request. A separate complete-response case isolates the prefill omission from the query omission.

The synthetic source booking is USD at FX 17.5, with an agreed daily rate of 100 and two extension days. The expected form is USD/17.5 with `2 × 100 = 200`; the rate and total are not converted or changed. The baseline omitted `currency` and `tipo_cambio` from the query and left prior form currency/FX untouched even with a complete response.

The fix includes both source columns and invokes the existing `applyPrimaryCurrency` used by normal booking selection. Its existing rule stays unchanged: normalize currency, use MXN/1 for domestic or missing currency, inherit finite positive foreign FX, and otherwise use 0 so validation blocks submission. Foreign FX 1 remains rejected by the existing schema. The helper's parameter accepts just the two currency fields while retaining compatibility with full booking objects.

## Evidence

- `before.json` / `before.txt`: the new regression suite against unmodified product code at the audited base; 12 failures and 3 passing guard controls.
- `after.json` / `after.txt`: the same regression suite plus related invoice form and extension tests after the fix.
- `comparison.json`: identical regression names and statuses before/after, plus validation results and source file hashes.
- `lint.txt` / `types.txt`: validation output (empty output means no diagnostics; exit codes are in `comparison.json`).

Controls cover MXN and missing currency, normalization, invalid foreign FX, placeholder FX 1, waiting for customers, preserving later manual edits, edit mode, already invoiced extensions, and extensions with no billable days. Assertions also preserve the extended billing period, customer/booking linkage, numeric agreed rates, and totals.

Run the regression with `node node_modules/vitest/vitest.mjs run src/features/invoices/hooks/__tests__/useExtensionPrefill.currency.test.tsx --maxWorkers=1`. The related run adds `src/features/invoices/hooks/invoiceForm/__tests__`, `src/features/bookings/hooks/__tests__/useBookingExtensions.test.ts` and `src/features/bookings/lib/__tests__/extensionBilling.test.ts`. On this Windows host, TEMP/TMP/TMPDIR point to the worktree's ignored `.tool-tmp` directory.

This evidence is offline and synthetic. No browser, published backend, Facturapi, permissions, migration or live data was used. GUI QA and deployment are outside this block.
