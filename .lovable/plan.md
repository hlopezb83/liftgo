## Refactor completo de DataTable a TanStack Table + Virtual

### Contexto real (importante)

El código actual **ya** usa `@tanstack/react-table` en `DataTable.tsx` (`useReactTable`, `getCoreRowModel`, `getSortedRowModel`). No existe `VirtualDataTable`, `VirtualRow` ni `useDataTableSort`. La duplicación real es:

- `src/components/DataTable.tsx` + `dataTable/*` → tabla con TanStack (sort interno cuando `column.sortable=true`).
- `src/hooks/useSort.ts` → sort manual con `useMemo` (no `useEffect`), consumido por `useListPage` en **18 páginas de listado** que ordenan ANTES de paginar y luego pasan el slice ya ordenado a `DataTable` con columnas no-sortables.
- `usePagination` + `TablePagination` → paginación cliente (25 items, ver Memoria `arch/pagination`).
- No hay virtualización en ninguna parte; `@tanstack/react-virtual` no está instalado.

No existen módulos "Embarques" en LiftGo. Sustituyo por los listados reales: Cotizaciones, Reservas, Facturas, Mantenimiento, Auditoría, etc.

### Objetivo

Tener **una sola fuente de verdad** (`DataTable` v2) que use ColumnDef nativo de TanStack para estado (sort + selección + paginación) y `@tanstack/react-virtual` para virtualizar filas en listados largos. Eliminar `useSort`, `useListPage` y el sort manual de páginas; el control queda en la tabla.

### Cambios por fase

**Fase 1 — Nuevo DataTable v2 (sin romper el actual)**

Crear archivos nuevos en paralelo al existente:

- `src/components/dataTable/v2/types.ts` — re-exporta `ColumnDef`, `SortingState`, `RowSelectionState`, `PaginationState` de TanStack. Tipo `LiftgoColumnMeta` para `align`, `hideOnMobile`, `mobileLabel`, `headClassName`.
- `src/components/dataTable/v2/useLiftgoTable.ts` (≤80 LOC) — wrapper de `useReactTable` con: `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`, `getPaginationRowModel`. Sin `useEffect`. Acepta `data`, `columns`, `getRowId`, `initialSorting`, `initialPageSize` (default `APP_CONFIG.PAGE_SIZE`), `enableRowSelection`, `globalFilter`.
- `src/components/dataTable/v2/DataTable.tsx` (≤150 LOC) — recibe `table: Table<T>` (instancia ya construida por `useLiftgoTable`) + `columns`. Renderiza `<Table>` con `flexRender`, soporta `virtualized?: boolean`, `onRowClick`, `selectionToolbar`, `emptyMessage`, `mobileCardRender`. Sin estado propio.
- `src/components/dataTable/v2/VirtualBody.tsx` — usa `useVirtualizer` de `@tanstack/react-virtual`. Mide filas, aplica `transform: translateY` y paddings. Activo solo cuando `virtualized` y `rows.length > 100`.
- `src/components/dataTable/v2/DataTablePagination.tsx` — reutiliza `TablePagination`, lee `table.getState().pagination` y llama `table.setPageIndex`.

API nueva (ejemplo de consumo):

```text
const columns = useMemo<ColumnDef<Quote>[]>(() => [
  { id: "folio", accessorKey: "folio", header: "Folio", enableSorting: true },
  { id: "customer", accessorFn: r => r.customer?.name, header: "Cliente",
    enableSorting: true, meta: { hideOnMobile: true } },
  { id: "total", accessorKey: "total", header: "Total",
    cell: ({ getValue }) => formatCurrency(getValue<number>()),
    meta: { align: "right" } },
], []);
const table = useLiftgoTable({ data: quotes, columns, getRowId: r => r.id,
  initialSorting: [{ id: "folio", desc: true }] });
return <DataTable table={table} columns={columns} mobileCardRender={...} virtualized />;
```

**Fase 2 — Migrar consumidores de useListPage (18 archivos)**

Lista: `BookingsPage`, `QuotesPage`, `InvoicesPage`, `ContractsPage`, `CustomersPage`, `SuppliersPage`, `Fleet`, `MaintenancePage`, `DeliveriesPage`, `ReturnInspectionPage`, `DamageTrackingPage`, `InventoryPage`, `OperatingExpensesPage`, `ChangelogPage`, `AuditTrailPage`, `UserManagementPage`, `MrrDetailPage`, `PortalRentals`.

