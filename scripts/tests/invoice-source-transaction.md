# Invoice source transaction regression (0127)

This opt-in test creates a fresh, in-memory PostgreSQL instance using PGlite. It
accepts no database URL or filesystem database, makes no requests to Supabase or
a fiscal provider, and closes the instance in `finally`.

The runner loads the actual four/five-argument save RPCs, current booking sync,
booking locks, extension guards/issuance trigger, quote acceptance/state guards,
and optimistic version trigger from versioned migrations. It then applies 0127.
The fixture uses synthetic IDs and simplified tenant/read/write policies.

Install the official PGlite package outside the repository, with install scripts
disabled, or point the runner to an already installed copy. Example:

```sh
npm install --prefix /tmp/liftgo-source-test-tools \
  --cache /tmp/liftgo-source-test-cache --ignore-scripts --no-audit --no-fund \
  @electric-sql/pglite@0.3.14
RUN_LOCAL_INVOICE_SOURCE_TESTS=1 \
PGLITE_MODULE=/tmp/liftgo-source-test-tools/node_modules/@electric-sql/pglite/dist/index.js \
node scripts/tests/invoice-source-transaction.test.mjs
```

The test checks commit/rollback across invoice, pivots, extension, quote and
damage; source versions/states/expiry; tenant/RLS/zero-row failures; inclusive
extension coverage; repeated competing claims; existing overlap/range/edit
guards; new RPC privileges; and no fiscal issuance from the save payload.

Limitations: PGlite is single-session here, so this is not a concurrent-session
race/deadlock test. The minimal fixture does not replay every product trigger,
policy, or migration. `supabase/tests/rls/invoice_source_transaction_contract.sql`
also gates the RPC metadata and early validation against the normal full-schema
CI replay. Full SQL/role integration and multi-session races remain release
requirements; neither test certifies an applied cloud migration or fiscal PAC.
