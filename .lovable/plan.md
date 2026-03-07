

## Safer API Response Handling — Remove Unsafe `as` Casts

### Problem
Hooks cast Supabase query results with `as Type[]`, which hides schema mismatches at compile time. If a column is renamed or removed, TypeScript won't flag the error.

### Analysis

There are two categories of casts:

1. **Redundant casts on `select("*")`** — The Supabase client already returns the correct row type for `select("*")` queries. The `as` cast is unnecessary and can simply be removed. Examples: `useForklifts`, `useCustomers`, `useActivityFeed`, `usePayments`, `useDrivers`, `useMechanics`, `useEquipmentModels`, `useMaintenanceLogs`, `useStatusLogs`.

2. **Joined query casts** — Queries like `select("*, forklifts(name, model)")` return a Supabase-inferred type that includes the join. The `as BookingWithForklift[]` cast overrides this. The fix is to remove the cast and let TypeScript infer the return type, then update the view model types to match what Supabase actually returns (or use the inferred type directly).

### Plan

**Files to edit (category 1 — remove redundant casts):**
- `src/hooks/useForklifts.ts` — remove `as Forklift[]` and `as StatusLog[]` from `select("*")` calls
- `src/hooks/useCustomers.ts` — remove `as Customer[]`
- `src/hooks/useActivityFeed.ts` — remove `as ActivityEntry[]` (type matches `Tables<"activity_feed">`)
- `src/hooks/usePayments.ts` — remove `as Payment[]`
- `src/hooks/useDrivers.ts` — remove `as Driver[]`
- `src/hooks/useMechanics.ts` — remove `as Mechanic[]`
- `src/hooks/useEquipmentModels.ts` — remove `as EquipmentModel[]`
- `src/hooks/useMaintenanceLogs.ts` — remove `as MaintenanceLog[]`

For these, the return type from `supabase.from("table").select("*")` already matches `Tables<"table">[]`, so removing the cast preserves full type safety.

**Files to edit (category 2 — joined queries, let inference work):**
- `src/hooks/useBookings.ts` — remove `as BookingWithForklift[]`, let Supabase infer the joined type. Update `BookingWithForklift` in `src/types/rental.ts` to be derived from the actual query return type, or simply export the inferred type.
- `src/hooks/useDamageRecords.ts` — remove cast, let inference work
- `src/hooks/useReturnInspections.ts` — remove cast, let inference work
- `src/hooks/useContracts.ts` — remove `as Contract[]` cast after the `.map()`, adjust the mapping to preserve Supabase's inferred types
- `src/hooks/useAssignForklifts.ts` — remove `as unknown as AssignedForklift[]`

**Type updates in `src/types/rental.ts`:**
- Keep view model types as documentation/re-export aliases, but hooks will no longer force-cast to them. Consumers that need a specific shape can narrow at the component level.

### Technical detail

For joined queries, the Supabase client infers types like:
```typescript
// supabase.from("bookings").select("*, forklifts(name, model)")
// Returns: { ...bookings.Row, forklifts: { name: string; model: string } | null }[]
```

This already matches `BookingWithForklift`. By removing the cast, if `forklifts` table changes (e.g., `name` → `display_name`), the select string `"forklifts(name, model)"` would cause a compile error from the Supabase types — which is the desired behavior.

### Scope
~12 files edited. No database changes. No UI changes. Pure type-safety improvement.

