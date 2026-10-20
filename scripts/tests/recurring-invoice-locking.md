# Recurring invoice locking regression (0114)

This opt-in test creates and owns a **new disposable PostgreSQL cluster** on an
allocated loopback TCP port. It never accepts an existing database/connection URL.
It stops its cluster in `finally`; the temporary directory is retained for diagnosis.
Do not use a shared database or real fiscal provider for these tests.

Requirements: trusted PostgreSQL binaries (`initdb`, `pg_ctl`, `postgres`) and the
`pg` Node package. For example, using already installed tooling:

```sh
RUN_LOCAL_RECURRING_TESTS=1 \
PG_BIN=/absolute/path/to/postgresql/bin \
PG_MODULE=/absolute/path/to/node_modules/pg \
node scripts/tests/recurring-invoice-locking.test.cjs
```

Without the opt-in variable the test prints SKIP and creates nothing. `PG_MODULE`
may be omitted if `pg` resolves normally. Run the full command in one shell so the
cluster lives for the entire test. No schema migration is applied outside that
new cluster.

The fixture installs the current function and active-document predicate from
0107, then applies 0114. To verify the regression fails before the fix, set
`RECURRING_BASELINE=1`: the first four existing invariants pass, then cancellation
during advisory wait must fail the assertion with exit 1. This is an expected red
regression, not a passing suite. 0097 is not the current implementation: 0107
changed the active-document predicate but retained the stale eligibility race.

18 passing scenarios after 0114:
- Same booking/period, reversed group order, partial group collision, first writer rollback.
- Eight changes while blocked on the advisory lock: cancelled, completed, recurrence
  disabled, different customer, start/end dates, changed organization, deleted row.
- Cancellation by a writer that uses only a booking row lock (no advisory lock).
- Booking row remains protected until the invoice transaction completes.
- REPEATABLE READ and SERIALIZABLE stale snapshots abort with 40001, without invoice.
- Mixed organizations reject without invoice.
- 0107 active-document predicate retains pending cancellation and frees accepted cancellation.

Waiting is observed through `pg_stat_activity` before committing mutations, not
assumed from a sleep. Boundaries use synthetic fixtures and service-role auth mocks.
This is not a full migration replay, RLS/role-grant suite, integration with every
invoice trigger/writer, or real fiscal verification. Those remain CI/integration
coverage requirements before release.
