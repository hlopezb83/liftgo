# Historical quote charge reconciliation

Migration `0123_quote_charge_legacy_reconciliation.sql` adds an administrative
review ledger alongside invoices. It never edits invoice lines, fiscal XML,
fiscal status or historical tracking versions, and never matches a charge by
description. An administrator inspects evidence and explicitly assigns an
original line to a quote charge and quantity, or classifies it as rental/sale or
outside that quote's charges, with a reason. Reversal creates another audit event.

## Business and security contract

- Quotes without additional charges allow rental billing. Adding a charge later
  restores historical review when unresolved history exists.
- Each ambiguous original line is reviewed within each related quote's scope.
  One quote's review cannot clear another quote's unresolved lines. Empty legacy
  invoices with a positive subtotal remain unresolved; no synthetic line is invented.
- Drafts, stamping and pending fiscal cancellation reserve quantity. Accepted
  fiscal cancellation releases according to the existing predicate. Credit
  notes do not automatically release consumption. Historical reactivation
  revalidates consumption even when the original JSON has no source IDs.
- Native and reconciled quantities are counted per line, without double counting.
  Reconciliation, reversals and invoice writes share quote locks and consumption
  calculations. Review RPCs require READ COMMITTED and lock the invoice before
  ordered quote UUIDs, preserving the existing advisory/booking/invoice/quote order.
- Original line snapshots and SHA256 hashes detect edits and reordering. Reviewed
  invoices, source quote identities and booking associations remain protected
  after reversal. Idempotency keys are bound to their original payload.
- Actor and organization come from the authenticated internal membership. Only
  an administrator can reconcile or reverse; existing authorized financial and
  audit roles retain read access. Portal and sales roles gain no access.
- Both ledger tables use RLS, the canonical restrictive `org_scope_isolation`
  policy and `trg_organization_write_context`. The trigger also runs inside the
  SECURITY DEFINER RPCs. Direct DML and history deletion remain denied; there is
  no new service-role grant or audit cascade deletion.

The quote detail review UI shows causing invoice folios, fiscal/consumption
states, evidence and reversal history. It handles repeated requests, pending
submissions, closing/cancelling and RPC errors explicitly. Reference customer
folios from the diagnosis are neither fixtures nor exemptions.

## Validation routes

The draft PR records exact run URLs, tested SHAs and terminal results. A passing
test on an earlier SHA is reported separately. PR/push versions of the Supabase
jobs are intentionally skipped and do not establish database validation.

| Coverage | Required runner |
| --- | --- |
| Full canonical Supabase chain and Drizzle journal replay | Both ephemeral workflows, with strict reviewed source-tree pins |
| Full-schema SQL/RLS, including `quote_charge_legacy_reconciliation.sql` and organization coverage | `.github/workflows/rls-db-tests.yml` |
| Reduced-schema RLS/ACL and nine real races | Explicit historical reconciliation step in the RLS job |
| Actual Auth/PostgREST tenant/role/DML checks | `.github/workflows/multi-tenant-ab.yml` |
| Six desktop/mobile review browser scenarios | Explicit A/B step; JSON guard requires six passes, zero skips/failures/flaky outcomes |
| UI/hooks/helpers and recurring handler regressions | Existing Vitest and Deno CI discovery |

The API suite covers reads and rejected cross-tenant/role/direct writes. Successful
reconciliation and reversal are covered in PostgreSQL, not through HTTP: the A/B
seed runs after 0107 and cannot create legacy invoices without bypassing the
tracking guard. The reduced harness creates genuine pre-0107 history. The
full-schema SQL suite prepares synthetic history in a rolled-back owner fixture,
re-enables its tracking trigger, then exercises the RPCs under authenticated roles.

Both disposable Supabase jobs require `workflow_dispatch` with
`run_supabase=true`. They create local synthetic organizations, verify the local
database and stop it during cleanup. They reject operational database URLs.
The reduced PostgreSQL harness owns a separate new cluster and accepts no
existing database, port or data directory. It loads the exact migrations plus
current canonical organization helpers; it does not substitute for the full
schema or Auth/PostgREST tests.

The concurrency runner observes blocking with `pg_blocking_pids` and requires
`row_security_active=true`, nine unique expected race IDs and
`COMPLETE races=9 rls=1`. Missing markers, skips or a process failure fail the
workflow. The races cover cross-quote assignment, idempotency, ordered
multi-quote locks, reconciliation/reversal/cancellation versus new billing,
reactivation in both winning orders, and quote editing.

In another authorized local environment with loopback permitted, after installing
the pinned dependencies:

```powershell
$env:RUN_LOCAL_QUOTE_CHARGE_TESTS = "1"
$env:PG_BIN = "C:\path\to\trusted\postgresql\bin"
node scripts/tests/quote-charge-legacy-reconciliation.test.cjs
node node_modules/@playwright/test/cli.js test --config playwright.quote-charge-review.config.ts
```

The separate `quote-charge-legacy-single-user.test.cjs` diagnostic runs without
sockets. It checks SQL compilation and sequential business behavior only; it
cannot establish RLS/ACL or concurrency and is not a CI substitute.

## Integration and operational boundary

The original LiftGO checkout on ASUS14 was preserved. The isolated publication
branch integrates over upstream `cf638f9d61f9dcdd0bf7937a8738913a1abc6a6b`, with
the repository's existing dependencies and PostgreSQL driver factory. No
`elogistix` checkout is involved. `AGENTS.md` was followed; the committed tree
contained no applicable `.agents/skills` directory.

Local PostgreSQL TCP and browser HTTP checks on ASUS14 were denied with EACCES;
their processes were stopped, and the denied connections were not retried or
bypassed. Authorized independent GitHub runners provide the real database and
browser evidence; standalone or mocked checks are not reported as equivalents.

The authorization covers the dedicated branch, draft PR and disposable synthetic
CI. Merging, app publication, production migrations, operational reconciliation,
permission changes on existing databases and fiscal operations remain excluded.
Keep the ledger and reversals when planning deployment or recovery. Never delete
review history or reset historical invoice tracking versions as a rollback.
