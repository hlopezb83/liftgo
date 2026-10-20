# Staged activation review: accepted history, execution still gated

Updated 2026-10-19 after the owner's 17:16:44 UTC decision. **Historical provenance risk is accepted for the exact pinned 106-row history. Activation is not ready and nothing has been applied or deployed.** The original R2 and logistics manifests remain frozen historical plans; they cannot authorize publishing the newer source unchanged.

## What changed

- The owner accepted retaining the ten known checksum differences and identified historical extra row without rewriting history, despite six original applied payloads remaining unrecovered. The owner also accepted the consequence that a later failed stage leaves earlier committed stages installed for forward recovery. `historical-risk-decision.json` records the approved decision summary and bounded scope.
- A new read-only ledger SELECT was observed from **17:17:42.974 to 17:18:00.997 UTC**. All 106 IDs/timestamps/full hashes are unchanged. No 0105–0107 entries, additions, removals, changes or duplicates were found. These are client-observed bounds, not fabricated server execution timestamps. This point-in-time read was outside an established writer freeze.
- The current candidate is **e38a34e1e0352f881d15edd2cfebdd2ed2489f00**. It is restored 995ac32d plus PR294's reconciler persistence correction and regression test, exactly two changed paths. The 108-entry journal and migration bytes remain unchanged. The independently checked postmerge CI and Gitleaks runs succeeded at that exact source. Source equality/change review does not attest a deployed runtime.
- Publication must bind **stamp-payment-complement**, **generate-recurring-invoices** and **reconcile-stamping-invoices**, plus the frontend and non-Edge server-runtime bundle containing `platformFiscalActions.server.ts`. The latter is also an affected writer whose old revisions/executions must retire.

See `current-candidate.review.json`, `source-e38-report.json` and `staged-activation-design.current.md` for the complete candidate and staged recovery design.

## Frozen evidence versus the accepted-risk decision

The immutable baseline file remains `historical-baseline.review.json`, SHA-256:

`8d8a0ba626c93bd9686d2f666d4ab99ffea7ce8beb097aba1741b1a670b05242`

Its 106 canonical sorted rows have SHA-256:

`f2bc2dbeb7b66b35efbcb9e5a1737f8d683137e77727f0abae4be52564951705`

Do not edit those bytes to update a status or source SHA. The acceptance and current source live in separate, hash-bound sidecars. The baseline's older `NOT_APPROVED` status and 995ac32d binding describe the preserved artifact when created. The unchanged comparator does not ingest conversation approval and deliberately returns that original metadata. It does not contradict the subsequently accepted historical risk recorded here, nor approve an execution route.

The standalone comparison has no database/network/write path and is not wired into the repository migration guard. No generic ignored-hash exception or ledger repair was implemented. The repository exact-prefix gate still fails and remains unchanged. A reviewed supported execution contract must explicitly reconcile the separately accepted baseline criterion with that guard before use; do not merely skip the guard because this tool exits zero.

## Reproduce the check locally

From this directory:

```sh
python compare_ledger.py \
  --baseline historical-baseline.review.json \
  --baseline-sha256 8d8a0ba626c93bd9686d2f666d4ab99ffea7ce8beb097aba1741b1a670b05242 \
  --ledger refreshed-ledger.snapshot.json \
  --expect-stage baseline
python -m unittest -v test_compare_ledger.py
python independent_compare_checks.py
```

35 unit tests and 668 independent mutation/input checks were rerun and passed against comparator SHA-256 `16960585dad9328e4961b1e1a38007647e55b28eb73acd75672766d272c49253`.

Comparison success is **OBSERVED_HISTORY_MATCH**, independent from **EXACT_CURRENT_PREFIX_MISMATCH**. Both remain true after the owner's risk decision. At future checkpoints the only permitted additions are the original exact 0105 → 0106 → 0107 pairs, giving **106 → 107 → 108 → 109** rows. A later checkpoint does not silently satisfy an earlier requested stage. A 108-file journal does not imply 108 applied rows because the historical extra remains.

The checker rejects added/removed/changed/duplicate rows, malformed inputs, upstream-error wrappers and artifact-pin changes. New serial IDs must be unique and above the original maximum 107, with gaps permitted. It validates a supplied snapshot only; it cannot prove its provenance, target, exclusivity, data coverage or runtime drain. Exit 0 never means ready to activate.

## Remaining concrete execution proofs

1. A supported official runner must atomically apply each whole unchanged SQL file and its authoritative original timestamp/hash ledger entry; name the executor and demonstrate exclusion of competitors throughout preflight, all stages and verification. A separately reviewed runner can meet the contract; ad hoc ledger inserts cannot.
2. Demonstrate admission fencing, retirement of old Edge **and server** executions, and retirement of already-dispatched database writes. A UI flag, cron pause, deployment completion, 30-second PAC timer, 504 or empty activity snapshot is insufficient. Proposed gate/registry/database-fence controls are designs, not installed features.
3. Choose the two-organization window and sustainable failed-stage hold, with a named reopening owner. Before 0107, prove actual-actor RLS/org coverage against authorized whole-target quote counts and identity coverage. Prior observations were 176 quotes/311 lines in two organizations; do not use them as current affected-row receipts. Verify intended version/timestamp/audit effects and stable business values.
4. Review actual effective access of the new availability RPC and replaced RPCs. Required permission confirmations remain separate. No RLS disablement, privilege increase, trigger bypass or tenant-context substitution is proposed.
5. For an uncertain call, establish that its original executor/session/transaction is terminal or safely rolled back **before** ledger absence can support retry. Refresh ledger/object state in a new transaction; never replay a committed 0107 or undo earlier protections to reopen.

The 14 observed legacy review-required quote paths constrain future source-linked billing, not migration success. No historical invoice attribution is inferred. Recurring-invoice cron jobs were absent; do not enable them while restoring captured prior job states.

The PR-ready package is documentation plus an offline reader/test harness. It does not modify production source, migrations, the existing migration guard, access controls or deployment configuration. Supporting source API responses and full verification inventory are retained locally; the compact source report links the immutable commits and runs needed to repeat the check.
