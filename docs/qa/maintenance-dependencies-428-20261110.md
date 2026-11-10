# Maintenance dependency review (#428)

Base: `f7554fcb023b66f5b26a1d9599dce58a924156fe` (main).
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
- Dependency/security/SDK/driver/import contracts: 37 PASS, 0 FAIL, 0 SKIP.
- JavaScript syntax and Git whitespace checks: PASS.
- Initial typecheck/build attempts: interrupted by shared-runner resource limits
  (exit 137 / SIGKILL). These attempts are not passing validations.
- Full CI on the final head, production build, browser smoke and full Vitest:
  pending before integration.

The runtime loader and TLS-option tests are offline contracts. They do not prove
real PostgreSQL query execution, TLS certificate handshakes, SQL suites or RLS.
No database migrations, remote database access, deployment or fiscal actions ran.
