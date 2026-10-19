# control0108: local validation candidate

**Status: review only. Not an application migration or an activation authorization.**

A hardened assertion-only version of the proposed control0108 passed 70 PostgreSQL17 positive/adversarial checks, six offline generator checks and three explicit local transaction scenarios. The SQL template contains unresolved security/contract placeholders and is intentionally non-executable. It is not included in the application journal.

The exact reviewed 0105–0107 source hashes, original proposal hash, tested synthetic render hash, test inventory and limitations are recorded in `validation-summary.json`. Callable function contracts are in `function-contracts.json`.

## What improved

- Exact accepted 106-row history; exactly 109 rows before the control's registration; unique/non-null ledger identities; exact source timestamps/hashes; increasing 0105→0106→0107 IDs above 107. Sequence gaps remain valid.
- All 15 function bodies and callable/security contracts: returns, SETOF, STRICT, OUT names/types, defaults, owner, language, volatility, function kind, parallel/leakproof settings and search_path.
- Exact prior owner/full ACL for the three inherited RPCs. New-function ACLs use a deliberately conservative local baseline; unexpected platform default grants require review.
- Nine trigger contracts, two invoice columns, CHECK and GIN index; safe catalog namespace resolution.
- All-organization aggregate visibility, including FORCE RLS; canonical quote identities, duplicate detection and source-defined logistics/insurance initialization. Existing historical invoice origins are not invented.
- Fail-closed malformed security baseline and source-generation validation, including Python optimization and removal of stale output after a failed rebuild.

## Observed local outcomes

| Explicit harness scenario | Final ledger rows | Result |
| --- | ---: | --- |
| 0105–0107 plus control in one transaction, success|110|All staged objects and registrations commit|
| Same transaction, control rejects|106|All attempted changes roll back|
| 0105 and0106 already committed, 0107/control rejects|108|Earlier stages remain; 0107 objects and registration absent|

Tests used fabricated business rows, a focused schema, exact reviewed SQL and preserved technical ledger evidence. A valid fixture with different inherited/new owners passes; hardcoding `postgres` would falsely reject it. A malformed quote in a second organization is detected. Test databases were removed and the server stopped. This evidence is local; no CI or production execution is claimed.

## Boundaries and next step

The accepted historical baseline retains 10 known checksum differences and one identified older entry. Six original historical payloads remain unrecovered. Preserving that history does not make it an exact current-journal prefix and does not authorize runtime activation or ledger rewriting.

This control requires original reviewed timestamps and rejects a generated-timestamp substitution. It cannot prove an inaccessible migration wrapper's selection, transaction scope, registration, error propagation or timeout termination. A passing local test does not establish deployment identity, exclusive execution, admission control or termination of old REP and other writers.

Before a target version can be proposed, obtain independently reviewed target owner/inherited-ACL/default-ACL evidence and a verifiable runner contract. Validate that exact runner in isolation, with each intended SQL/ledger/control transaction and recovery checkpoint, before opening another production window. Do not alter owners, access grants, historical SQL or ledger records merely to satisfy this checker.
