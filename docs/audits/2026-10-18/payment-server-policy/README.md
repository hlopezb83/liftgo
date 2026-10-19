# N7/N8 — canonical server payment policy, proposed activation

This change aligns invoice-currency payment conversion, rounding, maximum and status. On 2026-10-19 the coordinator confirmed official application of0103 and independent readback. This branch adopts that official journal and snapshot without changing the SQL. **Do not apply0103 again or insert ledger rows.** Client publication and end-to-end QA remain with the coordinator. K1 is separate and inactive.

Integration base: official main `ff6e6146eb925c53a3caa3e585019b87cbc233b7` plus N5 `f95aac98f506a4cc18424c14932dffe1272ea1bf`. Current client candidate:8.44.11, following N5 release8.44.10. The original evidence below was recorded for candidate8.44.9 before that release-order reconciliation. No Chrome, deployment, published migration, permissions/account change, real transaction or data backfill was performed here.

## Product and policy

`drizzle/migrations/0103_canonical_payment_invoice_currency.sql` is forward-only, registered as journal entry 103. SHA-256 of its LF bytes: **`9261e8b61c0f699ae57b336a36982a4acf4868e2984712302ac92d0222e91271`**.

| Existing function/trigger | Change |
| --- | --- |
| `enforce_payment_within_invoice_total` | Convert each persisted-source amount through `fx_convert_amount`, round each contribution before summing, reject unknown/non-finite FX and strict canonical overpayment. Preserve invoice/advisory locks, draft/cancelled and PUE checks. Include currency/rate-only updates in its trigger. |
| `sync_invoice_status` | Use that same per-payment sum; preserve organization scope, active-credit-note predicate and historical status/PUE thresholds. Unknown/non-finite legacy amounts leave status unchanged rather than manufacturing a paid status or blocking reparative notes/deletion. |
| `guard_invoice_status_integrity` | Verify paid status with the same sum, FX checks and scoped children; retain cancellation rules and existing bypass conditions. The real trigger is installed in the fixtures, preventing a false positive from an omitted dependent guard. |
| `enforce_credit_note_max` | Retain the current active-REP cap and credit-note rules; convert each REP-backed payment canonically rather than rounding an aggregate based on the old FX formula. |
| `enforce_payment_matches_invoice_currency` | Normalize currency case and check the canonical conversion. |
| `trg_payment_amount_mxn` | Derive MXN from the source cents that will actually persist; include currency-only updates in its trigger. Other existing rate-fallback semantics are retained. |

The three money-only payment functions return early for an **exactly identical raw** amount/currency/rate/invoice tuple. Thus the dialog can submit its unchanged amount while editing legacy notes. REP, date, fiscal-period and organization triggers still execute. The candidate never normalizes `NEW.amount` before REP checks: stamped `.02 → .015` still rejects even though both would round to `.02`.

There is no GRANT, REVOKE, function ownership change, global permission expansion or replacement of the canonical FX helper. CREATE OR REPLACE preserves the existing functions' ownership/ACL. The migration changes six existing function bodies and two existing trigger definitions. The six recorded REP/date/rounding guard definitions remain identical in the guard suite.

The client removes the extra invoice-cent overpayment allowance. It validates the exact rounded source amount that the dialog submits, then compares invoice cents. Its inverse conversion is a **reference**, not the admission predicate: USD100/TC17.5 permits MXN1750.08 because it rounds to USD100.00; MXN1750.09 rounds to USD100.01 and rejects. The message labels the inverse amount as a reference.

`paymentCurrencyRounding.ts` uses decimal rational BigInt arithmetic and PostgreSQL numeric half-away-from-zero rounding. This avoids currency.js pre-rounding a value just below a half-cent up to the next cent. SQL and client both accept MXN43750.09 at TC17.500001 as USD2500.00. Same-currency source rounding and submission use this helper too; non-finite edits fail closed. This does not replace the application's general money library.

## Evidence

| Comparable execution | Before | After |
| --- | --- | --- |
| Policy suite, 106 identical expectations | 62 pass / 44 fail | 106 pass |
| Guard suite, 69 identical case IDs | 59 pass / 10 fail | 69 pass |
| Four two-session races, committed and read from a third session | 4 pass | 4 pass |
| Strict client maximum/source rounding, new test | 1 pass / 2 fail | included in final client regression |
| Decimal boundary/half-away/non-finite client, new test | 3 fail | included in final client regression |
| SQL-derived conversion/maximum corpus | baseline comparison recorded separately | 53 checks; see policy-tests report |

