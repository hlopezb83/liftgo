# Migration 0126 inherited ACL correction

The initial hosted execution aborted at the fail-closed ledger ACL assertion. The deployment owner confirmed a complete rollback: no ledger table and no registered migration hash. The 0126 migration is therefore corrected before application; its journal number/timestamp and the reviewed eight-record data script remain unchanged.

Read-only catalog inspection identified additional postgres/public defaults: sandbox execution roles inherit SELECT/INSERT on newly created tables, and the project-specific sandbox role inherits EXECUTE on newly created functions. The previous explicit revocations listed only the standard Supabase roles, so inherited custom grants remained.

The correction removes explicit non-owner ACL entries solely from the newly created ledger and its two new trigger functions, with SQL identifiers quoted using format `%I` and PUBLIC handled explicitly. It then grants only SELECT to authenticated on the ledger. The final assertions reject any other table grant or non-owner function grant. Owners, role memberships, global/schema default privileges, existing business objects and their ACLs are unchanged. No new permission is granted beyond the already-reviewed SELECT.

## Validation

- Original 0126 reproduced the exact `Unexpected default privileges` error in isolated PostgreSQL 17; a single-transaction run rolled back both the table and trigger functions.
- Patched 0126 passed against the observed inherited grants, plus PUBLIC and a role name containing a quotation mark with grant options.
- The test checks hashes of all default ACL rows and exact ACLs of pre-existing witness table/function before and after. It confirms owner identity, authenticated SELECT only, denial of other roles' table privileges (including PG17 MAINTAIN), and denial of EXECUTE on both trigger functions for all non-owner roles tested.
- Actual SELECT/INSERT attempts by the generic and project-specific sandbox roles fail.
- Full focused functional suite passed with inherited defaults and with clean defaults: eight exact entries/dates, idempotent replay, atomic failure at the eighth record, original-row mutation traps, RLS and ACL isolation, immutable history and audited revocation.
- Drizzle journal validation and git diff whitespace checks pass. No application code or data-fix content changed.

Reproduce on an EMPTY local disposable database through `HISTORICAL_TEST_DEFAULT_ACL=1 scripts/test-historical-deliveries.sh`; omit the variable for the clean-default test. The fixture intentionally sets default privileges only in that isolated test database. The product migration contains no ALTER DEFAULT PRIVILEGES or role changes.

These are focused real PostgreSQL tests with modeled auth helpers, not a full hosted-auth replay. Production application remains the deployer's separate reviewed step.
