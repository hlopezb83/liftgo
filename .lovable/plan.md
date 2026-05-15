# Fase 1: Migración de DataTable a @tanstack/react-table

## Objetivo

Reemplazar el motor interno de ordenamiento de `DataTable` (`useSort`) por `@tanstack/react-table` **sin cambiar la API pública**. Los 19 consumidores actuales no requieren cambios.

## Alcance

- ✅ Refactor de `src/components/DataTable.tsx` para usar `useReactTable`
- ✅ Mantener exactamente: `columns`, `data`, `isLoading`, `keyExtractor`, `emptyMessage`, `onRowClick`, `rowClassName`, `mobileCardRender`, `defaultSortKey`, `defaultSortDirection`, `footer`, `className`
- ✅ Mantener `DataTableColumn<T>` con `key`, `label`, `sortable`, `accessor`, `render`, `align`, `className`, `headClassName`, `hideOnMobile`
- ✅ Mantener integración con `MobileCardList`, `TableSkeleton`, `EmptyRow`, `SortableTableHead`
- ❌ NO se tocan los 19 consumidores
- ❌ NO se elimina `useSort` (sigue usándose en `useListPage`, `BookingsPage`, `DeliveriesPage`, etc. que NO pasan por `DataTable`)
- ❌ NO se agregan features nuevas (selección, resize, visibility, virtualization) — eso es Fase 3

## Pasos

1. **Instalar dependencia**
   - `bun add @tanstack/react-table`

2. **Refactor `src/components/DataTable.tsx`**
   - Construir `ColumnDef<T>[]` a partir de `DataTableColumn<T>[]`:
     - `id: col.key`
     - `accessorFn: col.accessor ?? (row) => (row as Record<string, unknown>)[col.key]`
     - `header: col.label` (renderizado por `SortableTableHead` cuando `sortable`)
     - `cell: ({ row, index }) => col.render(row.original, index)`
     - `enableSorting: !!col.sortable`
   - Configurar `useReactTable`:
     - `data: data ?? []`
     - `columns: columnDefs`
     - `getCoreRowModel`, `getSortedRowModel`
     - `state.sorting` controlado, `onSortingChange`
     - `initialState.sorting` desde `defaultSortKey`/`defaultSortDirection`
   - Render: iterar `table.getHeaderGroups()` y `table.getRowModel().rows`
   - Conservar lógica `isMobile + mobileCardRender → MobileCardList` exactamente igual
   - Conservar `memo` en row interno y `DataTable`

3. **Mapping de sorting al header**
   - `SortableTableHead` sigue recibiendo `sortKey/currentSort/currentDirection/onSort`
   - Adaptar: leer `state.sorting[0]` y exponer `toggleSort(key)` que llame a `table.setSorting`

4. **Comparador de orden**
   - `useSort` actual usa `localeCompare` con `sensitivity: "base", numeric: true` para strings y resta para números
   - Implementar `sortingFn` custom equivalente y aplicarlo por defecto a todas las columnas para preservar comportamiento (acentos, números embebidos en strings, nulls al final)

5. **Validación**
   - Correr `vitest` (`InvoicesPage.test.tsx`, `bookingFlow.test.ts`, etc.)
   - Smoke test visual de 3 páginas representativas: `InvoicesPage`, `QuotesPage`, `CustomersPage`

6. **Changelog**
   - Crear `public/changelog/v5.83.0.json` (minor: dependencia nueva + refactor interno, sin cambios visibles)
   - Agregar entrada al inicio de `public/changelog.json`

7. **Memoria**
   - Actualizar `mem://arch/ui/tables` indicando que `DataTable` ya usa TanStack internamente y que Fase 2/3 (selección, resize, virtualization) queda lista para activarse on-demand

## Detalles técnicos

### Equivalencia de sorting (clave para no romper UX)

```ts
const liftgoSortingFn: SortingFn<unknown> = (rowA, rowB, columnId) => {
  const a = rowA.getValue(columnId);
  const b = rowB.getValue(columnId);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
};
```

### Estado de sorting controlado

```ts
const [sorting, setSorting] = useState<SortingState>(
  defaultSortKey ? [{ id: defaultSortKey, desc: defaultSortDirection === "desc" }] : []
);
```

### Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cambio sutil en orden de nulls/acentos | `sortingFn` custom espejo de `useSort` |
| Re-render extra al pasar `columns` inline | Mantener `columnsKey` memo basado en `col.key` |
| Romper `mobileCardRender` | No se toca esa rama, se ejecuta antes de `useReactTable` con los items ya ordenados vía `table.getRowModel()` o usando `useSort` solo para el branch mobile (decisión: usar `table` también en mobile leyendo `getSortedRowModel`) |
| Bundle size | `@tanstack/react-table` headless ≈ 14 KB gzip, aceptable |

## Estimación

- Implementación: ~30 min
- Tests + smoke: ~15 min
- Changelog + memoria: ~5 min
- **Total: ~1 sesión corta**

## Fuera de alcance (Fase 2/3)

- Selección de filas con checkbox
- Column visibility / resize
- Filtros por columna (`getFilteredRowModel`)
- Virtualización (`@tanstack/react-virtual`)
- Migrar `BookingsPage` / `DeliveriesPage` (usan `ListPageLayout` + `useListPage`, no `DataTable`)
