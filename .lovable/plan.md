

## Traducir textos en ingles restantes en el modulo de facturacion

### Hallazgos

Se revisaron todos los archivos del modulo de facturacion (paginas, componentes, PDF, edge function). Solo quedan 2 archivos con texto en ingles:

### Cambios

**1. `supabase/functions/generate-recurring-invoices/index.ts` (linea 79)**

Actual:
```
description: `${forklift?.name || "Forklift"} — Monthly rental (${startStr} to ${endStr})`
```

Nuevo:
```
description: `${forklift?.name || "Montacargas"} — Renta mensual (${startStr} al ${endStr})`
```

Cambios: "Forklift" -> "Montacargas", "Monthly rental" -> "Renta mensual", "to" -> "al"

**2. `src/components/InvoicePDFButton.tsx` (linea 53)**

Actual:
```
doc.text(company?.razon_social || "ForkliftERP", textStartX, y);
```

Nuevo:
```
doc.text(company?.razon_social || "LiftGo", textStartX, y);
```

El fallback "ForkliftERP" se reemplaza por "LiftGo" (nombre del proyecto segun la URL publicada).

### Alcance
- 2 archivos modificados
- No hay cambios en base de datos
- La edge function se redesplegara automaticamente
- Las facturas recurrentes generadas a futuro tendran la descripcion en espanol

