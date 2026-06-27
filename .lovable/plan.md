## Mejorar UX del error CFDI40148 (CP fiscal ≠ RFC)

Hoy este error solo aparece como toast traducido. La meta: cuando Facturapi rechace con CFDI40148/40149 (o similares de datos de receptor), mostrar un diálogo accionable con link directo a editar al cliente correcto.

### Cambios

1. **`src/features/invoices/lib/facturapiErrors.ts`**
   - Convertir el catálogo `PATTERNS` para que cada entrada devuelva `{ message, kind?: "receptor_data" | "csd" | "credits" | "auth" | "folio" }` además del mensaje.
   - Nueva función `classifyFacturapiError(raw)` que retorna `{ message, kind }`. Mantener `translateFacturapiError` como wrapper para no romper callers.

2. **Nuevo `src/features/invoices/components/StampErrorDialog.tsx`**
   - Dialog (shadcn) que recibe `{ open, onOpenChange, message, kind, customerId? }`.
   - Para `kind === "receptor_data"`: título "Datos fiscales del receptor incorrectos", explica que el CP/RFC/razón social no coincide con la CSF del cliente, lista los 3 campos a revisar, y muestra dos botones:
     - **"Editar cliente"** → navega a `/customers/{customerId}/edit` (si hay `customerId`) — abre en nueva ruta dentro del mismo tab.
     - **"Cerrar"**.
   - Para otros `kind` (CSD vencido, sin folios, API key inválida, folio duplicado): título y CTA específicos (link a Configuración → Datos Fiscales para CSD/API key, link a la factura para folio).
   - Para `kind` desconocido: muestra solo el mensaje + botón Cerrar.

3. **`src/features/invoices/hooks/invoiceDetail/useStampInvoiceFlow.ts`**
   - Añadir estado local `stampError: { message, kind, customerId } | null` y setter.
   - En vez de depender solo del toast, capturar el error del mutate (`stampCfdi.mutate(..., { onError })`), clasificarlo con `classifyFacturapiError`, y exponer el estado más `clearStampError()`.
   - Seguir notificando con toast (corto) pero también abrir el diálogo cuando `kind` sea accionable.

4. **`src/features/invoices/hooks/invoiceDetail/useInvoiceDetailActions.ts`**
   - Re-exportar `stampError` y `clearStampError` desde `useStampInvoiceFlow`.

5. **Página de detalle de factura** (donde se monta `useInvoiceDetailActions`, probablemente `src/features/invoices/pages/InvoiceDetail.tsx`)
   - Montar `<StampErrorDialog open={!!stampError} ... customerId={invoice.customer_id} />`.

6. **Tests**
   - Extender `facturapiErrors.test.ts` para verificar que `classifyFacturapiError` devuelve el `kind` correcto en cada patrón.
   - Test mínimo del `StampErrorDialog` (render + botón "Editar cliente" navega).

7. **Changelog**
   - Nueva entrada `v6.97.10` en `public/changelog.json` + `public/changelog/v6.97.10.json` tipo `minor`: "Diálogo accionable para errores de timbrado CFDI".

### Out of scope
- No tocar la edge function `stamp-cfdi` (ya propaga el código correctamente).
- No cambiar el patrón de traducción para callers existentes (`translateFacturapiError` sigue funcionando).
- No tocar lógica de negocio del timbrado.
