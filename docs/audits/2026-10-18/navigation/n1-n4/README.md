# N1 / N4 evidence

Audited base: `ec177edf865671a9e9952f5cccd56a9db687f0bd`.

| Finding | Before | After |
| --- | --- | --- |
| N1: invoice return | Opening a desktop row/mobile card loses the list origin. Detail return uses only cached filters; the invoices filter hook does not populate that cache. | Desktop and mobile history entries retain the exact originating invoice URL. Return prefers that origin, including an unfiltered list, and validates that it belongs to `/invoices`. Direct entries retain the session fallback, now populated by invoice filters. |
| N4: terminal booking status | Completed/cancelled/unknown states expose an enabled status action despite having zero canonical transitions. | The action remains keyboard accessible with an explicit reason and `aria-disabled`; selecting it opens no dialog. Confirmed booking behavior and deletion remain intact. No transitions were added. |

## Comparable offline regression run

`before-tests.log`: **10 failed, 22 passed**, all six test files executed before production changes.

`after-tests.log`: **32 passed**, same six files and assertions.

```powershell
$env:TEMP = Join-Path (Get-Location) '.tmp-tests-n1-n4'
$env:TMP = $env:TEMP
node node_modules/vitest/vitest.mjs run `
  src/components/layout/__tests__/DetailPageHeader.navigation.test.tsx `
  src/features/invoices/hooks/invoices/__tests__/useInvoicesFilters.test.tsx `
  src/features/invoices/components/invoice-detail/__tests__/InvoiceDetailNavigation.test.tsx `
  src/features/invoices/components/list/__tests__/InvoiceMobileCard.test.tsx `
  src/features/invoices/pages/__tests__/InvoicesPage.navigation.test.tsx `
  src/features/bookings/components/bookings/__tests__/BookingActions.v09.test.tsx `
  --maxWorkers=2
```

The source cases cover full origin filters (`q`, `status`, `cfdi`, `from`, `to`), explicit unfiltered origin, changed session cache, missing/untrusted origin, persistence/clear, desktop/mobile links, completed/cancelled/unknown status, existing confirmed actions, focus return, and deletion.

Scoped ESLint checked all 12 changed code/test files. Typecheck and broader navigation checks are owned by the navigation integrator; build is owned by the parent integration task. No browser, network, account, permission, database, migration, deploy, or merge action was performed for this block.

An initial sandbox temporary-directory rename failure was avoided by assigning TEMP/TMP inside this worktree. A transient dependency lstat failure disappeared after dependency installation finished; the authoritative baseline and final run both executed all six suites. `before-invoice-origin.log` is an additional earlier reproduction, not the authoritative aggregate.
