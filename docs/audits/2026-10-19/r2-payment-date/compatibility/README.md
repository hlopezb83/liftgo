# Compatibility review: invoice issue-date keyboard capture

The review found and dynamically reproduced an integration regression in the
first date-capture candidate, commit
`022c5610dec4692eca7ad69c7aa06220b005982d`.

The test mounts the real `InvoiceDetailsCard`, React Hook Form, its production
date adapter, `DatePickerField` and `MaskedDateInput`. It only mocks unrelated
customer/booking selectors and the next-invoice-number source. No browser,
backend, provider or financial transaction is involved.

## Comparable case

Fixed today: **19/10/2026**. Initial invoice issue date: **14/08/2026**.

| Step | Expected compatibility behavior | First candidate, observed | Scoped opt-in, observed |
| --- | --- | --- | --- |
| Type `1509`, before blur | Text `15/09`; RHF retains `2026-08-14` while capture is incomplete | Text `19/10/2026`; RHF becomes `2026-10-19` | Text `15/09`; RHF retains `2026-08-14` |
| Continue typing `2026` into the displayed text | Text `15/09/2026`; RHF becomes `2026-09-15` | Text and RHF remain today | Text `15/09/2026`; RHF becomes `2026-09-15` |

Before: **1 failing test, four failed assertions**. After: **the same unchanged
test passes**. The fixture validates both the displayed control and RHF's actual
stored value; it does not copy the adapter's implementation into a mock.

The regression occurred because the invoice issue-date adapter substitutes
`new Date()` for `undefined`. Emitting `undefined` for every partial keystroke
therefore made the controlled field rebound to today. The integration owner
scoped immediate partial invalidation behind `invalidateOnPartial`, defaulting
to false in the shared controls and enabled only by `RecordPaymentDialog`.
`InvoiceDetailsCard` and its adapter stay unchanged.

The isolated review added only
`src/features/invoices/components/invoices/__tests__/InvoiceDetailsCardMaskedDateCompatibility.test.tsx`
and this evidence directory. Product changes were made by the integration
owner. Lint of this new test exited 0; broader combined checks belong to the
integration owner.

```text
node node_modules/vitest/vitest.mjs run src/features/invoices/components/invoices/__tests__/InvoiceDetailsCardMaskedDateCompatibility.test.tsx --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=.tool-tmp/date-compat-review/{before,after}.json
```

The local machine logs/JSON remain in `.tool-tmp/date-compat-review/`.
`before.json` and `after.json` here retain synthetic results without private
filesystem paths. `manifest.json` records SHA-256 of UTF-8 text normalized to LF
for the test and the source files read after the scoped fix.
