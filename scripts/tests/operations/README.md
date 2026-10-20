# Operational audit corrections (OP01–OP05)

Migration: `0115_operational_audit_corrections.sql`. It is additive and does not
modify historical migration files, backfill dates, invoice charges, change RPC
roles, or alter existing row-level permissions. The new internal snapshot table grants
no client access, so inspection readers receive no additional financial data.

## Behavior

- OP01: quote assignment matches `equipment_model_id`, just like conversion.
  Stale labels do not hide available units. Different or missing IDs remain
  excluded; label-only matching cannot safely satisfy the conversion RPC.
- OP02: an authenticated completed delivery INSERT derives its actual occurrence
  from the selected date and optional time in America/Monterrey. Date-only input
  represents midnight of that day. The server rejects a future occurrence and
  ignores any supplied browser timestamp. `created_at` remains the capture time.
  Ordinary completion updates still use server time, and already-completed dates
  remain immutable outside the existing audited administrator correction.
- OP03: administrator annulment retains damage and repair records, audits their
  association with the annulled inspection, and detaches only resolved/archived
  damage without invoice dependencies or unfinished/unverifiable repair orders.
  It then uses the established inspection annulment and custody reopening flow.
  The audit contains the full original inspection and the original damage link.
  Active damage, any linked invoice, other organizations, and non-admin callers
  remain blocked. No damage is hard-deleted. Dependent damage caches refresh.
- OP04: successful booking cancellation invalidates delivery and quote roots as
  well as the booking, so mounted consumers and inactive cached details refresh.
- OP05: a single server trigger authoritatively calculates excess hours and its
  suggested charge for both completion and correction, using the same calendar
  month allowance as the existing completion RPC. It snapshots the allowance and
  rate in a private, RLS-enabled table with no client grants and an explicit deny-all policy. Subsequent usage corrections
  do not reprice a changed contract or booking. Usage at/below the allowance clears
  both suggested fields to NULL, consistent with existing completion behavior.

### Historical pricing limitation

For an older inspection without a snapshot, correction recovers the original
basis only when its booking and original contract have not been modified since
capture. It then saves that basis. If those timestamps cannot establish the old
terms, correction stops with an explicit administrative-review message instead
of inventing historical pricing. No historical rows are bulk rewritten. This
conservative blocker is intentional; reviewed historical repair remains an
administrative operation, not an automatic repricing fallback.

## Focused frontend regressions

Use Node (the existing dependency installation has known Bun/Zod interop limits):

```sh
node node_modules/vitest/vitest.mjs run --maxWorkers=1 \
  src/features/quotes/components/quotes/__tests__/EquipmentAssignmentDialog.audit-model-identity.test.tsx \
  src/features/bookings/hooks/__tests__/useCancelBooking.audit-cache.test.tsx \
  src/features/deliveries/lib/__tests__/deliveryFormSchema.test.ts
```

The component tests cover matching IDs after a catalog rename, false label
matches, missing IDs, and server availability exclusion. The actual mutation-hook
regression observes the actual delivery and quote query roots via TanStack Query.

## Executable PostgreSQL regressions

Use an already-installed trusted PostgreSQL distribution:

```sh
RUN_LOCAL_OPERATIONS_TESTS=1 PG_BIN=/absolute/path/to/postgresql/bin \
  node scripts/tests/operations/run-operational-corrections.mjs
```

`supabase/tests/rls/operational_audit_corrections_0115.sql` is also discovered
by the existing full-schema RLS gate. It uses real claims/profiles, supported
repair/archive RPCs, and rolls back its fixtures; no CI changes are needed.

The launcher creates its own temporary cluster on a new localhost port, never
uses an existing database URL, and stops the cluster in `finally`. It loads exact
repository completion/correction RPCs, then applies the entire new migration.
The fixture preserves the damage-to-inspection FK and checks authenticated,
non-admin, cross-organization, and anonymous boundaries. It uses synthetic auth
helpers and focused tables; it is not a full-schema or RLS integration claim.

Regression controls include the pre-migration real completion producing
260 hours / 60 extra / 600 suggested, followed by migration and correction to
100 / NULL / NULL; upward correction; changed-contract snapshot protection;
unknown historical basis; historical delivery followed by actual historical
return; normal completion time; future-date rejection; immutable completed dates;
resolved and archived damage; preserved repair history; pending repairs and billed
damage blockers; and helper/RPC ACL checks.

The archived-damage guard uses an invoker-only narrow exception for the effective
RPC owner, an authenticated organization admin, the exact inspection context, and
only the inspection-link/updated-at difference. Direct updates (including a
forged context setting) remain blocked before and after annulment. The ordinary
restore RPC is also exercised. Snapshot storage keeps the standard restrictive
organization policy and write-context trigger without any application grants.
