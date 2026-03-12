

## Cambiar base contable de ingresos: de flujo de efectivo a devengado

### Problema
El reporte filtra facturas por `paid_at` (fecha de cobro) y status `"paid"`. En marzo 2026 hay 7 facturas emitidas pero solo 1 cobrada en ese mes ($19,000). Las demás están en status `"sent"` sin `paid_at`.

### Solución
Cambiar el filtro de ingresos para usar `issued_at` (fecha de emisión) e incluir facturas con status `"paid"`, `"sent"` y `"overdue"` (excluyendo `"draft"` y `"cancelled"`).

### Cambios en `src/components/reports/IncomeStatementReport.tsx`

**Líneas 130-142** — Modificar el filtro de facturas:

```tsx
// ANTES:
invoices
  .filter((inv) => inv.status === "paid" && inv.paid_at)
  .filter((inv) => isWithinInterval(parseISO(inv.paid_at!), { start: startDate, end: endDate }))

// DESPUÉS:
invoices
  .filter((inv) => inv.status !== "draft" && inv.status !== "cancelled")
  .filter((inv) => isWithinInterval(parseISO(inv.issued_at), { start: startDate, end: endDate }))
```

El resto del procesamiento (clasificación rental/sales por `booking_id`, subtotal, etc.) permanece igual.

### Archivos a modificar
- `src/components/reports/IncomeStatementReport.tsx` (2 líneas)
- `src/lib/changelog.ts` (registro de versión)

