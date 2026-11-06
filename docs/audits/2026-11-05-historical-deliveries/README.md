# Historical delivery reconciliation

## Scope and authorization

The user explicitly approved administrative reconciliation of eight HERREN ENERGY deliveries on 2026-11-05, using reservation start dates for six closed rentals and sale invoice issue dates (2025-10-20) for two sales. This is administrative classification, not a new physical delivery or fabricated receipt/signature. The sale-to-invoice correspondence was verified by exact equipment code and serial in the invoice line. Operational and fiscal rows remain unchanged.

The migration adds a read-only ledger for existing authorized delivery readers. There is no new client mutation API, role, credential, or expanded permission. RLS inherits current organization and delivery visibility. Ledger evidence contains no invoice amounts, customer information, XML or fiscal identifiers. A separate owner-only, bounded script applies precisely eight entries with strict source checks, bounded locks and an idempotent replay check.

Original rows in deliveries, bookings, forklifts, invoices, payments and invoice_bookings are hashed before/after in the same transaction. No original business guard is bypassed, disabled or replaced. Missing/changed evidence aborts all eight. SQL audit entries preserve ledger creation and optional later owner-managed revocation. Revocation cannot rewrite historical fields or delete the ledger; the UI should restore revoked entries to pending visibility.

## Deployment order

1. Review the exact migration, data script and integrated UI. Run repository checks.
2. Apply migration 0126 transactionally and register its exact hash in the existing Drizzle ledger using the established deployment procedure.
3. Reload PostgREST schema (`NOTIFY pgrst, 'reload schema'`) before publishing the UI relation.
4. Execute the reviewed one-time data script only after the authorized production preflight, then inspect eight ledger rows and their audit entries. The script checks all six protected tables, including the previously regularized deliveries.
5. Deploy the reviewed UI. Verify the authenticated relation and filtered history/operational pending counts. Do not interpret public-route availability as authenticated data validation.

No production application or publication is implied by committed test output.

## Focused SQL tests

Run `scripts/test-historical-deliveries.sh` with psql on PATH, PGHOST pointing explicitly to localhost, PGDATABASE naming an EMPTY disposable `historical_delivery_test_*` database and current_user=postgres. The fixture is synthetic and must never be applied to the product database.

The recorded PostgreSQL 17 suite covers eight exact targets, authorized dates, null-safe predicates, immutable original tables, idempotent replay (eight audit entries), failure at the last sale rolling back the prior seven, same-tenant delivery visibility, cross-tenant denial, internal-member restriction, authenticated/anonymous/service-role ACLs, owner cross-organization rejection, immutable ledger fields, null-reason revocation rejection, audited revocation and reactivation denial.

These are focused PostgreSQL tests with modeled auth/RLS helpers, not full Supabase migration replay or authenticated PostgREST/UI verification. Full application checks and live verification are separate gates.
