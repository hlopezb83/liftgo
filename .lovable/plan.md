# Wizard recurrente: nada preseleccionado

## Objetivo
Al abrir la vista previa de facturas recurrentes, **ninguna** línea viene marcada. El operador marca explícitamente lo que quiere facturar (incluida la opción "seleccionar todos" por grupo, que se conserva).

## Cambios

### 1. `src/features/invoices/lib/recurringSelection.ts`
- En `resolveId()`: una fila nueva y seleccionable pasa de `"selected"` a `"known-only"` → ya no se marca por defecto.
- Consecuencia intencional: al activar la confirmación de tarifa modificada (`allowStaleRate`), las líneas con `rateWarning` tampoco se marcan solas; el operador las marca a mano. Consistente con "nada preseleccionado".
- Se conservan intactas las protecciones existentes:
  - Lo desmarcado por el usuario nunca se re-marca solo (R8-12).
  - Cambio material (periodo/monto/IVA) desmarca y exige re-aprobación manual (R8-05).
  - La intención sobrevive a ausencias temporales de la fila (R9-01).
  - Selección por reserva + periodo (R9-18).
- Actualizar el comentario de encabezado del módulo con el nuevo invariante.

### 2. `src/features/invoices/components/recurring/RecurringInvoicesPreviewDialog.tsx`
- Texto del diálogo: "Desmarca las que quieras excluir" → "Marca las que quieras incluir".
- El botón "Generar" ya se deshabilita con 0 seleccionadas — sin cambios.

### 3. Tests — `src/features/invoices/lib/__tests__/recurringSelection.test.ts`
- Actualizar el caso "marca por defecto las reservas seleccionables" → ahora el estado inicial es **vacío** (fail-closed).
- Ajustar los casos afectados (confirmación de tarifa ya no auto-agrega) y mantener el resto de invariantes.

### 4. Versión y changelog
- **v7.415.0** (minor: cambio visible de comportamiento de UX).
- Nuevo archivo de changelog por versión + actualización del MD.

## Fuera de alcance
Sin cambios en backend, elegibilidad, prorrateo, ni en la Edge Function de generación.
