## Auditoría Sprint G (v7.69.0)

**Verde**
- ✅ TypeScript: sin errores.
- ✅ Suite completa: **1008 tests / 144 archivos** — todos verdes (incluye los 5 nuevos de `useTableFilters`).
- ✅ Bookings, Fleet, Invoices ya no pasan `items`/`externalFiltered`/`filters` a `useResourceList`; el hook expone únicamente `{ table }`.
- ✅ `useResourceList.ts` es la única referencia textual restante a `useListFilters` (en un comentario). Ningún componente lo importa.
- ✅ `ReconciliationTable` y `BankStatementImportsHistoryPage` renderizan con `DataTableV2` (sorting + AlertDialog para borrado).

**Deuda detectada**
1. **Dead code**: `src/hooks/useListFilters.ts` sigue en el repo. Solo lo referencia su propio test (`src/hooks/__tests__/useListFilters.test.tsx`). Debe borrarse para cerrar el sprint anterior.
2. **Wrapper trivial**: `useResourceList` hoy sólo hace `useLiftgoTable(...)` y devuelve `{ table }`. No aporta valor — es indirección extra que confunde a los agentes.
3. **Inconsistencia visual en Bookings**: la página se migró al hook canónico pero mantiene `Tabs` + `SearchBar` sueltos en vez de `FiltersToolbar` (rompe la estandarización de Sprint F/G).
4. **Cobertura de tests incompleta**: el plan G3 original incluía `FiltersToolbar` y `useInvoicesFilters`. Sólo se entregó `useTableFilters`.
5. **Sin verificación visual**: Sprint G no capturó screenshots Playwright a 1600×900 de las páginas tocadas.

**Ningún bug funcional detectado** — el sprint es sólido, sólo faltan cierre y homogeneización.

---

## Plan Sprint H — Cierre + estandarización visual

**H1 · Cerrar deuda de Sprint F/G**
- Borrar `src/hooks/useListFilters.ts` y `src/hooks/__tests__/useListFilters.test.tsx`.
- Inline `useResourceList` en sus 3 consumidores (Bookings, Fleet, Invoices) llamando directamente a `useLiftgoTable`, y eliminar `src/hooks/useResourceList.ts`. Menos indirección, un solo hook de tabla.

**H2 · Bookings → `FiltersToolbar` completo**
- Reemplazar `Tabs`+`SearchBar` inline por `FiltersToolbar` con `Search`, `StatusTabs` y `ClearAll` (mismo patrón que Quotes/Contracts/Invoices).
- Preservar `Alert` de límite (`hasReachedListLimit`).

**H3 · Cobertura de tests faltante**
- `FiltersToolbar`: render de `Search`/`StatusSelect`/`StatusTabs`/`DateRange`/`ClearAll`; eventos `onChange`; visibilidad de `ClearAll` cuando `hasActive`.
- `useInvoicesFilters`: verificar `queryFilters` (mapping status/date/search → params server-side), `clearAll` reset total, `filterKey` estable ante identidad de objetos.

**H4 · Verificación visual (Playwright, 1600×900)**
- Capturar screenshots pre/post en `/bookings`, `/fleet`, `/invoices`, `/conciliacion-bancaria/historial`, y la vista de reconciliación fiscal.
- Confirmar: densidad zebra consistente, sticky header, `ClearAll` visible sólo con filtros activos, alignment de columnas numéricas.

**H5 · Changelog v7.70.0** (patch/minor según impacto — se define al final)
- Sección "Cleanup" para H1, "Filtros" para H2, "Tests" para H3, "Visual" para H4.

### Notas técnicas
- Inline de `useResourceList` es mecánico:
  ```ts
  const table = useLiftgoTable<T>({ data: filtered, columns, getRowId, initialSorting, resetKey: filterKey });
  ```
- El test de `FiltersToolbar` se puede montar con `MemoryRouter` sin URL sync (los subcomponentes son controlados por props).
- Para `useInvoicesFilters` reusar el patrón del test de `useTableFilters`: `renderHook` + `MemoryRouter`.

### Fuera de alcance (para sprints posteriores)
- Migración de tablas restantes con `<Table>` crudo (Kanban modals, PDF previews) a `DataTableV2`.
- Auditoría de rendimiento del `Proxy` en `useLiftgoTable` (referenciado en v7.62.2).
