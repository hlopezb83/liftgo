## Problema

En `/invoices` los filtros (tabs de estado, rango de fechas, búsqueda) no responden a clics. La causa es un bucle infinito de renders: `"Maximum update depth exceeded ... table.resetPageIndex"` (visible en consola), que bloquea los event handlers.

## Causa raíz

`useListFilters` declara `options.searchFields`, `options.searchAccessors` y `options.statusField` como dependencias de su `useMemo` de `filtered`. Los callers pasan literales en cada render, por lo que el array de búsqueda cambia de referencia siempre → `filtered` se recalcula cada render → la cadena `baseFiltered → statusFiltered → filtered` en `useInvoicesFilters` propaga una nueva referencia → `useLiftgoTable` recibe un `data` nuevo → TanStack Table dispara `autoResetPageIndex` → `setPagination` → re-render → loop.

## Cambios

### 1. `src/hooks/useListFilters.ts` (fix principal)
Quitar de las deps de `useMemo` la configuración estática (`searchFields`, `searchAccessors`, `statusField`). Estos son literales por callsite, no cambian en runtime. Dejar deps solo de datos reactivos: `[items, search, statusFilter]`. Suprimir `react-hooks/exhaustive-deps` localmente con un comentario explicando por qué.

Esto rompe la cadena de referencias inestables y resuelve el loop en **todas** las páginas que usan `useListFilters` (no solo facturas).

### 2. `src/components/dataTable/v2/useLiftgoTable.ts` (defensa en profundidad)
Añadir `autoResetPageIndex: false` al config de `useReactTable`. La paginación seguirá controlada por nuestro estado y resetearemos manualmente cuando el caller lo necesite (no es requerido hoy: las páginas vuelven al inicio al cambiar filtros porque `data.length` típicamente cubre la primera página). Esto evita que cualquier futura inestabilidad de `data` vuelva a colapsar la UI.

### 3. Verificación
- `bun run lint` y `bun run test` (296 tests) deben pasar.
- Recargar `/invoices` y confirmar que: (a) la consola no muestra "Maximum update depth", (b) los tabs Borrador/Sin Pagar/Pagado/Vencido cambian la tabla, (c) el date range picker abre, (d) la búsqueda filtra.
- Revisar rápidamente otras páginas que usan `useListFilters` (Cotizaciones, Reservas, Clientes, etc.) — no debería haber regresión porque solo estabilizamos referencias.

### 4. Changelog
Nueva entrada **patch** `v6.12.5` describiendo el fix del bucle infinito en filtros de Facturas (y por extensión, mejora de estabilidad en `useListFilters` + `useLiftgoTable`).

## Fuera de alcance
- No tocar el UI de los filtros (sigue igual).
- No cambiar la lógica de filtrado de overdue ni el rango de fechas.
- No introducir paginación server-side.
