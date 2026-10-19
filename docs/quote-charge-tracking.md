# Persistent quote charge tracking (migration 0107)

## Contract

- Quote JSON rows receive a stable `quote_line_id` UUID and `line_kind`.
  Exact built-in logistics/insurance labels additionally receive `charge_kind`.
- Automatically sourced invoice charges retain `source_quote_id` and
  `source_quote_line_id`. Their quantity is the claimed quantity; `total` is
  gross (quantity × rounded unit price), with discount applied once to totals.
- `get_quote_charge_availability` returns one JSON object with `complete: true`
  and all requested quote rows. The client rejects omissions, duplicate IDs,
  invalid quantities and unknown legacy history. It has no invoice-page cap.
- Drafts reserve quantities. Cancellation of an unfiscalized invoice or accepted
  fiscal cancellation frees them. Stamping and pending fiscal cancellation keep
  the reservation. Credit notes do not automatically free source quantities.
- New invoices use tracking version 1. Existing invoices keep NULL. Editing a
  legacy invoice cannot silently upgrade it or infer origins from descriptions.

## Database enforcement

Invoice writes lock source quote rows in UUID order. After acquiring the lock,
quantity is recomputed across all active invoice lines, independent of booking
or pivot pagination. The same rule applies to manual and recurring creation.
Writes carrying sources require READ COMMITTED isolation to prevent stale
repeatable-read snapshots from bypassing the aggregate check.

Source IDs must be canonical UUID strings; source quantity/price/discount must
be finite and valid. Customer, currency, price, discount, gross amount and final
quote/booking association are checked server-side. The existing manual RPC,
RLS roles and grants are preserved. The new availability RPC permits the existing
invoice readers (admin, administrativo, auditor) and service role.

Once issued or claimed for stamping, source-backed invoice lines cannot be
removed/replaced or reverted to draft. Used quote source lines cannot be
repurposed. Pivot edits validate both parents; pivot deletion/move and booking
quote changes serialize against invoice edits or return a retryable conflict.

A partial fixed-dollar discount requires review; the implementation does not
silently prorate it. Percentage discounts are calculated on the remaining
quantity. Recurring totals honor each line's tax rate and tax exemption.

## Existing data and activation

0107 changes existing quote JSON only to initialize source metadata. It does
not match historical invoice lines to quotes or mark historical charges paid.
Ordinary quote update triggers also advance versions/timestamps and may create
audit entries; open editors must reload their quote versions after activation.
The GIN index and source initialization require a reviewed maintenance window
appropriate to actual table size.

Historical invoices are associated through direct quote links, direct booking
links and booking pivots. Only exact known rental/sale generator formats are
recognized as rental-only history. Other untraced lines (or positive amounts
without lines) require explicit historical review. No reconciliation/backfill
workflow is introduced by this change.

The database must be activated before the updated UI/recurring function. Old
clients attempting untraced automatic charges after 0107 fail closed and must
reload. A production or Lovable migration is not part of this PR. Before
activation follow `docs/migrations.md`: review the final SHA and CI, verify the
correct project's ledger, then explicitly authorize and verify the migration.

## Verification

- `node --test scripts/tests/recurring-quote-charges.test.mjs` runs dependency-free
  parser/quantity/discount/tax tests. The same cases run in normal Vitest.
- `supabase/tests/rls/quote_charge_tracking.sql` exercises persistent identities,
  draft reservations, partial quantities, cancellation/reissue, issued locks,
  marker opt-out, role/tenant access and own-invoice exclusion in a rollback.
- `tests/multi-tenant-ab/quote-charge-tracking-api.spec.ts` uses ordinary Auth
  login and PostgREST in the existing local-only A/B gate: own/cross-tenant
  availability, complete-response refusal, partial draft reservation, exact
  remainder, atomic overconsumption rollback and marker opt-out rejection.
  It does not manufacture historical rows by bypassing product guards; genuine
  pre-migration legacy history is covered separately by the SQL fixture.
- Existing E2E rental fixtures now declare `line_kind: rental`, including the
  forward definition of `e2e_seed_scenario`; its role checks and grants remain
  unchanged. There is no test-user exemption from the new provenance guards.
- Full Supabase migration replay and Auth/role gates remain required in CI.
  Focused PostgreSQL validation is not evidence of remote migration activation.
