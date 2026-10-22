# Completed recurring recovery: server guard

Scope: migration 0121; no execution against a remote database, no data rewrite, no operational booking-date changes, no cron or fiscal-provider changes.

## Invariants

- New coverage on a completed recurring booking cannot overlap another non-cancelled invoice, by direct booking reference or pivot. Bounds are inclusive; an adjacent next day is allowed. Missing or inverted historical coverage fails closed.
- The invoice and pivot paths are both guarded. Existing RPC locking is retained. Trigger writes use the identical ordered advisory keys with `pg_try_advisory_xact_lock`, returning retryable `55P03` rather than introducing a row/advisory wait cycle. A losing retry encounters `23505` after the winner commits.
- New completed-recurring coverage requires READ COMMITTED. Stronger snapshots are rejected with `40001` rather than checking an old snapshot after a lock wait.
- A unique visible return inspection must match organization, booking and forklift. Its finite timestamp is converted in America/Monterrey, cannot precede the rental or be in the future, and caps the invoice end date.
- The user selected the same prorated monthly rent through the actual return, including days after the contractual end. Only completed recurring coverage may exceed `bookings.end_date`; the operational date itself is not updated. The guard does not calculate or change amounts.
- Late recovery also requires every active linked invoice, including the candidate, to be attributed exclusively to this booking and to contain a non-empty array of explicitly `line_kind: rental` lines. Charges, manual/legacy lines, malformed JSON and grouped invoices require review. Cancelled invoices do not block recovery. This conservative rule intentionally also sends logistics/insurance history for review rather than guessing quote attribution. It does not block contractual-period grouping or unchanged historical notes.
- Existing recurring confirmed behavior and non-recurring overlap behavior remain unchanged.

## Historical edits and security

Unchanged coverage with an identical set of pivots containing a completed recurring booking updates only `line_index`, including unchanged indexes. Existing sync range, tenant and exact-duplicate checks run first. The UPDATE retains deferred quote-charge validation, and its affected-row count is checked so UPDATE RLS cannot be bypassed. Reordering is not treated as a new claim.

Ordinary notes on partial-overlap history, including mixed-booking history and missing return records, remain editable when links and period are unchanged. Pre-existing exact-duplicate restrictions from migration 0109 remain. Reading and export are unchanged. No historical reconciliation or automatic correction is performed.

Both functions are invoker functions; no existing grant/RLS policy is changed. The new trigger-only function has EXECUTE revoked from PUBLIC, anon, authenticated and service_role.

## Test scope and limitations

The PostgreSQL fixture is focused, not a full production-schema replay. It exercises real SQL, RLS, transactional rollback and two physical sessions. A synthetic deferred constraint proves that unchanged-link updates still schedule deferred validation; static inspection additionally checks compatibility with lifecycle guards 0106 and quote-charge triggers 0107. Full-schema CI and sandbox acceptance remain separate gates.

The local PostgreSQL distribution lacks psql/createdb/dropdb. Local tests use a temporary CLI adapter backed by the repository's frozen `postgres` dependency against a newly initialized loopback-only cluster. CI invokes the same Python suite with real psql. No external database URL or production credentials are used.

Confirmed-to-completed state transitions are not rewritten or retroactively sanitized. A previously permitted confirmed overlap may remain historical. Advisory locking protects competing invoice writers on already completed bookings, not arbitrary later changes to the return evidence. This migration does not repair that evidence or classify economic intent from invoice descriptions.

Run against an explicitly selected disposable local PostgreSQL server:

```sh
RUN_LOCAL_OVERLAP_TESTS=1 PGHOST=127.0.0.1 PGPORT=... PGUSER=postgres \
  python3 scripts/tests/test_nonrecurring_invoice_overlap.py
```

Baseline reproduction: set `COMPLETED_RECURRING_BASELINE=1` and select `OverlapTests.test_completed_recurring_overlap_all_link_paths`. Before 0121, twelve partial-overlap subcases fail the expected rejection; the three exact duplicates are already rejected.

## Executed evidence (2026-10-22 UTC)

- Final sequential suite: 32/32 tests passed in 334.435 seconds, exit 0, using actual local PostgreSQL and the disclosed CLI adapter. The disposable server stopped successfully afterward.
- Latest return-evidence alignment and late-recovery subset: 6/6 passed in 99.389 seconds. This includes future timestamps within the same local date and duplicate inspections with a different forklift.
- Baseline without 0121: twelve partial-overlap subcases reproduced the missing rejection. Exact-duplicate prevention already existed.
- Independent static review closed without outstanding observations on the candidate, including advisory-key compatibility and interaction with 0106/0107. This is not a claim of full-schema or sandbox acceptance.

The final suite covers competing direct invoice, pivot and sync writes; recoverable lock conflicts and subsequent overlap rejection; cancellation resurrection; tenant/RLS isolation; historical mixed notes and pivot reordering; deferred validation; return bounds; strict late-recovery attribution; and existing non-recurring/confirmed regressions. Interrupted earlier full-suite attempts are not counted as passes.
