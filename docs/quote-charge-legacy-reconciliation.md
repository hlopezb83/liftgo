# Historical quote charge reconciliation

This change adds an administrative review ledger alongside invoices. It does not
edit invoice lines, fiscal XML, fiscal status, or historical tracking versions.
It never attributes an invoice line from its description. Reviewers must inspect
evidence and explicitly select the quote charge and quantity, or classify a line
as equipment rental/sale or outside that quote's charges, with a reason.

## Review and integration scope

- Source checkout found on ASUS14: `liftgo-step6` (2026-10-30).
- Confirmed origin: `https://github.com/hlopezb83/liftgo.git`.
- Isolated working copy exported from committed tree
  `ee5fdbff12dbffe4d24fdf4108b9276f8f53b4b3` (2026-10-30 17:07:22 UTC).
  The original checkout was not modified. Its dirty status could not be read
  reliably in the execution sandbox, so its uncommitted files were not copied.
- GitHub read-only comparison against main
  `3e59d0a982136bf62206e4c19f20fd5959311c62` (2026-11-04 03:00:42 UTC)
  showed divergence: 29 commits ahead and 1 behind, common ancestor
  `89e37f455ea85ea3941a231dd84f3195813b8c3f`.
- That comparison contains **no changes in Drizzle migrations, schema, quote
  charge tracking, recurring quote charge calculation, or the guards being
  extended by this patch**. Later changes concern dependencies, unrelated UI,
  supplier REP XML, CI tooling, plans and public version metadata. In particular,
  `66a01c8e113f1f3bdd14f285da52aeed45d5708e` to the observed main consists of
  eight plan/public version commits.
- `AGENTS.md` was read. No `.agents/skills` directory was present in this
  committed tree. Its invoice-form guidance continues to apply: rent-only
  invoices must not be blocked by unrelated historical charge review.

Apply the resulting patch to a separate branch of the integration checkout and
check it against the then-current main. Recheck the migration journal and RPC
signatures before any rollout. The local baseline is a snapshot commit, not a
replacement for the upstream repository history.

## Operational boundaries

No remote Supabase call, remote migration, role change on an existing database,
operational reconciliation, fiscal stamping/cancellation, publication or push is
part of this work. Production operations remain coordinated through Lovable by
the parent task. Reference folios mentioned in the task are not fixtures,
exceptions, or migration targets.

The SQL migration must be reviewed and tested on an empty disposable database
with the full current migration chain before staging. Preserve the ledger and
its reversal events; do not implement rollback by deleting review history or
resetting historical invoice tracking versions.

## Expected behavior

- A quote with no additional charge lines does not require historical charge
  review. Adding a charge later recalculates the requirement.
- Review applies to each ambiguous original line within each related quote's
  scope. A review for one quote cannot clear another quote's unresolved lines.
- Empty historical invoices with a positive subtotal remain unresolved; the
  reviewer cannot invent an original line to reconcile.
- Charge assignments reserve quantity while the historical invoice is active.
  Drafts and stamping reserve. Pending fiscal cancellation still reserves;
  accepted fiscal cancellation releases under the existing predicate. Credit
  notes do not release reservations automatically.
- Reversals are new audit events. They restore pending review without deleting
  the original evidence. Retrying the same request is idempotent; changing its
  payload requires a fresh request key.
- Reconciliation and invoice writes share the quote lock and consumption
  calculation. Reactivating a reconciled historical invoice must revalidate its
  reservation even though its original lines have no native source IDs.
- Original invoice line arrays and relevant tenant/customer/currency/association
  identities remain protected once they have review history, including after a
  reversal. Quote source identities cannot be repurposed or removed.

## Validation

The PostgreSQL harness always creates a new synthetic cluster under the
workspace, never an existing cluster. Its reduced schema is intended to exercise
the exact tracking/reconciliation functions, RLS and concurrent sessions. It does
not stand in for a complete Supabase/Auth/PostgREST deployment rehearsal.

Local results on ASUS14:

| Check | Result and scope |
| --- | --- |
| TypeScript application and browser-test configurations | Passed |
| Targeted Vitest UI/hook/helper/regression cases | 67 distinct cases passed across targeted runs |
| Offline recurring backend Deno tests | 72 passed, including no-charge preview/generation and incomplete response rejection |
| New UI, browser fixture and API spec ESLint | Passed with zero warnings |
| Drizzle journal and migration lint | Passed, 124 journal entries |
| Browser fixture production compilation | Passed, no browser/backend service used |
| PostgreSQL 17.9 standalone, no sockets | Exact 0107 + 0123 compiled; sequential business fixture passed |
| Real PostgreSQL role/RLS/ACL enforcement | **Not executed**; standalone explicitly reports `row_security_active=false` |
| Nine real two-session races and repeatable-read checks | **Not executed**, client TCP connection denied |
| Full migration-chain/Supabase/Auth/PostgREST acceptance | **Not executed** |
| Six browser scenarios (desktop/mobile) | Discovered/typechecked; **not executed**, HTTP connection denied |

