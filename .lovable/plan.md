
## Corregir periodos de facturación recurrente a meses calendario naturales

### Problema
La edge function `generate-recurring-invoices` calcula el periodo de facturación sumando 30 días a la última fecha facturada, lo que produce periodos artificiales como:
- "30/01/2026 al 01/03/2026" (para febrero)

Lo natural y comprensible sería:
- "01/02/2026 al 28/02/2026"

### Causa raíz
```typescript
// Lógica actual: suma fija de 30 días
const billingEndDate = new Date(lastBilled);
billingEndDate.setDate(billingEndDate.getDate() + 30);
```

### Solución
Cambiar la lógica para usar **meses calendario completos**:

1. El **inicio del periodo** es el 1er día del mes siguiente a `lastBilled`.
2. El **fin del periodo** es el último día de ese mismo mes (28, 29, 30 o 31 según corresponda).
3. La condición de "¿ya pasó suficiente tiempo?" también se ajusta para verificar que el mes siguiente ya haya comenzado (en lugar de contar 30 días fijos).
4. El `last_billed_date` se actualiza al último día del mes facturado (fin del periodo), para que el siguiente ciclo calcule correctamente el mes siguiente.
5. El `due_date` de la factura se establece al último día del mes facturado.

### Cambio en `supabase/functions/generate-recurring-invoices/index.ts`

**Lógica nueva (reemplaza líneas 67-83 aproximadamente):**

```typescript
for (const booking of bookings || []) {
  const lastBilled = booking.last_billed_date
    ? new Date(booking.last_billed_date)
    : new Date(booking.start_date);
  const now = new Date();

  // Calcular el mes a facturar: el mes siguiente a lastBilled
  const billingStart = new Date(lastBilled.getFullYear(), lastBilled.getMonth() + 1, 1);
  // Último día de ese mes
  const billingEnd = new Date(billingStart.getFullYear(), billingStart.getMonth() + 1, 0);

  // Solo generar si ya estamos en o después del mes a facturar
  if (now < billingStart) continue;

  // ... (validación de monthlyRate sin cambios)

  const endStr = billingEnd.toISOString().split("T")[0];

  const lineItems = [{
    description: `... — Renta mensual (${fmtDate(billingStart)} al ${fmtDate(billingEnd)})`,
    ...
  }];

  // due_date y last_billed_date usan endStr (último día del mes)
}
```

### Ejemplo del resultado

Para una reserva que inició el 01/01/2026:
- Primera factura: "01/01/2026 al 31/01/2026" (enero)
- Segunda factura: "01/02/2026 al 28/02/2026" (febrero)
- Tercera factura: "01/03/2026 al 31/03/2026" (marzo)

### Impacto
- Solo cambia la edge function `generate-recurring-invoices`.
- Periodos ahora reflejan meses calendario reales.
- Se respetan meses con 28, 29, 30 o 31 días automáticamente.
- Los campos de base de datos siguen usando formato ISO.
