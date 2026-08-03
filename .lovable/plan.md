# R13 — Cierre de hallazgos (camino al GO)

Verifiqué el código actual: los dos hallazgos P1 del documento son reales y reproducibles tal cual están descritos.

## P1 — Bloqueantes del GO

### 1. Cotizaciones legacy pierden su precio acordado
Hoy `computeRentalLineTotal` siempre recalcula tarifa × periodo, y `buildRentalItems` descarta cualquier partida sin modelo. Resultado: al abrir una cotización antigua el total se ve mal (COT-0001, COT-0005) y al guardarla la partida desaparece del payload.

Cambio: llevar el importe histórico en la línea (`legacyTotal`, `legacyDescription`) desde el prefill; mientras la línea no tenga modelo seleccionado, tanto lo que se muestra como lo que se guarda usan ese importe. Al re-seleccionar modelo, vuelve el cálculo normal.
Archivos: `quoteFormSchema.ts`, `useQuotePrefill.ts`, `rentalLineHelpers.ts`, `quoteFormBuilders.ts`.

### 2. Cierre de OT duplica el costo
`maintenance_logs.cost` ya es el total (manual + refacciones + mano de obra), pero el resumen suma `cost` otra vez como "costo manual": una OT de $1,360 se muestra en $2,720.

Cambio: el componente recibe `storedCost` y `manualCost` por separado; el renglón "otros costos" se calcula como residual (`cost - refacciones - mano de obra`) cuando no hay costo manual declarado.
Archivos: `WorkOrderCloseSummary.tsx`, `CloseWorkOrderDialog.tsx`.

## P2 funcional
1. Kanban de mantenimiento: usar el mismo diccionario de etiquetas para tipos y estados (hoy mezcla "preventivo" crudo con etiquetas bonitas).
2. OT creada desde un reporte de daño: guardar el usuario actual en "Realizado por".
3. Vigencia de cotización: sincronizar el campo visible con la coacción `max(hoy+30, fin)` y corregir el off-by-one del default.
4. Cotización de venta: mostrar la ayuda "sin precio de lista — captura manual" cuando el modelo no trae precio.
5. Despachador: ocultar la ruta y el botón de nueva reserva (hoy llena el formulario y la base lo rechaza al guardar).
6. Alias faltante: `/conciliacion` → `/conciliacion-bancaria` (los otros alias ya existen).
7. Historial de factura: omitir filas sin cambios reales ("— → —").

## P2 visual
1. Subir el contraste del anillo de foco dorado a ≥3:1 (`--ring` más oscuro y/o 2px con offset), medido.
2. Columna "Negociación" del CRM: pasar del morado saturado a la escala de marca (terracota).
3. Portal: la factura vencida debe usar el mismo badge rojo del backoffice, no gris.
4. Customer 360: el H1 debe ser el nombre del cliente, no repetir el subtítulo.
5. Chip "Recurrente": unificar con la familia de pills.
6. Listas móviles con FAB: padding inferior extra para que no tape la última fila.
7. Login: mensajes de validación nativos en español.

## Verificación
- Pruebas actualizadas de prefill, builders y `CloseWorkOrderDialog` (casos legacy $10,371, refacciones+MO $1,360, mixto $800).
- Revisión visual con Playwright en escritorio y móvil, sin errores de consola.
- Lint, typecheck y suite completa en verde; nueva entrada de changelog al final.

## Orden de entrega
Primero los dos P1 con sus pruebas (versión menor), luego la tanda P2 funcional y la visual en una segunda versión.
