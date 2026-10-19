# Original-period billing after an extension

Migration `0109_nonrecurring_invoice_period_overlap` replaces only
`sync_invoice_bookings(uuid, uuid[])`. It adds no tables, triggers, new grants,
backfills, or changes to recurring-invoice generation.

## Acceptance contract

- Non-recurring booking periods are inclusive. An original January 1–10 period
  may be billed after a January 11–20 extension, including when that extension
  invoice is still a draft. January 10–20 overlaps and is rejected.
- Coverage checks include direct `invoices.booking_id` links and
  `invoice_bookings` links, within the invoice/booking organization.
- Existing `status <> 'cancelled'` behavior is unchanged. Draft and issued
  invoices both reserve their periods. A self-edit without another overlapping
  invoice remains valid.
- Missing or reversed dates on another non-cancelled, linked, non-recurring
  invoice are ambiguous coverage and reject the new save. The operator must
  review/reconcile the historical invoice rather than assume those dates are
  unbilled. The error is actionable and uses the existing `23505` code.
- Recurring bookings retain exact-period duplicate checks, including legacy
  partial-overlap behavior. This deliberately avoids changing only one side of
  the recurring generator/manual-invoice contract.

## Important historical-data limitation

Applying this DDL does not inspect or rewrite historical rows. However, a later
save of a historical overlapping draft through invoice synchronization fails
closed, even for a notes-only edit. Reconcile its coverage before editing it.
This is intentional: the sync RPC receives no trustworthy previous-period
snapshot, so an existing-link bypass would allow newly changed periods to
escape validation. Ordinary non-overlapping edits continue to work.

The scope is the existing synchronized invoice-saving path. This is not a new
universal exclusion constraint over every raw table write. Existing period,
range, RLS, grants, cancellation, and transactional-save rules remain in place.
No remote database application or deployment is part of this code change.

## Regression execution

`scripts/tests/test_nonrecurring_invoice_overlap.py` creates and drops its own
randomly named database on an explicitly selected loopback PostgreSQL server.
It uses a minimal schema plus scoped RLS, the original lock/sync functions,
and the exact new migration. Historical overlaps are seeded before applying
0109 to prove DDL application does not rewrite or reject historical rows.

```
RUN_LOCAL_OVERLAP_TESTS=1 PGHOST=127.0.0.1 PGPORT=54322 \
  PGUSER=postgres PGPASSWORD=postgres \
  python3 scripts/tests/test_nonrecurring_invoice_overlap.py
```

The `RLS DB tests` workflow runs it against a separate disposable database on
its local Supabase PostgreSQL server. Coverage includes direct/pivot mixes,
containment/partial/equal/boundary overlap, adjacent periods, cancelled and self
exclusions, unknown historical coverage, recurring legacy semantics, explicit
organization isolation, grants/invoker preservation, range checks, multibooking
atomic failure, and historical notes-only rollback.

The concurrency test uses two actual PostgreSQL sessions. It verifies that the
second is waiting on the advisory lock, commits the first, then requires the
second to reject with `23505` and verifies only one pivot association persisted.

This focused fixture is not a replay of all application triggers or the complete
`save_invoice_with_bookings` RPC. The existing full Supabase/Drizzle replay and
RLS/smoke CI suites remain separate required validation.
