# Atomic invoice source links

## Scope

`save_invoice_with_sources` wraps the existing invoice/bookings/damage save and extension draft claim / quote acceptance in one database transaction. It is SECURITY INVOKER and preserves existing RLS and invoice guards. Any rejected source link rolls back the invoice, booking pivots and damage link.

Creation with an extension or source quote uses the new RPC. Ordinary and damage-only saves retain their existing RPC. Editing never adds creation source effects. The form no longer performs a separate extension write or fire-and-forget quote update after saving.

The quote version is captured when its values successfully enter the form. A same-ID query refresh does not advance the version of those older form values. Only a sent quote transitions to accepted; accepted and converted quotes remain unchanged. Other states or stale versions reject the whole transaction.

The extension claim only sets `pending_invoice_id`; issuance and billing timestamps remain owned by existing issuance triggers. Another pending draft cannot be replaced through this RPC. Existing direct extension UPDATE clients are not hardened by this change.

## Deployment gates

1. Review the exact proposed commit and run the full schema/RLS replay in CI. The local PGlite fixture exercises real functions but is not a full-schema replay or multi-session concurrency test.
2. Validate the current target schema and rollout authority before applying migration 0127. Apply the migration before publishing the frontend that uses it.
3. Missing RPC fails closed. Do not restore separate client writes as a compatibility fallback.
4. No migration, production deployment, PAC call or real fiscal operation is part of this PR.

## Receipt uncertainty

A malformed response does not prove rollback. The client invalidates invoice/report/booking/quote readers and tells the operator to check the invoice list before retrying. It never retries the write or announces success. General creation idempotency remains outside this change.

## Reconstruction provenance

The original local commit 6dcd1bbb8e54a342e9087633d7828fde63fbdc83 was unavailable in the current execution environment and absent from GitHub. This branch was reconstructed on 1160d397748b3b23c54e6b9e4d1544eaaba2cafc and tested/reviewed anew. It must not be described as the identical complete tree or commit.

The migration subtree is independently verifiable: `drizzle/migrations` is `dfa04efa2f150d9a742ebf780e614190bc95512c`, matching the recorded prior reviewed subtree. Only 0127 and its journal entry differ from the baseline; historical migrations are unchanged. Frontend tests and this document were reconstructed and are not byte-identical claims.

Local checks: 102 frontend tests covering the save contract, receipt uncertainty, atomic form submission, quote-version prefill and existing invoice period/hydration behavior; 32 SQL fixture assertion groups; TypeScript, ESLint, architecture checks and offline production build. Full remote CI must independently pass before readiness. See `scripts/tests/invoice-source-transaction.md` for the local SQL runner and limitations.