The final grouped Vitest run passed 62 cases but could not load the quote-detail
suite due to a transient local `date-fns` module resolution error. That module
was readable and imported successfully in Node; the five quote-detail cases
passed on an isolated run. No source change or test bypass was used to resolve
that environment failure. Earlier UI-agent grouped runs also passed those cases.

Deno ran with `--cached-only --no-check`, no network permission, and a temporary
import map resolving the absent cached esm.sh SDK URL to the installed local
`@supabase/supabase-js` **same version 2.118.0**. This is offline handler/mock
coverage, not a deployed backend test. The application TypeScript check is a
separate passing check.

The standalone fixture covers explicit RPC actor/tenant checks, native/legacy
consumption per line, positive finite quantities, immutable hashes (including
numeric JSON representation `1` vs `1.0`), reversal/idempotency, multi-quote
scope, no charges followed by adding a charge, empty positive-subtotal history,
notes with unchanged final booking links, and cancellation/new consumption/
reactivation. It cannot validate role privilege boundaries or concurrent
transactions because PostgreSQL standalone bypasses RLS and has one session.

Evidence: `reports/quote-charge-legacy-single-user.log` and
`reports/quote-charge-review/vitest.log`. The latter records the grouped run and
its environment failure, not an all-green seven-file result.

## Remaining environment blockers

- New disposable PostgreSQL cluster: Node's connection to
  `127.0.0.1:52436` was denied with `connect EACCES`. No SQL was executed through
  that connection. The server was stopped and shutdown verified by `pg_ctl`
  status and its log. No existing cluster was accessed and the denied connection
  was not retried.
- Browser: Vite reported ready at `http://127.0.0.1:4208`, while Playwright's
  readiness HTTP GET returned `connect EACCES 127.0.0.1:4208`. The runner was
  interrupted and logged termination of its WebServer. No browser test ran.
  No alternative destination or network-permission workaround was attempted.

This patch is **partially validated and not ready for activation or publication**.
The following commands are for another explicitly authorized local environment
with loopback connections permitted, from the repository root after installing
the pinned project dependencies:

```powershell
# New cluster only: reduced-schema RLS/ACL + real two-session races.
$env:RUN_LOCAL_QUOTE_CHARGE_TESTS = "1"
$env:PG_BIN = "C:\path\to\trusted\postgresql\bin"
node scripts/tests/quote-charge-legacy-reconciliation.test.cjs

# Browser component fixture only; all external browser destinations are denied.
node node_modules/@playwright/test/cli.js test --config playwright.quote-charge-review.config.ts
```

For the successfully executed no-socket compilation/business check:

```powershell
$env:RUN_LOCAL_QUOTE_CHARGE_SINGLE_USER = "1"
$env:PG_BIN = "C:\path\to\trusted\postgresql\bin"
node scripts/tests/quote-charge-legacy-single-user.test.cjs
```

Before integration, run the repository's full SQL/RLS gate and multi-tenant API
suite against an explicitly configured disposable **local** Supabase instance.
Include `supabase/tests/rls/quote_charge_legacy_reconciliation.sql` and
`tests/multi-tenant-ab/quote-charge-legacy-review-api.spec.ts` after the full
current migration chain. Do not use an operational URL or credentials to fill
missing local test setup.

## Existing independent runners (configuration only)

Read-only verification against upstream commit
`3e59d0a982136bf62206e4c19f20fd5959311c62` confirmed two configured channels;
neither was dispatched or connected from this task:

- `.github/workflows/rls-db-tests.yml`: Ubuntu runner, fresh local Supabase
  PostgreSQL/Auth, exact migration-chain checks and Drizzle replay, strict SQL/RLS
  suites, and existing real concurrent-session regressions. The job requires
  `workflow_dispatch` with `run_supabase=true`; PR/push alone does not execute it.
  It stops the disposable environment in its always-run cleanup.
- `.github/workflows/multi-tenant-ab.yml`: fresh local Supabase including
  Auth/PostgREST/Storage, two synthetic organizations and API/browser checks.
  It also requires manual `run_supabase=true`. Credentials are generated by the
  local CLI; `tests/multi-tenant-ab/fixtures/localBackend.ts` rejects remote hosts
  and an explicitly configured remote-backend escape before login or writes.

