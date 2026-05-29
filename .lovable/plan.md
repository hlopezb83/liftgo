# Bloquear facturación de venta sin equipos asignados

## Regla de negocio
Una cotización de tipo **venta** sólo podrá facturarse cuando **todas las líneas de "Venta de equipo"** tengan asignados los equipos del inventario indicados en su cantidad (`assignedCount === quantity` para cada línea).

Las cotizaciones sin líneas de venta de equipo (ej. sólo refacciones o servicio) no se ven afectadas: se podrán facturar como hoy.

## Cambios

### 1. Hook nuevo: `useQuoteSaleAssignmentStatus`
`src/features/quotes/hooks/quoteDetail/useQuoteSaleAssignmentStatus.ts` — recibe `quoteId` y `lineItems`, consume `useQuoteAssignments`, y regresa:

```ts
{
  hasSaleLines: boolean;
  totalRequired: number;     // suma de quantity de líneas "Venta de equipo"
  totalAssigned: number;     // suma de asignaciones reales
  isComplete: boolean;       // hasSaleLines === false || (todas las líneas completas)
  missingByLine: Array<{ index: number; description: string; assigned: number; required: number }>;
}
```

Detección de línea de venta: misma heurística que `AssignForkliftsCard.parseDescription` — sufijo `"- Venta de equipo"` en `item.description`. Centralizar el helper en `src/features/quotes/utils/saleLines.ts` para que `AssignForkliftsCard` también lo importe (evita duplicación).

### 2. `QuoteDetailActions.tsx`
- Añadir prop `canInvoice: boolean` y `invoiceBlockedReason?: string`.
- En el bloque del botón **Facturar** (líneas 52-56), si `!canInvoice`, renderizar el botón **deshabilitado** envuelto en `<Tooltip>` con el mensaje (ej. *"Asigna los equipos del inventario antes de facturar (1/2 asignados)"*).
- Mantener el botón habilitado cuando `canInvoice === true`.

### 3. `QuoteDetail.tsx`
- Invocar el hook nuevo y pasar `canInvoice` + `invoiceBlockedReason` a `QuoteDetailActions`.
- En `AssignForkliftsCard`, añadir un `Alert` sutil (variant warning) arriba cuando `!isComplete`: *"Faltan N equipos por asignar para poder facturar."*

### 4. Defensa servidor-side (ligera)
La validación principal vive en UI porque la creación de factura va por `/invoices/new?from_quote=...` (form prefill, no RPC atómica). Para evitar bypass por URL directa, en `useInvoicePrefill.ts` (que ya lee la cotización origen) añadir guard: si `quote_type = sale` y faltan asignaciones, mostrar `toast.error` y redirigir de vuelta al detalle.

No se modifica DB ni RPC porque no hay una RPC de "factura desde cotización"; el form es manual editable.

### 5. Changelog
Patch **6.14.5**:
- `public/changelog.json` + `public/changelog/v6.14.5.json`
- Título: *"Cotizaciones de venta: facturación bloqueada hasta asignar todos los equipos del inventario"*.

## Verificación
1. Cotización venta aceptada **sin** asignaciones → botón Facturar deshabilitado con tooltip.
2. Asignar parcialmente → tooltip muestra `1/2`.
3. Asignar todo → botón habilitado, flujo normal.
4. Cotización venta de sólo refacciones (sin líneas de equipo) → botón habilitado siempre.
5. Entrar manual a `/invoices/new?from_quote=<incompleta>` → redirige con toast.
