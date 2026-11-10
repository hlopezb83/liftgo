# Maintenance dependency review (#428)

Initial base: `f7554fcb023b66f5b26a1d9599dce58a924156fe` (main).
Final integration is stacked on reviewed #427 `9ecda89c06fe70f89b6c19aa579d6b4c8d5ac13b`,
which includes #426, #425 and UX #404/#437.
Validation runtime: Node 26.13.0 and Bun 1.4.4.

## Corrections

- Vite is exactly 8.3.6 in the manifest, override, lock, and installed consumers
  (root, Vitest and Lovable's Vite configuration).
- Postgres.js is exactly 4.1.0 in manifest, lock and installed package.
  The previous 4.0.0 assertions failed against the Dependabot update.
- The offline contracts now load the actual ESM/CJS driver, normalize CJS through
  the existing helper, construct actual Drizzle clients and verify parser and
  serializer slots. Socket creation is mocked to throw and zero attempts are
  asserted. Existing modeled query, transaction and import guard tests remain.
- The new driver contract verifies the 4.1 behavior of `PGSSLMODE`: environment
  applies when no explicit option exists, and explicit options or URL parameters
  take precedence. Explicit certificate verification remains enabled. No
  production connection settings or TLS guards are changed.
- Keep baseline nested Babel 7 resolutions and unchanged native `libc` metadata;
  update the direct Babel 8 toolchain and the maintenance dependency families.

## Local evidence

- Frozen installation: PASS, using the repository's normal 24-hour package-age
  guard. No age exclusions or integrity checks were weakened.
- Dependency/security/SDK/driver/import contracts: 37 PASS initially; 38 PASS
  after stacking Query/Sentry (including the isolated source-map contract).
- JavaScript syntax and Git whitespace checks: PASS.
- Initial typecheck/build attempts were interrupted by shared-runner resource
  limits (137/SIGKILL). Both typechecks and the production build subsequently
  passed when run sequentially.
- First complete CI: [42751313514](https://github.com/hlopezb83/liftgo/actions/runs/42751313514),
  six successful jobs, 817 files / 6,403 tests, quality and real Worker smoke.
- The stacked final head is revalidated separately before integration; its
  exact-head CI result is recorded in the PR, rather than borrowing this run.

## Real driver consumers on disposable PostgreSQL

Using the existing trusted PostgreSQL 17.9 binaries, Node 26.13.0 and the frozen
Postgres.js 4.1.0 package, these unchanged repository runners passed:

- Recurring invoice locking: all 18 scenarios, including waiting, rollback,
  deadlock avoidance, cross-tenant guards and REPEATABLE READ/SERIALIZABLE 40001.
- Historical quote-charge reconciliation: all nine races, real role RLS and
  fail-closed isolation/authorization controls on the reduced synthetic schema.
- Invoice settlement: BF03/BF04, inherited ACL, organization guards, FX and
  idempotency against the actual function/trigger definitions.
- Income-statement documents: inherited ACL, pagination, FX, cash dates,
  cross-tenant RLS, permission matrix and source-drift guard.
- Income-statement calculations: FX, proportional COGS, depreciation, stable
  deduplication, detail parity, ACL/RLS and drift guard.

Every runner created its own fresh cluster with only a loopback listener, used
synthetic fixtures, and stopped the cluster. No remaining postmaster.pid was
found in their owned data directories. Runs used a clean environment without
existing database URLs or credentials. Exact migration/function definitions
were applied only to these disposable local fixtures, never a shared database.

These focused suites do not replace the complete Supabase schema/RLS replay or
real TLS certificate-handshake tests. No remote database access, deployment,
provider/fiscal request or real financial operation ran.
