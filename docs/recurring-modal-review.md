# Recurring invoice preview: review and release boundaries

## Requested behavior

- Omit already-invoiced and `booking_ended` informational rows from the recurring
  invoice dialog. Returns remain available from the booking actions; the removal
  is presentation-only and does not change return or booking eligibility guards.
- Future periods are an explicit per-opening opt-in with a month horizon. No
  period is selected automatically. A future month requires all earlier pending
  periods of that booking to be selected or already covered. Selection consisting
  only of past/current periods retains its previous independent behavior.
- Accepted cancellation of a predecessor reopens the gap. Pending fiscal
  cancellation, stamping and live drafts continue to occupy coverage.
- Failed batches are reviewed using a new preview, not retried with a consumed
  selection or stale commercial fingerprints.

## Coordinated implementation

The Edge planner subtracts actual invoice coverage instead of advancing from the
maximum billed date. It bounds emitted pending/review rows and preserves tenant,
date, exchange-rate, VAT, quotation-charge and role checks. Requests to anticipate
require exact booking/period selectors and matching server-produced fingerprints.
The preview is still read-only; creation still produces unstamped drafts.

The SQL candidate is described in `recurring-future-coverage.md`. It must be
reviewed and applied to the explicitly authorized target before the future-mode
Edge function or UI is released. Local passing tests are not evidence that a
connected database has been upgraded. The new coverage field is additive; the
cash-flow consumer refuses missing/ambiguous coverage instead of assuming the
maximum historical date proves contiguous billing.

## Known preexisting limitation: commercial data race

The preview fingerprint detects material changes before the generation request
rebuilds its plan. It is **not an atomic price or fiscal-data guarantee through
the final database insert**. The existing recurring RPC accepts its commercial
payload; its booking locks revalidate eligibility and coverage, not all prices,
exchange rates, equipment and recipient fields against an expected snapshot.

An isolated PostgreSQL reproduction produced the same result on the pre-change
0114 baseline and the 0125 candidate:

1. Session A holds the existing advisory lock for a booking.
2. Session B calls the recurring RPC with subtotal 100, currency MXN, exchange
   rate 1 and waits for A.
3. A changes the booking to monthly rate 6200, USD, exchange rate 20, then commits.
4. B completes using its original 100/MXN/1 payload.

The reproduction uses only the disposable cluster owned by
`scripts/tests/recurring-future-coverage.test.cjs`, with
`RECURRING_COVERAGE_BASELINE=1` for the baseline and without that setting for the
candidate. No connected database or operational invoice was used. This limitation
is outside this change's price-contract scope. A complete future fix needs an
expected-version/snapshot contract checked under the relevant database locks;
another read outside the transaction would not make it atomic.

## Browser acceptance remains a release gate

The synthetic fixture and scenarios are in
`tests/design-group-c/component/recurringFixture.tsx` and `recurring.spec.ts`.
They cover the hidden informational rows, one scroll area, action visibility,
future opt-in/reset and consecutive selection on desktop and narrow mobile sizes.

In the current executor Chromium failed before opening a page with
`socket() failed: Operation not permitted (1)`. The executable existed at
`/usr/bin/chromium`; an approved expanded execution returned the same environment
error. No browser scenario or screenshot was produced, and no further browser
attempts or alternate-environment workaround were made. Unit tests, typechecking
and a production bundle build do not replace this missing visual verification.

Do not publish based solely on the local unit/database results. Finish independent
review, normal CI/full-schema replay and permitted desktop/mobile acceptance,
verify the exact release identity, and obtain the required target-database
authorization before application/publication.
