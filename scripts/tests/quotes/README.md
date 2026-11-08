# Quote paging: actual local PostgreSQL integration

Run with the repository's frozen dependencies and trusted installed PostgreSQL 17 binaries including ICU:

```sh
RUN_LOCAL_QUOTES_TESTS=1 PG_BIN=/absolute/path/to/postgresql/17/bin \
  node scripts/tests/quotes/run-local-postgres.mjs
```

The launcher creates its own empty cluster in a new temporary directory and an allocated 127.0.0.1 port. It rejects externally supplied quote DB URLs/ports/clusters, disables Unix sockets, loads no `.env`, and stops the cluster in `finally`, including a partial startup leaving a postmaster.pid. It does not reset, attach to, or change an existing database. Diagnostics remain locally; the cluster is stopped. The integration script verifies the actual data directory and empty public schema before any fixture write. HTTP fetch throws. PostgreSQL functions, grants, roles, RLS, collation, filters and concurrency execute in PostgreSQL, not JS mocks.

The schema is deliberately focused, not the full product migration history. It includes the exact existing `current_internal_organization_id()` definition extracted from Drizzle 0031, synthetic organizations/memberships/roles/module permissions, the list projection and restrictive tenant/hidden-row policies. Query sessions use authenticated with NOSUPERUSER/NOBYPASSRLS and row_security=on, distinct from the table owner. No real user data, tokens, external services, fiscal or application writes occur.

Fourteen scenarios cover:
- INVOKER/search_path/ACL, including closure of inherited service_role/anon EXECUTE grants.
- 501 rows across six pages, exact projection, cross-tenant/E2E/additional-RLS exclusions.
- Tenant expectation mismatch, missing session/membership/role, portal/mixed/ambiguous/inactive organizations.
- Module none despite role-level SELECT; effective role priority.
- Old folio variants, literal metacharacters, NFC/NFD names, large folios without JS Number conversion.
- Invalid pagination/status/JSON/sort/injection, empty and out-of-range pages.
- Global natural ordering across page boundaries in both directions, customer numeric/accent/case order, multisort/nulls/ties.
- Unexpected existing collation fails closed.
- Real concurrent writer commit while reader is demonstrably blocked in an RLS fixture function: count and page retain the same statement snapshot, next statement sees new data.
- 10,000 synthetic records with a bounded 100-row final page and exact count. Timing is diagnostic, not a production SLA.

Outputs: `reports/quotes-rpc/sql-integration.json` plus console and temporary cluster logs. A pass does not certify full-schema replay, existing production policies, remote ICU/version availability, migrated environments, visual/browser E2E or network/provider behavior.

Validation here used official Debian trixie packages PostgreSQL 17.11-0+deb13u1, extracted under /tmp without system install. Sources were the HTTPS Debian package index and the referenced .deb packages, checked against index SHA256. Package hashes:
- postgresql-17: d2ce1ddffafa783f9acda4c92c86fc21e8288bff3782d739294f14fa797d7886
- postgresql-client-17: 9d8558f8dd57c8e92e218a20698383575d53742ca3f9e7c2b7fe5f246d5216ae

ICU catalog version was 153.128. Never install a different binary source or connect a shared database simply to make this test pass.
