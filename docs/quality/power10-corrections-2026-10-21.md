# Power of Ten: corrections and release gates

Base reviewed: `05b52cc75af17ac910951b974b02aecdb0f72d81` (8.44.23).
Target: 8.44.24. This record describes source changes, not proof of deployment.

| Finding | Correction | Acceptance evidence |
| --- | --- | --- |
| H01 Mixed-rate REP | Tax bases derive from canonical line bases and proportional gross payment, not a single tax divisor. | Full and partial mixed-rate fixtures, discounts and rounding; sandbox only for any external fiscal test. |
| H02 Suspended organization | Shared human-caller organization resolution rejects inactive/missing organizations and fails closed on lookup error. | Denial before PAC/secrets/claims. Existing service-role reconciliation and jobs remain unchanged; this is not a blanket disablement of those jobs. |
| H03 Missing FX | Foreign TC 1, missing/nonpositive/nonfinite rates are excluded with warnings in ER and supplier summaries. | Disposable PostgreSQL, total/detail agreement, cash/accrual and ACL snapshots; full-schema CI remains required. |
| H04 Stale invoice CSV | Verified identity/company/permission/filter context owns each download; context changes abort pages and invalidate the final save. | Hook, real-page lifecycle, pagination and queued-cancellation regressions. |
| H05 Incomplete PAC | Unknown/incomplete responses do not prove cancellation or stamp success. Uncertain outcomes preserve pending claims. | Offline handler fixtures; no live timbrado/cancellation required. |
| H06 Optional logo | Data exports fetch company data without image loading; PDF logo attempts have deadlines, cancellation and safe retry. | Timeout, body/read failure, cancellation and cache regressions. |
| H07 Release identity | Deterministic source identity is embedded in compiled app and checked against manifest and explicit approved baseline. | Identity contracts plus built-app/browser acceptance. Coherence-only scheduled smoke is not release approval. |
| H08 Dependency contracts | Existing dependency contract suite runs in CI on relevant changes and manual runs. | Existing eight dependency contracts, frozen lockfile; no new dependencies. |

## SQL activation is separate

Migration `0119_income_statement_fx_validity.sql` changes only the bodies of:
- `get_income_statement(date,date,text)`.
- `get_income_statement_documents(date,date,text,text,text,text[],integer,integer)`.

It preserves signatures, ACLs, roles, RLS, stored data, and the global `fx_is_missing` helper. Exact preimage and replacement-count guards reject unexpected drift. The document function's canonical fingerprint is synchronized in the same transaction. Do not alter historical migration 0118 or mark an applied migration absent.

Before applying: exact-head full-schema CI, independent review, fresh function/source/ACL preflight and explicit authorization for this SQL and registration. Afterwards: compare definitions and security metadata, verify registration and read-only total/detail behavior. Rollback, if needed, is a separately reviewed forward migration restoring both matching definitions; it is not an automatic reversal of someone else's work.

## Edge activation is separate

The shared human-caller guard affects these functions. Deploying only `cancel-cfdi` would close that path but leave different suspension behavior in the other consumers. The activation bundle must explicitly list and verify each deployed function:

1. stamp-cfdi
2. download-cfdi
3. generate-recurring-maintenance
4. validate-supplier-rep
5. validate-receptor-tax-info
6. stamp-credit-note
7. reconcile-stamping-invoices (human path only)
8. stamp-payment-complement
9. generate-recurring-invoices
10. refresh-cancellation-status
11. classify-feedback-report
12. cancel-payment-complement
13. generate-manual
14. cancel-cfdi
15. validate-customers-tax-info
16. cancel-credit-note

Existing service-role branches/jobs are intentionally preserved. No role, RLS, persistent credential or access expansion is included. A repository commit alone does not establish that Edge production has this code. Require deployment receipts and safe verification; do not send real fiscal requests to establish deployment.

## Release acceptance

1. Obtain approval for the exact Git/PR/merge, SQL and Edge bundle where required.
2. Verify current remote HEAD and reject unrelated drift. Run required CI on the exact proposed SHA, including full-schema, Deno, typecheck, lint, dependencies and build.
3. Regenerate the release manifest after source edits. Pin the approved version and source identity outside the deployed site.
4. Apply only approved SQL/Edge changes and verify each independently.
5. Publish the reviewed frontend to the authorized Lift GO destination and run explicit expected-version/expected-source acceptance plus existing auth/telemetry smoke.
6. Mark findings deployed only with their own evidence. Report source-ready, CI-ready and active separately. Never auto-revert an unrelated release.

The source identity is not a reproducible bundle-byte signature and does not certify that SQL or Edge sources were activated. It detects stale/mixed releases when compared with the separately approved baseline.
