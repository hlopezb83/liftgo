## Auditoría del Sprint v7.79.0

Revisé los 3 cambios del sprint anterior:

- **`FiltersToolbar.StatusTabs`** — el wrapper `overflow-x-auto` + `whitespace-nowrap` funciona en desktop y en tablet estrecho. Detalle menor: los estilos default (`w-full sm:w-auto overflow-x-auto`) se aplican antes que el `className` externo — por precedencia CSS es consistente con las convenciones del proyecto. Sin regresión.
- **`FiltersToolbar.ClearAll`** — `ml-auto` alinea correctamente a la derecha tanto en `flex-row` (desktop) como en `flex-col` (mobile). Verificado.
- **`MrrDetailPage.test.tsx`** — cubre bien las dos ramas (mobile vs desktop). El mock de `useIsTabletOrBelow` es limpio.

**Sin bugs detectados.** Cobertura extra descubierta durante la auditoría:

- El `FeedbackFab` reportado en la auditoría UI/UX 698×572 **no es un FAB flotante** — es un botón inline dentro del header (`variant="outline"`, sin `position: fixed`). El hallazgo "FAB inteligente" del backlog original no aplica; se retira del backlog.

**Brechas de test reales:**

1. `FiltersToolbar.DateRangeControl` — no tiene test. Serializa/deserializa `"YYYY-MM-DD..YYYY-MM-DD"` que consume `useTableFilters.dateRange`; un bug de parseo aquí rompería silenciosamente todos los filtros de fecha (Facturas, Cotizaciones, Gastos, Reportes).
2. `FiltersToolbar.StatusSelect` — variante para >5 opciones, sin test.

## Sprint v7.80.0 — Cobertura de FiltersToolbar y limpieza del backlog

Alcance acotado a tests + una limpieza documental. No toca UI.

### Cambios

1. **Test `FiltersToolbar.DateRangeControl`** — nuevo bloque en `FiltersToolbar.test.tsx` que verifica:
   - Deserialización: `"2026-06-01..2026-06-30"` produce un `DateRange` con `from`/`to` válidos.
   - Serialización: seleccionar un rango emite `onChange("YYYY-MM-DD..YYYY-MM-DD")` usando `toYMD` (respetando `America/Monterrey`).
   - Estado vacío: `value=""` no rompe el render.
   - Fechas inválidas: `"foo..bar"` no lanza; produce `undefined`.

2. **Test `FiltersToolbar.StatusSelect`** — nuevo bloque que verifica render de todas las opciones y propagación del `onChange` al seleccionar.

3. **Retirar hallazgo obsoleto del backlog** — actualizar `.lovable/plan.md` para marcar como resuelto/no-aplica el ítem "FAB inteligente" (el botón Reportar ya está inline en el header).

### Detalles técnicos

- Archivo: `src/components/filters/__tests__/FiltersToolbar.test.tsx` (edits).
- Para `DateRangeControl`: renderizar el componente, abrir el popover con `fireEvent.click` sobre el `DateRangePickerField` trigger, y para la parte de serialización usar el estado inicial (deserialización) que es la ruta crítica; la serialización end-to-end via popover queda cubierta por los E2E de Playwright.
- Nada de mocks pesados; sólo `render` + assertions.
- Changelog: nueva entrada `v7.80.0` (patch) en `public/changelog.json` + `public/changelog/v7.80.0.json`.

### Fuera de alcance

- Cambios visuales o de layout — el resto del backlog UI/UX (PageHeader compact, ListToolbar unificada) sigue pendiente de revisión de sistema de diseño y no entra aquí.
