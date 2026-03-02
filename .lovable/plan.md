

## Traducir descripciones de partidas de renta al español

### Problema
En `src/lib/invoiceUtils.ts`, las descripciones de las partidas de renta se generan en inglés: "Monthly rental", "Weekly rental", "Daily rental".

### Cambio

**Archivo: `src/lib/invoiceUtils.ts`**

Reemplazar las 4 ocurrencias de descripciones en inglés por sus equivalentes en español:

| Actual (inglés)   | Nuevo (español)    |
|--------------------|--------------------|
| `Monthly rental`   | `Renta mensual`    |
| `Weekly rental`    | `Renta semanal`    |
| `Daily rental`     | `Renta diaria`     |

Las líneas afectadas son:
- Línea 26: `Monthly rental` -> `Renta mensual`
- Línea 33: `Weekly rental` -> `Renta semanal`
- Línea 39: `Daily rental` -> `Renta diaria`
- Línea 44: `Daily rental` -> `Renta diaria` (fallback)

### Alcance
- Solo se modifica un archivo: `src/lib/invoiceUtils.ts`
- No hay cambios en base de datos
- Las facturas existentes conservan su texto original (ya guardado en la BD); solo las nuevas partidas generadas usaran el texto en español

