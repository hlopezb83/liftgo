# Extension preview VAT and cached billing action

## Scope and baseline

Initial correction based on `c207bfbe6797e9ed3a0f672d01b5457050a76394`, now integrated
on `main` commit `2dfa028c2342a20e6cbeef9e18647c28a57f0809` after PR #407.
The race protection in the shared invoice handler is unchanged except for the
equivalent customer VAT helper extraction.
No database changes, migrations, fiscal issuance, payments, push, or deployment.

## Tax policy

The estimate previously always passed 16% to `computeTotals`, whereas extension
invoice prefill applied the customer's rate. The shared `customerTaxRate` helper
is extracted verbatim in behavior from invoice prefill: Number coercion, finite
nonnegative rates, explicit zero preserved, and undefined for missing/invalid
rates. It deliberately does not introduce a stricter rate whitelist or change
historic form behavior. Explicit customer selection retains its 16% default;
booking selection retains the current form tax when the customer has no rate.

The preview loads the specific customer through the existing `useCustomer` hook,
which reads the active `organization_customers` relation and takes its tax rate
rather than the global customer identity. It does not depend on the limited
customer list. The existing financial gate now also disables the customer query and estimate
for dispatcher, unknown, loading or failed role state, including cached data.
There is no change to the financial permission policy. Organization scope
still relies on that existing hook and server RLS; this change does not prove
live RLS configuration. Until the customer is available and its query is not
fetching or failed, the preview is absent rather than flashing a false 16%.
The dialog's existing message is neutral: no estimate available for the period.

Tests compare preview line items, period, currency, rate, subtotal, tax and total
with the actual extension query, prefill handlers and form totals for
0/8/16/null/undefined, including a customer absent from the initial list.
The transport and customer reads are synthetic. Tests also preserve the previous
booking-selection versus explicit-customer-selection fallback semantics.

## Customer detail and delayed prefill

Review reproduced a remaining mismatch when the invoice customer list did not
contain the extension customer: the estimate used its detail rate but the form
fell back to 16%. Extension prefill now resolves the same customer detail and
passes that verified customer to the existing selection handler. It no longer
waits for a nonempty list. Pending, paused, failed or unavailable detail blocks
submission through the existing availability guard and `validateSelection`.

A late prefill must not undo user intent. Form subscriptions track relevant
manual edits and reset; public customer and booking handlers explicitly mark
selection/clear events, including clearing an already-empty field. If editing
interrupts loading, prefill remains blocked and asks the user to reopen the
extension from its booking rather than overwriting their changes. Query retry
does not discard those changes. PR #407's booking-request protections remain.

The pre-existing per-mount prefill latch is unchanged: changing to a different
extension ID within the same mounted form is not addressed by this patch.
Tests use the actual financial gate and customer query with simulated transport
to verify no fiscal reads without access and organization-relation VAT winning
over a conflicting global customer identity. This is not live RLS validation.

## Reproduction of the cached-action window

The regression test mounts the production `BookingDetail`, `useBookingExtensions`
and `BookingExtensionsCard` with a real React Query client, but synthetic Supabase
responses. Seed cached extension data with no invoice, defer the network response,
and render the booking detail. On the baseline, the billing action is enabled
before a response reporting `pending_invoice_id` arrives. Fresh cached data is
also used without a request for up to the 60-second stale interval. Background
invalidation likewise leaves the action enabled during refetch.

Four test cases failed on the baseline: old cache, fresh cache, error/retry and
background invalidation. The correction forces verification on mount and blocks
the action until a request completes, while fetching or paused, and after a
failed check. Already-billed and pending-draft guards and the existing invoice
link remain intact. Retry is available with cached extension rows. A fifth test
covers offline pause and reconnection. Permission and recurring-billing visibility
are unchanged; this UI guard does not replace database concurrency protections.

This is deterministic component/query testing, not a browser test against a live
backend. The pre-existing empty-list early return still hides the card when no
extension rows are available; this correction targets the stale-row window.

## Verification

Toolchain: Node 26.13.0, Bun 1.4.4, `bun install --frozen-lockfile --ignore-scripts`.
The lockfile is unchanged (SHA-256
`3d434bb266707543383f5769cee4319a096783a8b24210b07df8ea308eab8bef`).

Commands for this change:

- `node node_modules/vitest/vitest.mjs run src/features/bookings src/features/invoices/hooks src/features/customers src/lib/domain/__tests__/invoiceTotals.test.ts src/lib/money --maxWorkers=4`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/eslint/bin/eslint.js . --max-warnings=0`
- `bash scripts/arch-check.sh`
- `node scripts/gen-version.mjs && node node_modules/vite/bin/vite.js build`

No real-browser or live-database verification is claimed. Generated release
metadata is only for local compilation; this is not a release or publication.
