# R2: customer invoice currency and return context

Base: `7ac56b7b904f79fdb0b194dbccd97d67f364273a`.

The customer summary RPC already returns each invoice's original `total`,
`currency` (from `invoices.moneda`) and `tipo_cambio`; see migration 0044,
`get_customer_summary`. No query, permissions, totals or database migration
changes are required for this block.

## Before

`before-tests.log`: four failures and three passing controls. The actual customer
invoice component omitted the currency; its original USD100/TC17.5 and MXN100
rows were indistinguishable as `$100.00`. After opening an invoice with mouse,
Enter or Space, the actual invoice header navigated to `/invoices?q=unrelated`
instead of the customer detail URL.

`before-list-tests.log`: two failures and four passing creation controls. The
actual desktop and mobile customer-opening callbacks did not capture the
customer list URL.

## After

- The invoice rows display explicit USD/MXN codes beside amounts formatted in
  that currency; USD100 remains 100, without applying TC17.5.
- Desktop/mobile customer navigation captures the exact customer list URL.
  Customer → invoice → Back restores the exact customer detail URL and only its
  validated customer-list context. A second Back restores the list's search,
  page, other query parameters and hash, even if another tab changes cached
  filters.
- Invoice-list return behavior remains intact. Only `/invoices` or the current
  invoice customer's UUID detail path can become invoice return targets, with
  query/hash suffixes allowed. External URLs, other customers, undefined IDs,
  nested detail paths, backslashes and control characters are rejected. Direct
  visits without state retain existing safe fallbacks and saved list filters.
- Facturas=none stays hidden; read stays informational; full retains mouse,
  Enter and Space activation. No permission rules change.

`after-tests.log`: **34/34 tests pass** across six files, including the six
regressions that failed before the change and the prior invoice navigation
tests. `lint.log` and `typecheck.log`: exit 0. `diff-check.log`: exit 0.

The routing regression mounts the real CustomerDetailPage,
CustomerInvoicesList, InvoiceDetailBody and DetailPageHeader with the native
TanStack memory router. Unrelated cards/data hooks are mocked with synthetic
data. The list-origin tests invoke the real CustomersPage desktop/mobile
callbacks. This is offline component/routing evidence, not GUI or backend QA.

## Commands

Temporary paths TEMP/TMP/TMPDIR were set to this worktree's `.tool-tmp`.

```text
node node_modules/vitest/vitest.mjs run src/features/customers/pages/__tests__/CustomerInvoiceNavigation.test.tsx --maxWorkers=1
node node_modules/vitest/vitest.mjs run src/features/customers/pages/__tests__/CustomersPage.creation.test.tsx --maxWorkers=1
node node_modules/vitest/vitest.mjs run src/features/customers/pages/__tests__/CustomerInvoiceNavigation.test.tsx src/features/customers/pages/__tests__/CustomersPage.creation.test.tsx src/features/invoices/components/invoice-detail/__tests__/InvoiceDetailNavigation.test.tsx src/features/invoices/pages/__tests__/InvoicesPage.navigation.test.tsx src/features/invoices/components/list/__tests__/InvoiceMobileCard.test.tsx src/components/layout/__tests__/DetailPageHeader.navigation.test.tsx --maxWorkers=1
node node_modules/eslint/bin/eslint.js <the nine changed source/test files>
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

No browser, published backend, transaction, external API, credentials, grants,
migration application, version/changelog change, PR, push or merge was used.
The integration owner runs the combined build/CI and creates the review PR.
