## Objetivo

Forzar el paso por **timbrado del CFDI** para mover una factura de **Borrador → Sin Pagar**. Eliminar la transición manual "Marcar Enviada" que hoy salta este paso.

## Comportamiento actual

- En `InvoiceDetail` hay un botón **"Marcar Enviada"** que llama `setStatus("sent")` sin timbrar.
- "Timbrar CFDI" en el menú solo está habilitado si la factura **NO** está en borrador (`canStamp: !isDraft`), así que para timbrar el usuario debe primero usar el botón manual.

## Comportamiento nuevo

- Eliminar el botón "Marcar Enviada".
- Permitir **Timbrar CFDI** desde estado borrador (botón principal cuando `status === "draft"` y `cfdi_status` ∈ {pending, error}).
- Al timbrar exitosamente, la factura pasa automáticamente a `status: "sent"` (Sin Pagar) si estaba en borrador.
- Si el timbrado falla, la factura sigue en borrador (queda con `cfdi_status: "error"` y permite reintentar).

## Cambios técnicos

### Edge function `supabase/functions/stamp-cfdi/handler.ts`
- En el `update` final tras timbrar exitosamente, además de los campos CFDI, incluir:
  - `status: inv.status === "draft" ? "sent" : inv.status`
- Mantener el mismo update en el branch de re-timbrado (líneas ~151) si aplica.

### Frontend

`src/features/invoices/components/invoice-detail/InvoiceDetailActions.tsx`
- En `computeFlags`:
  - `canStamp: (cfdiStatus === "pending" || cfdiStatus === "error") && status !== "cancelled"` — quitar la restricción `!isDraft`.
- Eliminar el botón "Marcar Enviada" del render.
- Cuando `isDraft && canStamp`, mostrar **"Timbrar CFDI"** como botón primario (fuera del menú "Acciones") con icono `Stamp`, para que sea la acción evidente desde borrador.
- Quitar la prop `onSent` (y removerla en el llamador `InvoiceDetail.tsx`).

`src/features/invoices/hooks/invoiceDetail/useInvoiceDetailActions.ts`
- Eliminar uso de `setStatus("sent")` desde `onSent`. Conservar `setStatus` para `paid` y otros usos internos.

`src/features/invoices/pages/InvoiceDetail.tsx`
- Quitar `onSent={() => actions.setStatus("sent")}` del render de `InvoiceDetailActions`.

### Mensajes
- Al timbrar desde borrador, toast: "CFDI timbrado — factura marcada como Sin Pagar". (Ya existe notificación de timbrado en `useStampCfdi`; agregar segunda notificación o cambiar copy condicionalmente en el `onSuccess` del flujo.)

### Changelog
- Nueva entrada `v6.78.0` (minor): "Timbrado obligatorio para pasar de Borrador a Sin Pagar".

## Fuera de alcance

- No se cambia la transición Sin Pagar → Pagada (sigue por registro de pago).
- No se cambia el flujo de cancelación CFDI.
- No se modifica facturación recurrente (las facturas auto-generadas ya nacen con su flujo propio; si nacen en borrador deberán timbrarse igual).
