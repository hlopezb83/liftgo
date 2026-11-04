# Canonical receipt validation

This directory retains the reviewed SQL supplied to the official Lovable
migration tool. The tool generated the canonical
`0124_control0123_verified_release.sql`; this audit copy remains its exact-byte
reference and is not another migration.

Reviewed candidate source: `7a39026d0397b9154262a6b263e4c049249b7cd8`, merged as
`d2a28d1f7cd37eee6809ae2d75459fe66ff1956a` (identical Git tree).

- Path: `control0123-receipt.sql`
- Exact UTF-8/LF size: 10,649 bytes
- SHA256: `3eb80b20b5acb18bbfe9726050ae8c22aa62e77fd908a6dceea9468b06ddb52d`
- Canonical source: `bbc0eb75be647ed39bc9b5c1961019a2488be834`.
- Journal: idx 124, when 1793809897588; 0124 is included in the CI replay.
- The coordinator confirmed the official application of 0123 and 0124. Do not
  invoke the migration tool again for this already applied batch.

## Full-schema gate

The RLS workflow runs the exact candidate immediately after the complete
canonical Supabase/Drizzle replay, before SQL suites create transactional
fixtures. It uses the workflow's existing disposable loopback database only.
The runner checks the reviewed bytes before opening psql, executes them in a
read-only transaction ending in rollback, checks the receipt's success notice
and completion markers, and compares the complete migration ledger before and
after. The preceding canonical replay applies 0124 normally. This separate
read-only step accepts the existing 0124 ledger row and neither registers a
second row nor reapplies the functional migration.

The existing full RLS, smoke and concurrency suites remain enabled. Reduced
schemas and offline runner unit tests do not replace this PostgreSQL execution.
The previously reported fourteen altered-catalog checks are not versioned here
and are not claimed as coverage of this gate.

The receipt checks eighteen function bodies/attributes, twelve effective
EXECUTE expectations, two new tables, selected policies/constraints/indexes and
seven triggers. It does not establish every RLS expression or permission of
existing functions. The normal full-schema RLS suites still test tenant and role
behavior. The runner also captures the owner, raw ACL and effective privileges
of six replaced functions as a separate CI artifact; it does not rewrite or
normalize their permissions to satisfy the receipt.

The application-role assertions do not cover privileged platform roles. The
coordinator observed existing SELECT/INSERT defaults for sandbox_exec and
sandbox_exec_zxefrzfaynnfwazqhwxp, both LOGIN/BYPASSRLS. This gate does not claim
isolation against those roles and does not modify their permissions.

## Scope of the official application evidence

The target application and fresh ledger/catalog checks were coordinated through
Lovable, separately from this CI gate. This repository review does not determine
who responded to the platform approval. A SQL exception only rolls back its
current transaction; the gate does not retrospectively certify a platform
wrapper's transaction boundaries. Production owner/ACL comparisons remain
separate evidence.

The five generated files and their source were reviewed without changing the
0123/0124 SQL. The Drizzle source-tree pin is the actual canonical tree
`799956d08ec0161c5560f8d3d9505fdf66dc4861`. Only the two previously pinned,
target-bound 0108/0110 controls are excluded; 0124 remains executable, giving
123 replay migrations from 125 canonical entries. Its empty snapshot follows
the repository's existing snapshot convention and does not attest schema/ACL.

No production migration, reconciliation, fiscal operation, Edge deployment or
frontend publication is performed by this gate.
