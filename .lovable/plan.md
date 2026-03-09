

# Plan: Eliminar diálogo de factura post-inspección

## Cambio
Remover la lógica que muestra el diálogo `PostInspectionInvoiceDialog` después de completar una devolución en `ReturnInspectionPage.tsx`.

## Detalle técnico

### `src/pages/ReturnInspectionPage.tsx`
- Eliminar el estado `invoicePrompt` y su tipo `InvoicePromptData`
- Eliminar el bloque `onSuccess` que establece `setInvoicePrompt(...)` tras crear la inspección
- Eliminar el render de `<PostInspectionInvoiceDialog />`
- Eliminar imports de `PostInspectionInvoiceDialog` y `useCreateInvoice` (si aplica)

El flujo quedará: completar devolución → toast de éxito → cerrar dialog. Sin preguntas adicionales.

