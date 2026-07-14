## Bug

En `/cuentas-por-pagar` (y en cualquier otra tabla migrada a `useTableFilters`), cuando el usuario cambia un filtro **desde el UI** (Select/Tabs), la URL sí se actualiza a `?status=pending`, pero la tabla sigue mostrando 25 filas con estatus mezclados (Pendiente + Pagada + Vencida). Si el usuario recarga con la misma URL, el filtro funciona y muestra sólo 9 filas Pendientes.

Verificado con Playwright:
- Carga directa `?status=pending` → 9 filas correctas.
- Click en Select "Pendiente" partiendo de "Todos" → URL cambia a `?status=pending`, tabla muestra 25 filas mezcladas.
- Alternar Pendiente → Pagada → Pendiente sigue roto.

## Causa raíz

En `src/hooks/filters/useTableFilters.ts` el `useMemo` que produce `filtered` depende de `deferredValues` (objeto derivado de `useDeferredValue(values)`). Con React Compiler + React 19, esa dependencia de objeto no invalida el memo cuando `location.search` cambia por `navigate({ replace: true })`. Es el mismo patrón que ya arreglamos en v7.61.10 para `useInvoices`: **los deps de memoización tienen que ser primitivos**.

Además:
- `facets` se pasa como object literal fresh cada render desde el consumidor, lo que "engaña" al invalidador pero no basta porque el compiler infiere que la salida no depende semánticamente de la identidad del objeto.
- `useDeferredValue(values)` introduce una segunda referencia que agrava el problema.

## Cambios

**Sólo se toca `src/hooks/filters/useTableFilters.ts`** (contrato público idéntico — no hay migraciones en consumidores).

1. **Deps primitivos en `filtered`**: el `useMemo` pasa de `[mode, items, facets, deferredValues]` a `[mode, items, itemsVersion, filterKey]`, donde `filterKey` ya es string estable. Dentro del memo se leen `values` y `facets` vía ref (`useLatestRef`) para no capturar closures obsoletos.
2. **Quitar `useDeferredValue(values)`**: se mantiene sólo `useDeferredValue(filterKey)` para exponer `isStale`. El filtrado se hace contra `values` actuales — es barato (matchSorter ya es rápido y sólo corre sobre bills en memoria).
3. **`itemsVersion`**: se deriva de `items?.length` + primer/último id (si existe `id`) para que cambios de dataset invaliden el memo sin depender de identidad de array.
4. **`hasActive` y `filterKey` mantienen deps actuales** (ya son primitivos vía `values`).

Con esto:
- Cambiar un Select recomputa `filtered` de inmediato.
- No hay regresiones en `AuditTrailPage`, `SuppliersPage`, `ChangelogPage`, `AccountsPayable` porque el contrato (`values`, `filtered`, `set`, `reset`, `hasActive`, `filterKey`) se preserva.

## Verificación

Playwright end-to-end en `/cuentas-por-pagar`:
1. Carga sin filtro → 25 filas (paginación).
2. Click Select "Pendiente" → 9 filas, todas Pendiente. URL = `?status=pending`.
3. Cambiar a "Pagada" → sólo Pagadas.
4. Cambiar de vuelta a "Pendiente" → 9 filas Pendiente.
5. Limpiar filtros → 25 filas.

También revisar `/proveedores`, `/auditoria` y `/changelog` para asegurar que siguen filtrando por texto.

## Changelog

Nueva entrada `v7.62.2` (patch): "Fix: los filtros de tabla no se re-aplicaban al cambiar el Select por click (regresión de v7.62.0 en `useTableFilters`)."
