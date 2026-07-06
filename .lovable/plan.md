## Objetivo

Que al facturar desde reserva(s), la partida **"Servicio de Logística"** (y otras partidas no-renta capturadas en la cotización origen) se anexe automáticamente a la factura una sola vez, aunque la cotización se haya convertido en varias reservas. Solo aplica al flujo manual (no recurrentes).

## Diagnóstico

- `quote.line_items` guarda `{ description: "Servicio de Logística", quantity: 1, unit_price, total }` cuando el usuario marca la casilla en la cotización.
- `useQuoteBookingCreator` solo crea `bookings` con `forklift_id` + tarifas + `quote_id`. La partida de logística no viaja a la reserva.
- `useInvoiceFormHandlers.buildLinesForBooking` genera solo líneas de renta desde el forklift.

Como la reserva sí guarda `quote_id`, no hace falta cambiar el schema: leemos la cotización origen al facturar.

## Cambios

### 1. Nuevo helper `extractNonRentalLines(quoteLineItems)`
Ubicación: `src/features/quotes/utils/nonRentalLines.ts` (nuevo).
- Filtra `line_items` cuya descripción contenga "Logística" o "Entrega" (case-insensitive), o cualquier partida que **no** corresponda a renta (marcadas por descriptores "Renta mensual/semanal/diaria" o " — Venta de equipo").
- Normaliza al shape `LineItemValues` con claves SAT por defecto para servicios de flete: `clave_prod_serv: "78101800"` (Transporte de carga), `clave_unidad: "E48"` (Servicio), `objeto_imp: "02"`.

### 2. `src/features/invoices/hooks/useInvoiceFormLogic.ts`
- Agregar `useQuotes` (o inline `useQuery`) que lea `quotes` filtradas por los `quote_id` únicos de las reservas cargadas (`in("id", uniqueQuoteIds)`). Solo se ejecuta si hay bookings con quote_id.
- Pasar `quotes` como prop nueva al hook de handlers.

### 3. `src/features/invoices/hooks/invoiceForm/useInvoiceFormHandlers.ts`
- Ampliar `Booking` type con `quote_id?: string | null`.
- Nueva prop `quotes: Array<{ id: string; line_items: Json }> | undefined`.
- Al construir `allLines` en `handleBookingsChange`:
  1. Generar líneas de renta por booking (comportamiento actual).
  2. Recolectar `quote_id` únicos de las reservas seleccionadas.
  3. Para cada `quote_id`, extraer líneas no-renta con el helper y anexarlas al final. **Deduplicado por quote_id** para no repetir logística si la cotización tiene 2 reservas.
- Documentar en JSDoc que las partidas de logística vienen de la cotización origen.

### 4. Tests
- Nuevo `nonRentalLines.test.ts`: casos con "Servicio de Logística", "Entrega en sitio", líneas de renta puras, y venta de equipo (todas menos las de renta deben preservarse).
- Ampliar `useInvoiceFormHandlers` (o crear si no existe test) para verificar que al seleccionar 2 reservas con el mismo `quote_id`, la logística aparece 1 sola vez.

### 5. Memoria
Guardar `mem://logic/quote-logistics-propagation` describiendo la regla: "Al facturar desde reserva, las partidas no-renta de la cotización origen se copian una vez por quote_id."

### 6. Changelog
Entrada patch `v6.107.4`:
- Título: "Servicio de logística arrastrado a la factura"
- Detalle: la partida de logística/entrega capturada en la cotización ahora se anexa automáticamente a la factura al generarla desde reserva(s), sin duplicarse cuando la cotización se dividió en varias reservas.

## Fuera de alcance

- Facturas recurrentes (siguen siendo solo renta mensual).
- Editar la logística directamente en la reserva (se sigue tomando de la cotización).
- Migración de reservas ya facturadas sin logística: el usuario puede editar la factura si la abre en borrador.
