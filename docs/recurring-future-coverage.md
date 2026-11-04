# Candidate 0125: safe recurring future coverage

This migration is prepared and tested locally. It has **not been applied to a
connected/production database**. Do not release the future-period UI/Edge behavior
until the migration and coordinated projection changes have been reviewed and the
user has authorized the target database application.

## Changes

- Keep the existing recurring RPC signature, grants, tenant scope, eligibility
  checks, ordered advisory locks and booking row locks. Under those locks reject
  partial overlaps and unknown/invalid live historical dates before exact-period
  idempotency/group-collision handling.
- Before creating a future period (start after today's Monterrey date), verify
  the union of active historical coverage contains the full contractual prefix
  before that period. Keep past/current periods independently selectable and
  exact-period reuse idempotent. Cancelling an earlier invoice reopens a gap and
  blocks additional future creation until that gap is repaired.
- Serialize predecessor cancellation, date/link changes, deletion and pivot
  removal with future creation using the same ordered try-lock protocol. An
  interrupted/rolled-back predecessor creation never counts as valid coverage.
- Guard new confirmed-recurring coverage through direct invoice and grouped pivot
  writes as well, using the same lock key. Row triggers use try-lock and `55P03`,
  never wait while owning a tuple; new coverage at stronger snapshot isolation
  fails with `40001`. Completed-booking actual-return rules are unchanged.
- On creation/reuse recompute `bookings.last_billed_date` from the maximum valid
  active historical end for each booking, across direct and pivot relations. A
  backfilled/reused old period can no longer lower the maximum. This is an
  informational cache, **not proof of contiguous coverage**. Other lifecycle
  writers may leave it stale until the next recurring save, so no planner or
  projection may infer missing periods from this field.
- Extend `get_cash_flow_recurring_bookings()` with `billing_coverage`, always an
  array of `{periodStart, periodEnd}`. One invoice linked both ways appears once.
  Drafts with NULL CFDI status and pending fiscal cancellations remain active;
  accepted cancellation releases coverage. Unknown dates remain NULL for explicit
  review. Preserve SECURITY INVOKER, existing ACLs and current amount/tax fields.
- No data backfill, deletion, new caller grant, fiscal provider action or deployment.

## Coordinated application behavior

Edge planning must find actual missing monthly periods, not start after MAX(end).
The cash-flow consumer must exclude covered periods individually and refuse
unknown/partial coverage instead of projecting full months on top of invoices.
The 24-item bound must not repeatedly consume already-covered history and hide
later pending periods. Treat absent `billing_coverage` as an unverified rollout,
not as an empty history. Show the maximum period as information, not "next invoice".

New coverage is deliberately conservative: historical overlaps/unknown dates must
be reviewed. A legacy invoice's unchanged notes/state edit is allowed, but a save
path that deletes/reinserts its booking pivots may be rechecked and blocked if
historical overlapping/unknown coverage exists. Pure additional-charge invoices
linked to the same recurring booking also claim coverage under this model; no
exception is invented for them here.

The SQL still accepts arbitrary valid contractual date ranges for authorized
manual invoice workflows. The explicit future-mode/horizon and monthly selection
rules belong to the Edge/UI request contract; the database independently enforces
future-only predecessor continuity using the current Monterrey date. This candidate does not broaden
cron generation, recipients, account permissions or production authorization.

## Local validation

The test owns a fresh PostgreSQL cluster on loopback and accepts no database URL:

    RUN_LOCAL_RECURRING_TESTS=1 PG_BIN=/trusted/postgresql/bin \
      node scripts/tests/recurring-future-coverage.test.cjs

Verified with PostgreSQL 17.11: 52 PASS, including the 18 existing recurring-lock
regressions. Additional cases cover direct/pivot/manual overlaps, unknown and
invalid legacy dates, out-of-order backfill/reuse, active maximum after
cancellation, concurrent manual↔recurring writes and rollback, fiscal cancellation
reactivation, isolation failure, coverage gaps/deduplication, NULL-CFDI drafts,
unknown-date disclosure, unchanged ACL/SECURITY INVOKER and caller RLS. Ten
additional future-sequence cases cover first/intermediate gaps, per-booking group
prefixes, contiguous partial-range unions, direct/pivot bypass attempts, cancelled
predecessor repair, exact reuse despite gaps, and concurrent predecessor
cancellation/removal/rollback.

The fixture installs both the 0107 helper definition and its real EXECUTE
revocations. INVOKER functions inline the same active-document CASE predicate;
they never call the private helper, gain grants, or become SECURITY DEFINER.
Authenticated tests exercise unlinked/non-recurring invoices, recurring direct
inserts/updates/cancellations/deletes, grouped pivot changes, future sequence with
a contiguous union of partial ranges, gap reopening and cashflow. A 108-case
fiscal-state matrix compares actual authenticated cashflow with the canonical
private helper evaluated only as its owner.

ACL regression evidence: with the real REVOKE added but the initial candidate
222497712 unchanged, 45 cases pass and authenticated cashflow fails with SQLSTATE
42501 (`permission denied for function quote_charge_invoice_active`). Applying
the inline-predicate correction passes all 52 scenarios without changing ACLs.

Red regression: set `RECURRING_COVERAGE_BASELINE=1` to omit 0125. The 18 previous
cases pass; the first partial-overlap assertion then fails with "Missing expected
rejection" (exit 1). This is expected evidence of the preexisting defect.

`node scripts/check-drizzle-journal.ts` and `git diff --check` pass. ESLint could
not start using the shared dependency tree: `@eslint-community/eslint-utils` is
missing. No full schema replay or full production-trigger integration was run in
this focused fixture. Keep those release checks separate from these passing tests.
