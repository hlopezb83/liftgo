# Plan: Refactor InvoiceForm — separar vista de mutaciones + bloqueo in-page

## Objetivo
Limpiar `useInvoiceFormLogic.ts` para que sea puro (sin router, sin toasts, sin URL params). Mover navegación, notificaciones e ingestión de URL params a `InvoiceForm.tsx`. Reemplazar el redirect duro por un bloqueo in-page cuando faltan asignaciones de venta.

## Cambios

### 1. `useInvoiceFormLogic.ts` (hook puro)
- Quitar imports: `useNavigate`, `useParams`, `useSearchParams`, `notifyError`.
- Aceptar parámetros: `useInvoiceFormLogic({ id, fromQuoteId }: { id?: string; fromQuoteId: string | null })`.
- Eliminar el `useEffect` que dispara `notifyError` + `navigate`.
- Exponer un nuevo objeto `saleAssignmentGuard`:
  ```ts
  saleAssignmentGuard: {
    shouldBlock: boolean;       // !isEdit && sourceQuote.quote_type === "sale" && !isComplete
    totalAssigned: number;
    totalRequired: number;
    missingByLine: Array<{ index; description; assigned; required }>;
  }
  ```
- Devolver también `sourceQuote` para que la página pueda enlazar al detalle del quote.

### 2. `InvoiceForm.tsx` (página)
- Leer `useParams().id` y `useSearchParams().get("from_quote")`.
- Llamar `useInvoiceFormLogic({ id, fromQuoteId })`.
- Renderizar bloqueo in-page cuando `saleAssignmentGuard.shouldBlock`:
  - Un `<Alert variant="destructive">` debajo del `FormPageHeader` con:
    - Título: "Asigna los equipos del inventario antes de facturar (X/Y)".
    - Lista de líneas faltantes (`missingByLine`): "{description}: {assigned}/{required}".
    - Botón "Ir a la cotización" → `navigate(/quotes/{fromQuoteId})`.
  - El resto del formulario sigue renderizándose pero el `FormActions` queda deshabilitado (pasar `isPending` o `disabled` adicional) para impedir submit.
  - Alternativa más simple: retornar early con sólo el header + alerta (sin formulario). **Recomendado: early return**, replica el comportamiento previo pero sin pérdida de contexto (el usuario ve qué falta y decide cuándo volver).

### 3. Sin cambios en
- `useInvoicePrefill`, `useInvoiceFormHandlers`, `useInvoiceFormTotals`, `useInvoiceFormSubmit`.
- `useQuoteSaleAssignmentStatus` (ya provee `missingByLine`).

### 4. Changelog
Agregar `public/changelog/v6.24.4.json` (patch) y entrada en `public/changelog.json`:
- Título: "Refactor InvoiceForm: separación vista/mutaciones y bloqueo in-page".
- Descripción: Hook `useInvoiceFormLogic` queda puro; URL params, navegación y notificaciones suben a la página. El faltante de asignaciones de venta ahora se muestra como bloqueo in-page con detalle por línea en lugar de redirigir.

## Resultado
- Hook 100% puro: sólo estado, prefills, totales, handlers, payload.
- Página: ingestión de URL + navegación + side-effects de UI.
- Mejor UX: el usuario ve exactamente qué líneas faltan asignar sin perder contexto del formulario.