## Estado actual

- **v2 listo y validado** en `/portal/contracts` (`DataTableV2`, `useLiftgoTable`, `VirtualBody`, `sorting.ts`).
- Consumidores reales (corrijo el conteo del plan original tras explorar):
  - **Familia A — `useListPage` + `ListPageLayout`** (17 páginas de listado): Bookings, Contracts, Customers, Quotes, Invoices, Fleet, Maintenance, Inventory, Suppliers, Deliveries, Returns, Damage, Expenses, Audit, Changelog, Users, ReturnInspection. Estas **no** usan el `DataTable` v1: usan `ListPageLayout` con `SortableTableHead` + `renderRow` y derivan sort/paginación de `useListPage` (que envuelve `useSort` + `usePagination`).
  - **Familia B — `DataTable` v1 directo** (17 componentes pequeños): `MrrDetailPage`, `ForkliftHourometerHistory`, `InvoicePaymentSummary`, ops tabs (Drivers, EquipmentModels, MaintenancePolicies, Mechanics), Portal (Invoices, InvoiceDetail, Rentals), 6 reportes, `SupplierDetailPage`.

## Fase 2 — Migrar Familia A (17 list pages)

Construir un puente que permita reutilizar `ListPageLayout` con TanStack sin reescribir cada página dos veces.

1. **`ListPageLayout` acepta un `table: Table<T>` opcional.**
   - Cuando se pase `table`, ignora `tableHeader`, `renderRow`, `items`, `page`, `totalPages`, `onPageChange` y delega en `DataTableV2` + `DataTablePaginationV2`.
   - `mobileCardRender`, `isLoading`, `emptyMessage`, `customContent`, `filters`, `actions`, `title`, `subtitle` se mantienen.
   - Props legacy quedan opcionales para no romper consumidores aún no migrados durante la transición.

2. **Por cada página de Familia A:**
   - Definir `columns: ColumnDef<T>[]` con `accessorKey`/`accessorFn` y `cell` (sin `useEffect`, sin `useSort`).
   - Llamar `useLiftgoTable({ data: filtered, columns, getRowId: r => r.id, initialSorting })`.
   - Quitar `useListPage`, `SortableTableHead`, `renderRow`, `tableHeader`, `paginatedItems`, `page`, `setPage`, `totalPages`.
   - Conservar `useListFilters` (búsqueda + status tabs) tal cual; pasar `filtered` a `useLiftgoTable`.
   - `mobileCardRender` migra al prop homónimo del `ListPageLayout` (ya soportado).

3. **Páginas con detalles particulares:**
   - `AuditTrailPage` → `virtualized: true` (potencialmente cientos de filas).
   - `ChangelogPage` → tabla simple, sin selección.
   - `UserManagementPage` → conservar acciones por fila vía `cell` render.
   - `BookingsPage`, `MaintenancePage`, `QuotesPage` → revisar selección múltiple si la tenían (no aplica hoy).

## Fase 3 — Migrar Familia B (17 consumidores directos)

Conversión 1-a-1: `DataTableColumn<T>[]` → `ColumnDef<T>[]`, montar `useLiftgoTable` local, reemplazar `<DataTable>` por `<DataTableV2 table={table} />`.

- **`MrrDetailPage`** y reportes con datasets grandes → `virtualized: true`, `paginated: false` (los reportes muestran todo sin paginar).
- **Reportes estáticos** (`AgingReport`, etc.) → `enableRowSelection: false`, sin paginación (usar `paginated: false`).
- **Portal (Invoices, InvoiceDetail, Rentals)** → sin selección, sort por fecha desc.
- **Ops tabs y SupplierDetailPage** → conservar `onRowClick` / drill-down.

## Fase 4 — Limpieza y endurecimiento

1. **Eliminar archivos legacy:**
   - `src/components/DataTable.tsx`
   - `src/components/dataTable/{DataTableHeader,DataTableBody,useDataTableState,dataTableEffects,dataTableHelpers,types,sorting}.ts(x)` (los que no sean reutilizados por v2)
   - `src/components/SortableTableHead.tsx`
   - `src/hooks/useSort.ts`, `src/hooks/useListPage.ts`
   - `src/hooks/usePagination.ts` **solo si** ya no quedan consumidores fuera del DataTable (verificar antes de borrar).

2. **Promover v2 a ruta canónica:** mover `src/components/dataTable/v2/*` → `src/components/dataTable/*` y reexportar `DataTable`, `useDataTable`, `DataTablePagination` desde `src/components/DataTable.tsx` para conservar la API pública.

3. **Endurecer `useLiftgoTable`:**
   - Eliminar el `as (r: T) => boolean` actual usando un type guard, cumpliendo Power of 10 (sin `as`).
   - Reemplazar el `useEffect` de `DataTableV2` que notifica selección por `onRowSelectionChange` que dispare el callback inline (mantenemos cero `useEffect` para sort/selección).

4. **Tests (`vitest`):**
   - Actualizar mocks/tests de páginas migradas (cualquier `getByRole("button", { name: /ordenar/i })` o assertions sobre `SortableTableHead` se reemplaza por interactuar con los headers de TanStack).
   - Test unitario nuevo para `useLiftgoTable` (sort, paginación, selección, virtualización opt-in).

5. **Changelog:** entrada `7.0.0` (major: API pública de tablas cambia, `useListPage`/`useSort` desaparecen) con guía breve de migración para consumidores externos (no aplica, todo es interno).

## Detalles técnicos clave

- Cero `useEffect` para ordenar arreglos. El sort vive en `table.getState().sorting` con `getSortedRowModel()`.
- `liftgoSortingFn` ya maneja nulos y strings localizados.
- Datos de Supabase fluyen sin cambios: cada hook (`useContracts`, `useBookings`, etc.) sigue devolviendo `T[]`; solo cambia cómo lo consume la vista.
- `MobileCardList` se preserva vía `mobileCardRender` del v2 (`useIsMobile()` interno).
- Power of 10: componentes ≤150 LOC, hooks ≤80 LOC, sin `any`/`!`/`as`, sin warnings, paginación obligatoria salvo cuando `paginated: false` (reportes).
- Sin nuevas dependencias (`@tanstack/react-virtual` ya instalado en Fase 1).

## Fuera de alcance

- No reescribir `useListFilters` (filtros + tabs siguen igual).
- No introducir filtros por columna ni faceted filters.
- No tocar `MobileCardList` ni `PageHeader`.
- No migrar `MrrDetailPage` a server-side pagination (sigue cliente, solo añade virtualización).

## Orden de ejecución sugerido

1. Endurecer v2 (quitar `as` y `useEffect` de selección), entrada `6.5.0-alpha.4`.
2. Adaptar `ListPageLayout` para aceptar `table`, entrada `6.5.0-alpha.5`.
3. Migrar Familia A en 3 tandas de ~6 páginas (commits/alpha por tanda).
4. Migrar Familia B en 2 tandas.
5. Cleanup + tests + cambio mayor `7.0.0`.

## Pregunta

¿Procedo con esta secuencia (1 → 5) o prefieres pausar después de la Fase 2 (Familia A migrada) para validar UX antes de tocar reportes y portal?
