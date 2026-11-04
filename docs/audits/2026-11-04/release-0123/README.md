# Candidate receipt validation

This directory contains the SQL proposed to the official Lovable migration
tool. It is not a migration file and must not be copied into the canonical
Drizzle journal before that tool generates its next entry.

Reviewed candidate source: `7a39026d0397b9154262a6b263e4c049249b7cd8`, merged as
`d2a28d1f7cd37eee6809ae2d75459fe66ff1956a` (identical Git tree).

- Path: `control0123-receipt.sql`
- Exact UTF-8/LF size: 10,649 bytes
- SHA256: `3eb80b20b5acb18bbfe9726050ae8c22aa62e77fd908a6dceea9468b06ddb52d`
- Candidate status: requires the full-schema gate and final review before use.

## Full-schema gate

The RLS workflow runs the exact candidate immediately after the complete
canonical Supabase/Drizzle replay, before SQL suites create transactional
fixtures. It uses the workflow's existing disposable loopback database only.
The runner checks the candidate bytes before opening psql, executes them in a
read-only transaction ending in rollback, checks the receipt's success notice
and completion markers, and compares the complete migration ledger before and
after. It never inserts a receipt row or applies a canonical `0124`.

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

## Official application remains separate

Before any official call, the coordinator must verify the approved checkout,
fresh target ledger and exclusive executor, plus the actual tool's transaction
contract. A SQL exception only rolls back its current transaction; this gate
does not certify that a platform wrapper commits 0123 and the receipt together.
Production owner/ACL snapshots before and after remain necessary.

The coordinator supplies only the reviewed receipt payload to the official
tool, which generates the next `0124` file and journal entry. Do not precreate a
second `0124`, duplicate 0123, invoke another migration path or insert ledger
rows manually. Resolve uncertain outcomes with fresh reads before another call.

After generation, compare the SQL byte for byte with this candidate and review
all generated journal/snapshot changes. Only then update the strict source-tree
pin from the actual reviewed Git tree. Do not guess a future pin or exclude the
portable receipt from CI; once canonical, it must execute in the replay.

No production migration, reconciliation, fiscal operation, Edge deployment or
frontend publication is performed by this gate.