Patrón de migración por archivo:
1. Convertir las columnas existentes (formato `DataTableColumn`) a `ColumnDef<T>[]` con `useMemo`.
2. Remover destructuring de `useListPage` (`sortKey`, `sortedItems`, `paginatedItems`, `toggleSort`).
3. Llamar `useLiftgoTable({ data: filtered, columns, ... })`.
4. Pasar `globalFilter` desde `useListFilters` (la búsqueda) al estado de la tabla (`table.setGlobalFilter`) en vez de filtrar manualmente cuando aplica.
5. Render: `<DataTable table={table} columns={columns} mobileCardRender={...} />` + `<DataTablePagination table={table} />`.

Mantener `useListFilters` (filtros por status/segmento/rango fechas) — no se toca; solo se cambia el sort+paginación.

**Fase 3 — Migrar consumidores directos de DataTable v1 (18 archivos)**

Mismo patrón pero estos archivos ya pasan datos completos sin paginación externa. Lista en `rg "from \"@/components/DataTable\""`. Casos especiales:
- `MrrDetailPage`, `AuditTrailPage` → activar `virtualized` (datasets grandes).
- Portal (`PortalRentals`, `PortalInvoices`, `PortalContracts`, `PortalInvoiceDetail`) → sin selección, sort básico.
- Reports (`AgingReport`, `RevenueReport`, etc.) → tablas estáticas, sin paginación.

**Fase 4 — Limpieza**

- Borrar: `src/hooks/useSort.ts`, `src/hooks/useListPage.ts`, `src/hooks/usePagination.ts`, `src/components/dataTable/sorting.ts` (mover `liftgoSortingFn` y `alignClass` a `v2/`), `src/components/dataTable/useDataTableState.ts`, `src/components/dataTable/dataTableEffects.ts` (los dos `useEffect` de selección desaparecen — TanStack lo maneja con `onRowSelectionChange` + `getRowId` estable).
- Mover `src/components/dataTable/v2/*` a `src/components/dataTable/*` y `DataTable.tsx` reemplaza al viejo.
- Re-exports en `src/components/DataTable.tsx` para no romper imports (`export { DataTable, useLiftgoTable, type ColumnDef }`).
- Actualizar tests (`bookingFlow.test.ts`, `invoiceFlow.test.ts`, etc.) — solo cambian si tocan la tabla; el flujo de datos Supabase es el mismo.
- Knip + lint: garantizar cero warnings.

### Detalles técnicos

- **Sin `useEffect` para ordenar**: el sort vive en `table.getState().sorting` y se aplica vía `getSortedRowModel`. Los dos `useEffect` actuales (`useNotifySelection`, `usePruneRowSelection`) se reemplazan: la notificación de selección se hace con un callback en `onRowSelectionChange` y la poda automática la provee TanStack cuando `getRowId` es estable (id de DB).
- **Supabase**: el patrón actual es fetch completo con TanStack Query + filtrado/paginación cliente (25 items, ver `arch/pagination`). Se respeta. La virtualización es solo de render, no cambia el fetch.
- **MobileCardList**: el `DataTable` v2 sigue cambiando a `MobileCardList` cuando `useIsMobile()` y `mobileCardRender` están presentes (memoria `arch/responsive-ui`).
- **Power of 10**: cada archivo nuevo ≤150 LOC, hooks ≤80, sin `any`/`!`/`as`. Las columnas viven en `useMemo` para que la identidad de `ColumnDef[]` sea estable.
- **Dependencia nueva**: `bun add @tanstack/react-virtual`.

### Riesgos

- Refactor toca ~40 archivos. Se hace en PRs incrementales por fase para que cada fase compile y pase tests.
- `useListFilters` + `globalFilter` de TanStack pueden chocar si una página filtra por múltiples campos custom; en esos casos se mantiene el filtrado en `useListFilters` y se pasa `filtered` como `data` (igual que hoy).
- Las columnas no-sortables de páginas que ordenaban externamente pasarán a ser sortables nativas; visualmente aparecen iconos de sort donde antes no había → revisar headers de cada listado en QA.

### Changelog

Entrada `7.0.0` (major, por cambio de API pública del DataTable) en `public/changelog.json` + `public/changelog/v7.0.0.json` al final de cada fase merged.

### Entregables por fase

```text
Fase 1 → componentes v2 + bun add @tanstack/react-virtual
Fase 2 → 18 list pages migrados, useListPage borrado
Fase 3 → 18 consumidores directos migrados
Fase 4 → archivos viejos borrados, v2 promovida a path canónico, changelog 7.0.0
```
