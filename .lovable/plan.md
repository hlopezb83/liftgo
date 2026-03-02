

## Corregir calculo de meses calendario en cotizaciones de renta

### Problema
En `calculateRentalCost` (archivo `src/lib/invoiceUtils.ts`), el periodo 01/12/2025 al 30/11/2026 calcula 11 meses + 31 dias de renta diaria, cuando deberian ser 12 meses exactos.

La causa es que `differenceInCalendarMonths(30/11/2026, 01/12/2025)` devuelve 11, y `addMonths(01/12/2025, 11)` = 01/11/2026, dejando 29+1=30 dias de "sobrante". El algoritmo no reconoce que la renta incluye el dia final (inclusive), por lo que 30/11 es el ultimo dia de noviembre y completa un mes entero.

### Solucion
Tratar la fecha final como **inclusiva** sumandole 1 dia para el calculo de meses calendario. Asi, el periodo efectivo para contar meses pasa a ser del 01/12/2025 al 01/12/2026, lo que da exactamente 12 meses.

### Cambio en `src/lib/invoiceUtils.ts`

**1. Importar `addDays`** (linea 2):
```typescript
import { differenceInDays, differenceInCalendarMonths, addMonths, addDays } from "date-fns";
```

**2. Reescribir la logica de calculo (lineas 23-43)**:

```typescript
// Treat end date as inclusive: effective end = endDate + 1 day
const effectiveEnd = addDays(endDate, 1);

// Calendar months using inclusive end
let months = 0;
if (mr > 0) {
  months = differenceInCalendarMonths(effectiveEnd, startDate);
  // Verify addMonths(startDate, months) doesn't exceed effectiveEnd
  if (months > 0 && addMonths(startDate, months) > effectiveEnd) {
    months -= 1;
  }
  if (months > 0) {
    items.push({ description: "Renta mensual", quantity: months, unit_price: mr, total: months * mr });
  }
}

const remainderStart = months > 0 ? addMonths(startDate, months) : startDate;
// Remaining days = difference to effectiveEnd (no +1 needed, already inclusive)
let remaining = differenceInDays(effectiveEnd, remainderStart);
// If months consumed the entire range, remaining = 0
if (remaining < 0) remaining = 0;
```

### Verificacion con ejemplos

| Periodo | Antes | Despues |
|---------|-------|---------|
| 01/12/2025 al 30/11/2026 | 11 meses + 31 dias | 12 meses |
| 01/01/2026 al 31/01/2026 | 0 meses + 31 dias | 1 mes |
| 01/01/2026 al 28/02/2026 | 1 mes + 31 dias | 2 meses |
| 01/01/2026 al 15/01/2026 | 0 meses + 15 dias | 0 meses + 15 dias |
| 15/01/2026 al 14/02/2026 | 0 meses + 31 dias | 1 mes |
| 15/01/2026 al 20/02/2026 | 1 mes + 6 dias | 1 mes + 6 dias |

### Impacto
- Solo se modifica `src/lib/invoiceUtils.ts`.
- Afecta el calculo en cotizaciones, reservas y cualquier lugar que use `calculateRentalCost` / `generateLineItems`.
- No hay cambios en la base de datos ni en edge functions.
