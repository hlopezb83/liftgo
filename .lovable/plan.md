

## Corregir formato de fecha en descripcion de facturas recurrentes

### Problema
La edge function `generate-recurring-invoices` genera descripciones de partidas con fechas en formato ISO (`YYYY-MM-DD`), por ejemplo:
> Montacargas X -- Renta mensual (2025-06-01 al 2025-07-01)

El formato correcto para Mexico es `DD/MM/YYYY`:
> Montacargas X -- Renta mensual (01/06/2025 al 01/07/2025)

### Solucion
Agregar una funcion auxiliar `fmtDate` dentro de la edge function que convierta un objeto `Date` al formato `DD/MM/YYYY`, y usarla en la descripcion de las partidas.

### Cambio en `supabase/functions/generate-recurring-invoices/index.ts`

**1. Agregar funcion de formato (antes del ciclo `for`)**
```typescript
const fmtDate = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};
```

**2. Actualizar la descripcion de la partida (linea 79)**

Cambiar:
```typescript
description: `${forklift?.name || "Montacargas"} — Renta mensual (${startStr} al ${endStr})`,
```

Por:
```typescript
description: `${forklift?.name || "Montacargas"} — Renta mensual (${fmtDate(lastBilled)} al ${fmtDate(billingEndDate)})`,
```

Las variables `startStr` y `endStr` (formato `YYYY-MM-DD`) se mantienen sin cambios ya que se siguen usando para los campos de base de datos (`due_date`, `last_billed_date`) que requieren formato ISO.

### Impacto
- Solo cambia el texto visible en la descripcion de las partidas generadas.
- Los campos de fecha en la base de datos (`due_date`, `last_billed_date`) siguen usando formato ISO como es correcto.
- Consistente con el formato `DD/MM/YYYY` usado en el resto de la aplicacion.