After applying this patch, the RLS workflow has an explicit
`Historical quote charge reconciliation (RLS and 9 real races)` step. It exports
`RUN_LOCAL_QUOTE_CHARGE_TESTS=1` and pins `PG_BIN=/usr/lib/postgresql/16/bin`,
matching the workflow's existing trusted installed PostgreSQL binary location.
It fails if any binary is absent, the Node process fails, fewer than nine race
markers are emitted, RLS is not actually active, or the final completion marker
is missing. `set -euo pipefail` preserves errors through `tee`; there is no
`continue-on-error` or skip fallback. The step has a five-minute timeout.

The runner verifies nine unique manifest IDs and observes the actual blocking
backend through `pg_blocking_pids`, rather than accepting overlapping promises
alone. The two added cases race historical reactivation against a new native
invoice in both winning orders. It requires `row_security_active=true` while
`current_user=authenticated`, so standalone/bypass execution cannot pass as RLS.
These are prepared assertions, **not executed concurrency or security results**.

| New coverage | Pipeline connection after applying this patch |
| --- | --- |
| `0123_quote_charge_legacy_reconciliation.sql` | Existing official Drizzle replay in both ephemeral workflows |
| `quote-charge-legacy-reconciliation.test.cjs` | New explicit RLS-job step: nine observed two-session races, role/RLS fixture and completion checks |
| `supabase/tests/rls/quote_charge_legacy_reconciliation.sql` | Existing strict SQL suite glob in the RLS job, after full migration replay |
| `tests/multi-tenant-ab/quote-charge-legacy-review-api.spec.ts` | Existing A/B Playwright test directory, with Auth/PostgREST in the separate A/B job |
| New `src` UI/hook/helper tests | Existing Vitest `src/**/*.{test,spec}.{ts,tsx}` discovery |
| Added recurring `handler_test.ts` cases | Existing Deno offline test selection |
| Standalone no-socket diagnostic | Not connected to CI; cannot substitute for RLS or concurrency |
| Separate browser component fixture | Explicit A/B-job step; JSON stats require six passing cases and zero skips, failures or flaky outcomes |

Both Supabase jobs still require manual `workflow_dispatch` with
`run_supabase=true`. A skipped job on PR/push is **not** a passing database gate.
The initial local checks prepared wiring only. Remote synthetic runs, their SHA
and terminal outcomes must be verified separately; a prepared workflow is not
proof that it ran.

Current upstream uses `postgres@4.0.0`, while the source snapshot uses v3. The
runner uses the exact canonical import required by upstream's AST import guard:
`require('../lib/postgres-factory.cjs')(require('postgres'))`. No dependency
version or import guard was changed. The unchanged upstream helper (Git blob
`d51bb375a9da3a27a1092814e817e074b8c088d9`) is materialized only as local snapshot
support and excluded from this patch because it already exists on current main.
Runtime execution with Linux/PG16/v4 remains part of the pending validation.

Offline checks of these wiring changes passed: YAML parsing and required step
configuration, Node syntax, the upstream AST predicate for the canonical import,
nine unique manifest IDs matching nine race calls, and three startup failures
(missing opt-in, forbidden existing-cluster input and non-absolute binary path).
Those checks did not instantiate database clients, start servers or use network.

## Independent review summary

The independent static review found and helped correct native consumption being
dropped by contextual filtering, stale repeatable-read snapshots bypassing audit
visibility, booking/pivot scope changes missing the common mutex, ordinary
notes-only saves being blocked by link resynchronization, malformed source fields
offering unusable UI actions, and incomplete mutation confirmations. Root review
also preserved numeric JSON representation hashes (`1` versus `1.0`).

The CI review then caught the canonical PostgreSQL import-guard requirement and
the missing simultaneous reactivation case; both were corrected in the prepared
runner. No further static blocker was confirmed. None of this replaces the
pending real Linux, RLS/ACL, full-schema or concurrent execution.

The configuration is evidence of a testing route, not proof of a running
environment. No synthetic staging database or connected test backend was
established during local preparation. Runner availability must be checked when
executing the authorized integration runs.

## Integration target

The publication candidate is integrated over upstream
`cf638f9d61f9dcdd0bf7937a8738913a1abc6a6b`, preserving its dependencies,
canonical PostgreSQL factory, existing workflows and unrelated changes. The
user has authorized a dedicated branch, a draft PR and the disposable synthetic
workflows. Merging, app publication, operational data changes and production
migrations remain outside that authorization. CI execution and final outcomes
are reported on the draft PR; no local blocked test is treated as a passing run.
