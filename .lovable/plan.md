## Auditoría del Sprint v7.78.0

Revisé los tres cambios del sprint pasado:

- **MrrDetailPage.tsx** — el fallback a `MobileCardList` bajo `md` está correcto, respeta `useIsTabletOrBelow`, mantiene el link a `/fleet/:id` y el subtotal MRR. Sin bugs.
- **DeliveriesPage.tsx** — `totalCount={deliveries?.length}` pasa a `ListPageLayout` que renderiza `"N resultado(s)"` con pluralización correcta.
- **ReturnInspectionPage.tsx** — mismo patrón sobre `filteredInspections?.length` (respeta filtros aplicados, ideal).

**Sin regresiones detectadas.** Cobertura de pruebas: `useMrrDetail` ya tiene test unitario del hook; el fallback visual del MRR quedó sin test — es una brecha menor.

## Sprint v7.79.0 — Cierres del viewport tablet estrecho (≤ md)

Alcance acotado a hallazgos verificables con evidencia visual/código, sin tocar layout global.

### Cambios

1. **Test faltante del sprint anterior** — agregar test de render para `MrrDetailPage` que verifique que en `useIsTabletOrBelow=true` se renderiza `MobileCardList` (no `DataTableV2`) y muestra el "Total MRR" en el pie. Cubre la brecha detectada en la auditoría.

2. **FiltersToolbar.StatusTabs con overflow horizontal seguro** — en viewports entre `sm` y `md`, cuando hay ≥4 tabs (Facturas, Cotizaciones, Reservas) el `TabsList` compite por espacio con la Search y provoca wrap. Envolver el `TabsList` en un contenedor con `overflow-x-auto` + `scrollbar-none` y `whitespace-nowrap` para que las pestañas hagan scroll horizontal en lugar de saltar de línea. No afecta desktop.

3. **FiltersToolbar.ClearAll siempre alineado a la derecha** — actualmente cae donde el `flex-wrap` lo deje. Añadir `ml-auto` para que en resoluciones intermedias siempre quede al extremo derecho del row, evitando la percepción de "botón huérfano" reportada en la auditoría.

### Detalles técnicos

- Archivos: `src/features/dashboard/pages/__tests__/MrrDetailPage.test.tsx` (nuevo), `src/components/filters/FiltersToolbar.tsx` (edits).
- Test: mock `useMrrDetail` con 2 items y `useIsTabletOrBelow` → `true`; assertar presencia de `Total MRR` y ausencia del rol `table`.
- StatusTabs: `<div className="w-full sm:w-auto overflow-x-auto"><TabsList className="whitespace-nowrap">…</TabsList></div>`.
- ClearAll: agregar `ml-auto` al `Button`.
- Changelog: nueva entrada v7.79.0 (patch) en `public/changelog.json` + `public/changelog/v7.79.0.json`.

### Fuera de alcance

Cambios estructurales del prior audit (unificación `ListToolbar`, `PageHeader` compact, FAB inteligente) siguen pendientes de decisión — requieren rediseño global y evidencia adicional, no entran en este sprint.
