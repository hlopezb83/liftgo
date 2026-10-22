# Completed recurring lifecycle regression (0122)

Run sequentially using the repository's frozen `postgres` dependency and trusted
PostgreSQL binaries:

```sh
RUN_LOCAL_RECURRING_LIFECYCLE_TESTS=1 PG_BIN=/absolute/path/to/postgresql/bin \
  node scripts/tests/operations/run-completed-recurring-lifecycle.cjs
```

The launcher owns a fresh cluster in a new temporary directory, binds only to an
allocated loopback TCP port, disables Unix sockets, and stops its server in
`finally`. It does not load `.env`, accept a database URL, use existing databases,
or contact an application/fiscal service. Assertions run sequentially.

It first proves two independent **RED** regressions before applying 0122:

1. The exact `complete_return_inspection` function from 0081 performs the real
   booking update, fires the historical recurring trigger, and loses `true`.
2. The historical reconciliation function is rejected by the actual completion
   provenance trigger because it does not set the required scoped RPC context.

Then it applies the entire migration, checks function identities, ownership,
ACLs, INVOKER settings, search paths, unchanged enabled booking triggers and an
unchanged historical completed/non-recurring row, and runs the shared SQL suite.
The **GREEN** checks exercise actual return, cancellation and reconciliation
RPCs, not direct calls to trigger helpers or inserts of completed test bookings.
Only the historical no-backfill sentinel is inserted already completed.

Coverage includes recurring/non-recurring returns, late actual return versus
unchanged contractual end and billing cursor, repeated inspection idempotency,
real cancellation, completed cancellation rejection, stale inspected-booking
reconciliation, unreturned bookings, preservation of both incoming RPC contexts
on success and failure, missing inspection, non-admin and anonymous rejection,
and no automatic invoice creation. A source assertion binds the confirmed-only
SQL selection check to the actual Edge planner query. The Edge handler itself
and PAC are not executed.

A separate defensive test attaches the installed recurring trigger to a
temporary carrier table and checks `completed/true -> cancelled/false`. This is
not a supported booking transition: the real cancellation RPC is separately
required to reject completed bookings, and no production guard is disabled.

The local fixture is deliberately **not a complete schema replay**: tables,
Supabase JWT transport and tenant policies are focused fixtures. Relevant role,
membership, lifecycle and trigger function bodies are extracted unchanged from
the repository. The same `supabase/tests/rls/completed_recurring_lifecycle_0122.sql`
file is discovered automatically by the existing Supabase full-schema SQL CI
gate, where all product tables, functions, policies and triggers are present.
That separate CI gate must pass before claiming full-schema validation.

The SQL suite rolls back all fixtures. The only owner-written stale inspection
models historical reconciliation input; reconciliation itself is called as the
authenticated administrator. The completion guard stays enabled throughout;
the tests never forge its provenance context to make reconciliation pass.
