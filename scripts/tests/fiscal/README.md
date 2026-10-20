# Fiscal exceptional-flow integration gates

These tests close database-integration gaps without calling a fiscal provider,
using credentials, changing a shared database, or manufacturing states in the
published Sandbox. They do not claim 100% fiscal or provider E2E coverage.

## REP: actual handler and PostgreSQL persistence

With the repository's frozen dependencies and trusted PostgreSQL binaries:

```sh
node node_modules/typescript/bin/tsc --noEmit -p scripts/tests/fiscal/tsconfig.json
RUN_LOCAL_FISCAL_TESTS=1 PG_BIN=/absolute/path/to/postgresql/bin \
  node scripts/tests/fiscal/run-rep-postgres.mjs
```

The launcher creates its own empty cluster in a fresh temporary directory on an
allocated loopback port. It refuses an externally supplied fixture port/URL and
always stops its cluster. Temporary diagnostics remain locally. The tests verify
the connected PostgreSQL data directory and empty public schema before writes.
No `.env` is loaded, and HTTP `fetch` throws. The separate Vitest config prevents
this opt-in integration test from silently skipping/passing in browser shards.

The actual `reconcile-stamping-invoices` handler and decision functions execute.
The Supabase-shaped transport adapter issues real parameterized PostgreSQL
SELECT/UPDATE statements. PostgreSQL, not a JS object, evaluates filters, claims,
affected rows, concurrent updates, and injected constraint failures. The schema
is a focused payment/reconciliation fixture, not the product's complete schema.
PAC lookup/XML/PDF, authentication, configuration, folio assignment and Storage
remain explicitly simulated. Tests keep an existing folio to isolate persistence.

Eleven cases:

1. Uncertain lookup followed by recovery preserves one payment/PAC ID/UUID;
   another reconciliation is a no-op.
2. Pending PAC result is durably retained without false finalization.
3. Failed PAC result persists manual-review state.
4. Failed SQL counter writes consume no miss; retry state appears only after
   five confirmed, persisted misses.
5. Rejected identifier write recovers later with the same payment.
6. Rejected finalization keeps identifiers; later recovery needs no new lookup.
7. Rejected manual-review write cannot report a successful transition.
8. Two handlers read the same stale snapshot; real concurrent SQL CAS admits
   exactly one claim, lookup and recovery.
9. A newer SQL claim cannot be overwritten by the old handler.
10. A terminal SQL state written during download cannot be overwritten.
11. A microsecond-precision source timestamp survives PostgreSQL JSON transport
    and remains usable as an exact compare-and-swap token.

Every case asserts that no provider issue/create call or HTTP request occurs.
This proves application recovery/claim behavior, not the real provider's
idempotency implementation, fiscal correctness of a synthetic XML, real Storage
availability, or the initial `stamp-payment-complement` issuance RPC.

## Recurring invoices: complete replayed CI schema

The last business-data step of `.github/workflows/rls-db-tests.yml` runs:

```sh
node scripts/tests/fiscal/recurring-full-schema.mjs
```

It requires GITHUB_ACTIONS=true, CI=true and the exact existing disposable CI URL
on 127.0.0.1:54322. It reuses the canonical replay manifest/ledger verification.
No custom URL, production ledger, remote target or alternate schema is accepted.
The existing exact exclusions of production-bound 0108/0110 receipts still apply;
no new migration exclusions or product changes are introduced.

Five cases run against the replayed product tables, constraints, triggers and
real service_role permissions, using separately reserved PostgreSQL sessions:

- Identical booking/period: one invoice; the waiter reuses it.
- Reversed grouped booking order: one invoice, no deadlock.
- First transaction rollback: the waiter creates exactly one invoice.
- A non-advisory booking writer cancels while invoice creation waits on its row:
  eligibility is re-read and no invoice or last_billed_date is written.
- Partially overlapping groups: the second request fails atomically; the third
  booking is untouched.

Overlap is confirmed through pg_stat_activity lock waits, not sleep-based
assumptions. The fixture creates a uniquely named synthetic organization; it
fails if that ID already exists. Only these synthetic rows are committed, inside
the job-owned database. This gate runs after the rollback SQL/RLS suites and the
workflow's unconditional `supabase stop --no-backup` discards the entire DB.
No trigger, constraint, RLS policy or grant is disabled. Service-role tests do not
replace authenticated user/tenant RLS suites, which remain separate gates.

The existing 18-case focused cluster test remains useful for wider interleavings
and baseline regression. It is not replaced or relabeled as full-schema coverage.
Local execution without a full Supabase replay is rejected, not counted as a pass.
The full-schema gate must pass on the exact PR SHA before this gap is closed.

## Acceptance boundary still requiring Sandbox observation

The published acceptance on 2026-10-20 observed a successful first-attempt REP,
cancellation refusal with an applied payment, and immediate accepted cancellation.
It did not observe error→correction→retry, lost PAC response, pending/rejected/
expired cancellation, refresh transitions, or acuse downloads. Those states must
not be manufactured in shared Sandbox simply to claim an E2E pass.

For future supported Sandbox observation, retain the initial/final document and
payment identity, provider ID/UUID/folio, state transitions, payment count and
balance, document availability and absence of unintended reissuance. If the PAC
cannot produce the requested state under a documented test contract, record it
as unavailable E2E coverage, not a product bug or a passing result.

Fixed-dollar partial recurring charges intentionally require manual review;
existing unit tests guard that refusal. Credit-note proportional discounts and
invoice display have separate tests. Neither behavior implies a missing automatic
proration feature, nor does it establish a full quote→invoice→NC provider E2E.
