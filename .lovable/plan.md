

## Corregir primera factura recurrente que se salta el mes inicial

### Problema
Cuando una reserva con facturacion recurrente no tiene `last_billed_date` (nunca se ha facturado), el sistema usa `start_date` como referencia y luego calcula el periodo como "el mes siguiente". Esto causa que se salte el primer mes.

Ejemplo: reserva inicia 01/12/2025, el sistema calcula:
- `lastBilled` = 01/12/2025 (start_date)
- `billingStart` = 01/01/2026 (mes siguiente)
- Resultado: se salta diciembre completamente

### Causa raiz
Linea 68-72 del edge function:
```typescript
const lastBilled = booking.last_billed_date ? new Date(booking.last_billed_date) : new Date(booking.start_date);
// ...
const billingStart = new Date(lastBilled.getFullYear(), lastBilled.getMonth() + 1, 1);
```

La logica de "mes siguiente a lastBilled" es correcta cuando YA existe un periodo facturado previo, pero no cuando es la primera factura.

### Solucion
Diferenciar entre dos casos:

1. **Primera factura** (`last_billed_date` es null): el periodo inicia el 1er dia del mes de `start_date` y termina el ultimo dia de ese mes.
2. **Facturas subsecuentes** (`last_billed_date` existe): el periodo inicia el 1er dia del mes siguiente a `last_billed_date` (logica actual, correcta).

### Cambio en `supabase/functions/generate-recurring-invoices/index.ts`

Reemplazar lineas 67-77 con:

```typescript
for (const booking of bookings || []) {
  const now = new Date();
  let billingStart: Date;
  let billingEnd: Date;

  if (booking.last_billed_date) {
    // Facturas subsecuentes: mes siguiente al ultimo facturado
    const lastBilled = new Date(booking.last_billed_date);
    billingStart = new Date(lastBilled.getFullYear(), lastBilled.getMonth() + 1, 1);
  } else {
    // Primera factura: el mes del inicio de la reserva
    const startDate = new Date(booking.start_date);
    billingStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  }

  // Ultimo dia del mes de facturacion
  billingEnd = new Date(billingStart.getFullYear(), billingStart.getMonth() + 1, 0);

  // Solo generar si ya estamos en o despues del mes a facturar
  if (now < billingStart) continue;
```

### Ejemplo del resultado

Reserva: 01/12/2025 al 30/11/2026, sin facturas previas:
- Primera factura (sin last_billed_date): **01/12/2025 al 31/12/2025** (diciembre)
- Segunda factura (last_billed_date = 2025-12-31): 01/01/2026 al 31/01/2026 (enero)
- Tercera factura: 01/02/2026 al 28/02/2026 (febrero)

### Impacto
- Solo se modifica la edge function `generate-recurring-invoices`.
- No hay cambios en la base de datos ni en el frontend.
- La logica para facturas subsecuentes no cambia.