See `guard-tests/README.md` and `policy-tests/README.md` for exact statements, SQLSTATE, assertions, sources, hashes, local target and setup incidents. The first policy green attempt deliberately remains recorded as 105/106: it caught the derived MXN source-rounding omission. The 106-case final green uses the migration hash above. Neither setup failures nor the candidate-01 failure are claimed as a final pass.

Client logs preserve the sequence: `client-before.txt`; the first expanded run `client-after.txt` caught a missing MXN code in the new message; `client-after-final.txt` passed 254 checks before the decimal boundary was found; `client-decimal-before.txt` reproduces those three further failures. Final public-tree checks are in `client-final.txt`, `lint-public.txt`, `typecheck-public.txt`, `build-public.txt` and `publication-checks.txt`. Use their explicit exit codes and counts; no incomplete run is described as green.

Both SQL clusters are disposable loopback PostgreSQL17.9 with synthetic data. Fixtures do **not** restore all Supabase objects, identity, RLS/ACL, organization-write/audit/notification triggers or every invoice/credit-note trigger. The organization cases test code scope under stubs, not real-role authorization. Reparented-payment old-invoice synchronization, concurrent credit-note issuance, invoice-total edits and other financial/report consumers are not claimed fixed. Rows malformed across organizations are not evidence of a published exploit. Existing unknown-FX statuses are not backfilled or automatically repaired.

## Public evidence boundary and reproduction

Original deployment-target, ACL and ledger captures and the coordinator's exact-target/consent packet are retained **privately**. Automatic approval review rejected their publication, and additional full raw **remote GitHub Actions** log publication. These new captures are excluded from this PR's diff; this branch starts at main rather than the private working branch. Public `source-functions.json`, `source-derived-function.json` and fixture metadata contain only function definitions and trigger SQL, without project/backend identifiers, ownership, real ACL roles or ledger rows. SQL results contain synthetic fixture rows only. Local execution text, manifests and commands have user-profile paths replaced with `<user>`; original unsanitized copies remain local. Raw policy-suite `.log` files remain local; their complete structured result JSON and a concise execution summary are public.

`generate-migration.mjs` regenerates both migration and definition-only rollback from those sanitized code sources without a connection. Its output hash is identical to the SQL tested before sanitization. The guard-fixture preparation now verifies already supplied synthetic baseline files; runner changes only use normal package resolution and the local candidate path instead of sibling-worktree paths. These packaging changes do not alter SQL cases, statements, destination restrictions or recorded expectation results. Original execution artifacts remain private where necessary; no private capture is reconstructed from public inputs.

```powershell
node docs/audits/2026-10-18/payment-server-policy/generate-migration.mjs
node docs/audits/2026-10-18/payment-server-policy/guard-tests/prepare.mjs
bun scripts/check-drizzle-journal.ts
```

Only start fixture runners against their fixed loopback ports/databases after creating fresh local clusters; the runners verify identity before writing. Their schema-reset statements are fixture-only and must never be transplanted into an application migration.

## Activation and non-destructive compensation

The coordinator privately holds target, ledger and ACL/ownership comparisons. Official0103 is now present in main with its exact journal timestamp and snapshot; SQL LF SHA256 remains9261e8b61c0f699ae57b336a36982a4acf4868e2984712302ac92d0222e91271. No application was executed by this worktree. Do not replay0103, modify its SQL or manually edit ledger.

The coordinator verifies official readback, unchanged privileges and REP guards before publishing the matching strict client. The client code is byte-identical to reviewed e51f16d; this integration adds N5 and harmonizes only release metadata and the official journal/snapshot. CI of the final head and isolated authorized QA remain required. K1 requires its own approval/application; this branch does not contain0104.

`rollback-reviewed-functions.sql` is a **proposal** for a compensating forward migration restoring the previous six definitions and two trigger definitions without changing data or permissions. Never delete/reverse ledger history. First withdraw the matching client change selectively and evaluate payments already accepted under the new policy; do not automatically change or delete those payments. Restoring old definitions reintroduces the demonstrated FX bugs, so prefer an approved forward fix. A rollback needs fresh fingerprint checks and its own explicit approval, not automatic execution of this artifact.
