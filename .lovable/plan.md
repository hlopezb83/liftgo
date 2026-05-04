## Objetivo
Reducir re-renders innecesarios en las tablas migradas a `DataTable` / `ListPageLayout` y eliminar el warning ruidoso de refs en `PaginationNext` que aparece en consola en `/quotes`.

## Hallazgos de auditoría

1. **Warning de refs en consola** (`PaginationNext` / `PaginationLink`): `PaginationLink`, `PaginationPrevious`, `PaginationNext` y `Pagination` son componentes funcionales sin `forwardRef`, pero radix/shadcn los pasa por composición que intenta adjuntar refs. Genera ruido en cada render de `TablePagination`.
2. **`DataTable`**:
   - El `accessors` map se reconstruye en cada render del padre porque `columns` suele ser un literal inline → invalida `useSort` (su `useMemo` depende de `options.accessors`).
   - `columns` inline también provoca que `TableRow`/`TableCell` se re-rendericen completos aun cuando `data` no cambió.
   - No usa `React.memo` para filas; en tablas grandes cada cambio de sort re-renderiza N filas.
3. **`useSort`**: depende de `options.accessors` (referencia nueva cada render) → el `useMemo` de `sortedItems` se invalida en cada render del consumidor.
4. **`MobileCardList`**: no memoiza, re-renderiza todas las cards aunque `items` sea estable.
5. **`TablePagination`**: `getVisiblePages()` se recalcula en cada render (barato pero innecesario), y los handlers inline cambian de identidad cada render.
6. **`ListPageLayout`**: no es `memo`; cualquier render del page padre re-renderiza header/filters/table aunque `items` sea idéntico.

## Cambios propuestos

### 1. Corregir warning de refs (prioritario)
Convertir `Pagination`, `PaginationLink`, `PaginationPrevious`, `PaginationNext` a `React.forwardRef` en `src/components/ui/pagination.tsx`. Esto elimina el warning en consola y permite composición correcta.

### 2. Estabilizar `useSort`
- En `src/hooks/useSort.ts`: comparar `accessors` por contenido o aceptar que el caller provea un objeto memoizado. Mejor: extraer `accessors` con un `useRef` que siempre apunte al último mapa, y eliminar la dependencia de `useMemo` (usando los accessors actuales sin invalidar).

### 3. Estabilizar `DataTable`
En `src/components/DataTable.tsx`:
- Memoizar internamente `accessors` con `useMemo` deps `[columns]` ya existe; el problema es `columns` inline. Solución pragmática: construir `accessors` con dep en una clave estable derivada (`columns.map(c => c.key).join('|')`) para que arrays inline equivalentes no invaliden.
- Envolver el componente en `React.memo` con comparator superficial sobre `data`, `isLoading` y `columns.length`.
- Extraer la fila a un subcomponente `DataTableRow` memoizado para evitar re-render masivo al cambiar sort.

### 4. Memoizar utilidades
- `MobileCardList`: envolver en `React.memo`.
- `TablePagination`: envolver en `React.memo`; memoizar `getVisiblePages` con `useMemo([page, totalPages])`.
- `ListPageLayout`: envolver en `React.memo` (genérico vía `memo` cast).
- `SortableTableHead`: envolver en `React.memo`.

### 5. Reportes con datasets pesados
Verificar que los `useMemo` de `data` en `UtilizationReport`, `RevenueReport`, `MaintenanceCostReport`, `UtilizationByModelReport`, `ProfitabilityByModelReport`, `AgingReport` estén correctos (ya lo están). Asegurar que las `columns` arrays se definan fuera del render o memoizadas para que el nuevo `DataTable.memo` funcione realmente. Plan: extraer arrays `columns` a `useMemo([...])` dentro de cada reporte.

### 6. Validación
- `tsc --noEmit` (automático).
- Recargar `/quotes`, `/inventory`, `/reports` y verificar que el warning de refs desapareció en consola.
- Profilar con `browser--performance_profile` antes/después en `/reports` (vista Utilización por modelo) para confirmar reducción de scripting time al cambiar sort.

### 7. Changelog
Agregar entrada `v5.46.1` (patch) en `public/changelog.json` y `public/changelog/v5.46.1.json` describiendo la optimización de rendimiento y el fix del warning.

## Archivos afectados (estimado)
- `src/components/ui/pagination.tsx` (forwardRef fix)
- `src/hooks/useSort.ts` (estabilizar deps)
- `src/components/DataTable.tsx` (memo + row split)
- `src/components/MobileCardList.tsx` (memo)
- `src/components/TablePagination.tsx` (memo)
- `src/components/ListPageLayout.tsx` (memo)
- `src/components/SortableTableHead.tsx` (memo)
- 6 archivos en `src/components/reports/*` (memoizar `columns`)
- `public/changelog.json` + `public/changelog/v5.46.1.json`

## Fuera de alcance
- Virtualización de filas (no necesaria con paginación de 25).
- Reescritura de `useSort` para soportar sort multicolumna.
