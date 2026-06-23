## Objetivo

Permitir facturar varias reservas confirmadas del mismo cliente en una sola factura, vinculándolas mediante una tabla pivote `invoice_bookings` y agregando sus conceptos automáticamente como líneas de la factura.

## Cambios funcionales

1. **Selector multi-reserva en `/invoices/new`**
   - Reemplazar el `Select` único de "Reserva" por un selector múltiple (popover con checkboxes, basado en el patrón actual de la app).
   - Al elegir la primera reserva: precargar cliente y datos CFDI (igual que hoy).
   - Al elegir reservas adicionales: solo se permiten las del **mismo cliente** que la primera (las demás se deshabilitan o se filtran).
   - Cada reserva agrega sus líneas (`generateLineItems(forklift, start, end)`) a `lineItems`, con un sufijo indicando montacargas/periodo para distinguirlas.
   - Quitar una reserva del selector elimina sus líneas asociadas.
   - El campo `bookingId` único actual se mantiene como "reserva principal" (la primera elegida) por compatibilidad con `invoices.booking_id` y reportes existentes; el resto vive en la pivote.

2. **Filtro de disponibles**
   - `availableBookings` excluye reservas ya facturadas (ya implementado vía `invoicedBookingIds`); ampliar la verificación para considerar tanto `invoices.booking_id` como las filas en `invoice_bookings`.

3. **Detalle de factura (`InvoiceDetail`)**
   - En `InvoiceSourceLinks`, mostrar todas las reservas vinculadas (no solo `booking_id`).

## Cambios técnicos

### Base de datos (migración)

- Crear tabla pivote `public.invoice_bookings`:
  - `invoice_id uuid` (FK → `invoices.id` ON DELETE CASCADE)
  - `booking_id uuid` (FK → `bookings.id` ON DELETE RESTRICT)
  - `line_index int` (orden de las líneas asociadas, opcional)
  - PK compuesta `(invoice_id, booking_id)`
  - `created_at timestamptz default now()`
- GRANTs: `authenticated` (SELECT/INSERT/UPDATE/DELETE), `service_role` ALL.
- RLS: políticas equivalentes a `invoices` (roles admin/administrativo/ventas para escritura; lectura para roles internos; portal cliente solo SELECT de sus propias facturas vía join).
- Backfill: insertar fila por cada `invoices.booking_id IS NOT NULL` existente.
- Mantener `invoices.booking_id` como reserva "principal" para no romper consultas/PDF/reportes actuales.

### Capa de datos

- Nuevo hook `useInvoiceBookings(invoiceId)` para lectura en detalle.
- En `useInvoiceFormSubmit`:
  - Después de `insert`/`update` de la factura, sincronizar `invoice_bookings` (delete + insert del array `bookingIds`).
  - Mantener `invoices.booking_id` = primera reserva del array.
- En `useInvoiceFormLogic`:
  - `invoicedBookingIds` ahora también consulta `invoice_bookings` (nuevo hook `useInvoicedBookingIds`).
- Edición: prefill carga el array desde `invoice_bookings` si existe.

### Formulario

- `invoiceFormSchema`: agregar `bookingIds: z.array(z.string().uuid()).default([])`; `bookingId` se deriva como `bookingIds[0] ?? null`.
- `useInvoiceFormHandlers`: reemplazar `handleBookingSelect` por `handleBookingsChange(ids: string[])` que recalcula líneas concatenando `generateLineItems` por cada reserva en orden.
- `InvoiceForm.tsx`: reemplazar el `Select` por un componente `MultiBookingSelector` (nuevo, usando `Popover` + `Command` con checkboxes, consistente con selectores existentes).

### UI

- `MultiBookingSelector` en `src/features/invoices/components/invoice-form/MultiBookingSelector.tsx`.
- Mostrar chips con las reservas seleccionadas, botón `x` para remover.
- Mensaje de ayuda: "Solo reservas confirmadas del mismo cliente".

## Archivos a tocar

- `supabase/migrations/<timestamp>_invoice_bookings.sql` (nuevo)
- `src/features/invoices/lib/invoiceFormSchema.ts`
- `src/features/invoices/hooks/useInvoiceFormLogic.ts`
- `src/features/invoices/hooks/invoiceForm/useInvoiceFormHandlers.ts`
- `src/features/invoices/hooks/invoiceForm/useInvoiceFormSubmit.ts`
- `src/features/invoices/hooks/invoiceForm/useInvoicePrefill.ts`
- `src/features/invoices/hooks/invoices/useInvoices.ts` (nuevo hook `useInvoiceBookings`)
- `src/features/invoices/pages/InvoiceForm.tsx`
- `src/features/invoices/components/invoice-form/MultiBookingSelector.tsx` (nuevo)
- `src/features/invoices/components/invoice-detail/InvoiceSourceLinks.tsx`
- `public/changelog.json` + `public/changelog/v6.77.0.json` (minor: nueva funcionalidad)

## Fuera de alcance

- No cambia generación de PDF (usa `lineItems` ya consolidados).
- No cambia facturación recurrente (sigue 1 reserva ↔ 1 factura mensual).
- No agrega acción masiva desde la lista de reservas (puede ser fase 2).
