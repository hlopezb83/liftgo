## Goal

Consolidate to **a single TanStack-only data table** (`DataTableV2`), remove the legacy `DataTable` wrapper and its custom `useEffect`/state-sync helpers, and standardize virtualization on `@tanstack/react-virtual`. No custom array sorting, no `useEffect` syncing sort/selection state.

## Current state (audit)

Two parallel systems live in `src/components/`:

| System | Files | TanStack usage | Custom logic to remove |
|---|---|---|---|
| Legacy `DataTable` | `DataTable.tsx` + `dataTable/{useDataTableState,dataTableEffects,dataTableHelpers,sorting,types,DataTableHeader,DataTableBody}.ts(x)` | Uses `useReactTable` already | `useNotifySelection` (useEffect syncing selection out), `usePruneRowSelection` (useEffect pruning selection on data change), `cycleSorting` (manual sort toggle), custom `DataTableColumn` DSL that re-wraps `ColumnDef` |
| V2 `DataTableV2` | `dataTable/v2/*` | `useReactTable` + `@tanstack/react-virtual` (`VirtualBody.tsx`) | None of consequence — already TanStack-native |

**Consumers**: 17 files still import the legacy `DataTable` (reports, operations tabs, portal pages, supplier/MRR/forklift detail, invoice payment summary). 1 file (`PortalContracts`) already uses V2 directly.

## Target architecture

```text
src/components/dataTable/v2/
  useLiftgoTable.ts     ← single source of truth: state, sorting, filtering, pagination, selection
  DataTableV2.tsx       ← presentational, accepts a TanStack Table<T>
  DataTableHeaderV2.tsx ← native flexRender, header.column.getToggleSortingHandler()
  DataTableBodyV2.tsx   ← native flexRender
  VirtualBody.tsx       ← @tanstack/react-virtual when row count > threshold
  DataTablePaginationV2 ← table.previousPage/nextPage
  sorting.ts            ← single SortingFn<T> (es-MX locale, accents-insensitive) — registered as the default sortingFn via useLiftgoTable; columns can override
  types.ts              ← re-exports TanStack types + LiftgoColumnMeta (align, hideOnMobile, cellClassName)
```

Everything legacy under `src/components/dataTable/` (the seven files outside `v2/`) and `src/components/DataTable.tsx` is **deleted**.

## Step-by-step changes

**1. Migrate the 17 legacy consumers to the V2 API.**
Each file currently builds `DataTableColumn<T>[]` (key/label/render/sortable/accessor). Rewrite each as `ColumnDef<T>[]` plus a `useLiftgoTable({ data, columns, getRowId })` call, then render `<DataTableV2 table={table} ... />`. Mechanical 1-to-1 mapping:

```text
{ key, label, sortable, accessor, render, align, hideOnMobile, className }
→ { id: key, header: label, enableSorting: sortable, accessorFn/accessorKey, cell: ({row}) => render(row.original, row.index), meta: { align, hideOnMobile, cellClassName: className } }
```

Files touched (17): all under `src/features/{reports,operations,portal,suppliers,dashboard,fleet,invoices}/...` listed in the audit. No behavior changes — same columns, same sort defaults, same mobile cards.

**2. Delete legacy implementation.** Remove:
- `src/components/DataTable.tsx`
- `src/components/dataTable/DataTableHeader.tsx`
- `src/components/dataTable/DataTableBody.tsx`
- `src/components/dataTable/useDataTableState.ts`
- `src/components/dataTable/dataTableEffects.ts` ← kills `useNotifySelection` + `usePruneRowSelection` (the offending `useEffect`s)
- `src/components/dataTable/dataTableHelpers.ts` ← kills `cycleSorting`
- `src/components/dataTable/sorting.ts` (duplicate of v2)
- `src/components/dataTable/types.ts`

**3. Harden `useLiftgoTable` so V2 needs no `useEffect`s.**
- Selection pruning on data change: rely on TanStack's built-in behavior — when `getRowId` is stable, removed rows are auto-pruned by `getRowModel`. Add a small `selectedRows` computation derived from `table.getSelectedRowModel()` rather than re-syncing into local state.
- `onSelectionChange` consumer callback already fires inside `onRowSelectionChange` (no `useEffect`) — keep as is; remove the `dataRef`/manual lookup in favor of `table.getSelectedRowModel().rows.map(r => r.original)` computed lazily inside the callback.
- Register `liftgoSortingFn` as a default via `defaultColumn.sortingFn` instead of mapping over every column.

**4. Virtualization stays TanStack-only.**
`VirtualBody` already uses `@tanstack/react-virtual`. Verify the threshold prop (`virtualizationThreshold`, default 100) is honored and the path is opt-in via `<DataTableV2 virtualized />`. No custom windowing logic anywhere else.

**5. Supabase plug-in.**
No changes — `useLiftgoTable` receives `data: T[] | undefined` from any `useQuery` hook backed by Supabase. Row id stays `getRowId: (row) => row.id`. Documented in the V2 `index.ts` JSDoc.

**6. Lint + complexity gates.**
Run `bun run lint` and `bun run build`. Expected: 0 errors / 0 warnings (complexity caps already tuned in v2 components).

**7. Changelog.**
Add `6.5.0-alpha.6` (minor — public API of legacy `DataTable` removed) to `public/changelog.json` + `public/changelog/v6.5.0-alpha.6.json` describing the consolidation.

## Verification checklist

- `rg "from \"@/components/DataTable\"|components/dataTable/(useDataTableState|dataTableEffects|dataTableHelpers)"` → 0 hits.
- `rg "useEffect" src/components/dataTable` → 0 hits.
- Manual smoke per consumer family: reports (sorting), operations tabs (row click + mobile cards), portal pages (pagination), supplier detail (selection + toolbar if any), invoice payment summary (footer).
- `bun run lint` green, `tsc` green.

## Out of scope

- No changes to server-side queries, RLS, or Supabase schema.
- No new features (column visibility menus, faceted filters, drag reorder) — same UX, cleaner core.
- No styling changes to header/body/pagination.

## Risks

- The 17-file mechanical migration is the largest surface; a missed `accessor`/`align` translation could change a column's sort order or alignment. Mitigation: do consumers in batches of 4–5, eyeball each table in preview before moving on.
- Some legacy consumers may rely on `defaultSortKey` + `defaultSortDirection`; map directly to `initialSorting: [{ id, desc }]`.
