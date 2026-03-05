

## Corrección de desfase de fechas en tabla de Facturas

### Problema
En `InvoicesPage.tsx` y `PortalInvoices.tsx`, las fechas se formatean con `format(new Date(inv.issued_at), "dd/MM/yyyy")`. El constructor `new Date("2026-03-03")` interpreta la cadena como medianoche UTC, y en zonas horarias detrás de UTC (como México, UTC-6) se muestra el día anterior (02/03/2026 en vez de 03/03/2026).

El proyecto ya tiene la solución centralizada en `src/lib/utils.ts`: `parseDateLocal` y `formatDateDisplay`, que parsean la fecha como local sin conversión UTC.

### Cambios

**Archivo 1: `src/pages/InvoicesPage.tsx`**
- Reemplazar `format(new Date(inv.issued_at), "dd/MM/yyyy")` por `formatDateDisplay(inv.issued_at)` en la vista de tabla y en la vista móvil.
- Hacer lo mismo para `due_date`.
- Importar `formatDateDisplay` de `@/lib/utils` y eliminar el import de `format` de `date-fns` si ya no se usa.

**Archivo 2: `src/pages/portal/PortalInvoices.tsx`**
- Mismo cambio: reemplazar `format(new Date(...))` por `formatDateDisplay(...)` para `issued_at` y `due_date`.

### Detalle técnico
`parseDateLocal("2026-03-03")` divide la cadena en partes y crea `new Date(2026, 2, 3)` (hora local), evitando el desfase UTC. `formatDateDisplay` ya aplica este parseo y devuelve `"03/03/2026"`.

