# Eliminar ternarios anidados en la UI

Recorrí el código y encontré los siguientes casos de ternarios anidados (`a ? x : b ? y : ...`) en componentes/páginas de UI. La regla a aplicar: extraer una **función helper local** (o `const` con `switch`/`if`) que devuelva el valor a renderizar, y usarla en el JSX.

## Archivos a modificar

1. **`src/pages/AuthPage.tsx`** (línea 110)
   - Etiqueta del botón con `loading / mode === "forgot" / "reset" / default`.
   - Helper: `getSubmitLabel(loading, mode)` arriba del `return`.

2. **`src/pages/portal/PortalLogin.tsx`** (línea 77)
   - Mismo patrón (loading + mode).
   - Helper: `getSubmitLabel(loading, mode)`.

3. **`src/pages/InvoiceDetail.tsx`** (línea 37)
   - Mapeo `status → etiqueta` con cadena de ternarios.
   - Helper: reemplazar por objeto `STATUS_LABELS` local o función `getCfdiStatusLabel(status)`.

4. **`src/pages/HelpPage.tsx`** (línea 95)
   - Botón: `isGenerating / manual / default`.
   - Helper: `getManualButtonLabel(isGenerating, manual)`.

5. **`src/components/damage/ReportDamageDialog.tsx`** (línea 95)
   - Etiqueta de botón con pluralización anidada.
   - Helper: `getReportButtonLabel(previewsCount)` (usar pluralización plana).

6. **`src/components/ReadOnlyLineItemsTable.tsx`** (líneas 35-39)
   - Render de descuento `discount>0 ? ($? : %?) : "—"`.
   - Helper: `formatDiscount(item)` que devuelva el string.

7. **`src/components/calendar/GanttHeader.tsx`** (línea 38)
   - className con `today ? ... : isWeekend ? ... : ...`.
   - Helper: `getDayTextClass(today, isWeekend)` que devuelva la clase.

8. **`src/components/reports/IncomeStatementTable.tsx`** (línea 67)
   - Formato de delta con signo anidado.
   - Helper: `formatDelta(row)` y `formatDeltaPct(row)` (línea 70 ya es simple, pero unifico).

9. **`src/components/invoices/InvoicePDFButton.tsx`** (líneas 113-114)
   - Aunque genera PDF (no JSX), el usuario pidió "en la UI"; este archivo es de UI. Extraer `getStatusLabel(status)` y `getStatusColor(status)` con `switch`.

## Fuera de alcance

- Ternarios simples (`a ? x : y`) — no se tocan.
- Ternarios anidados en lógica de hooks/utils que no renderizan UI (ej. `useOperatingExpenses.ts`, `useStatementRows.ts`, payloads en `EquipmentModelsTab`, etc.) — no son render UI, se dejan.
- Spreads condicionales tipo `...(x ? {a} : {})` — no son ternarios anidados de render.

## Notas técnicas

- Cada helper se declara como `function` local en el mismo archivo, antes del componente, para evitar recrearla en cada render.
- Mantener exactamente las mismas cadenas/clases/colores actuales — sin cambios visuales ni de comportamiento.
- Tipar parámetros estrictamente (sin `any`, sin `as`).
- Al final: agregar entrada `5.66.4` (patch) en `public/changelog.json` + archivo `public/changelog/v5.66.4.json` con título "Refactor: helpers en lugar de ternarios anidados en UI".
