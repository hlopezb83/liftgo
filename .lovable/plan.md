# Plan: TanStack puro end-to-end (opcional)

El refactor base ya está hecho. Este plan endurece lo restante.

## Contexto actual (verificado)

- `DataTableV2` + `useLiftgoTable` + `VirtualBody` ya usan `@tanstack/react-table` y `@tanstack/react-virtual` nativos.
- Sorting via `getSortedRowModel` + `liftgoSortingFn` como `defaultColumn.sortingFn`.
- Filtrado via `getFilteredRowModel` (globalFilter).
- Paginación via `getPaginationRowModel`.
- Selección via `onRowSelectionChange` con `getRowId` estable (poda automática de TanStack).
- Cero `useEffect` para sincronizar arreglos en `src/components/dataTable/v2/`.
- 17 consumidores migrados; legacy `DataTable.tsx` y 7 auxiliares eliminados.
- Lint: 0 errores / 0 warnings.

## Pasos propuestos (opcionales, elige cuáles ejecutar)

### Paso 1 — Eliminar `legacyAdapter.ts`
Reescribir los 17 consumidores con `ColumnDef<T>[]` nativo de TanStack (usando `accessorFn`, `cell`, `header`, `meta`). Más verboso pero 100% idiomático y borra el último puente al DSL viejo.

### Paso 2 — Auditar `src/hooks/useSort.ts` y `usePagination.ts`
Estos hooks viven fuera de DataTable pero implementan sort/paginación manual. Identificar usos restantes y migrarlos a `useReactTable` headless cuando aplique, o documentarlos como utilidades no-tabla.

### Paso 3 — Modo server-side para listas grandes (Supabase)
Para tablas con >1000 filas potenciales (bookings, invoices, audit logs), activar:
- `manualSorting: true` + traducir `SortingState` a `.order()` de Supabase.
- `manualPagination: true` + `range(from, to)` + `count: 'exact'`.
- `manualFiltering: true` + `.ilike()` sobre columnas relevantes.
- Hook nuevo `useServerLiftgoTable<T>({ queryKey, fetcher })` que envuelve `useQuery` + `useReactTable` y expone la misma API que `useLiftgoTable`.

### Paso 4 — Changelog
Agregar `v6.5.0-alpha.7` (patch o minor según pasos elegidos).

## Fuera de alcance

- Cambios visuales (zebra, drill-down panels, sticky headers — ya cumplen Core memory).
- RLS / schema / edge functions.
- Tests nuevos más allá de regresión de listados ya cubiertos.

## Decisión requerida

¿Cuáles pasos ejecuto? Mi recomendación: **Paso 1 + Paso 3 sólo para `bookings` e `invoices`** (mayor volumen real). Paso 2 sólo si el lint/knip marca código muerto.
