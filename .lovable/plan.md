## Objetivo

Cuando se ejecuta `generate-recurring-invoices`, agrupar todas las reservas recurrentes del **mismo cliente** que correspondan al **mismo período mensual** en una sola factura con múltiples conceptos, en lugar de una factura por reserva.

## Estado actual

Edge function `supabase/functions/generate-recurring-invoices/index.ts`:

- Itera reserva por reserva.
- Crea 1 factura por reserva, con 1 line item, y setea `invoices.booking_id` + `bookings.last_billed_date`.
- Idempotencia por `(booking_id, billing_period_start, billing_period_end)`.

Ya existe la tabla pivote `invoice_bookings` (creada en v6.77.0) que permite vincular N reservas a 1 factura.

## Comportamiento nuevo

Para cada `customer_id`:

1. Calcular el período a facturar de cada reserva (igual que hoy: mes siguiente al `last_billed_date`, o mes del `start_date` si nunca se ha facturado).
2. Solo procesar reservas cuyo `billingStart <= nowMty`.
3. **Agrupar por `(customer_id, billingStart, billingEnd)**`.
4. Por cada grupo:
  - Idempotencia: saltar si ya existe una factura para ese `(customer_id, period)` vinculada vía `invoice_bookings` a cualquiera de las reservas del grupo.
  - Pedir folio `next_invoice_number`.
  - Construir `line_items`: un concepto por reserva (`{forklift} — Renta mensual (period)`).
  - `subtotal = Σ monthlyRate`, `tax = subtotal * 0.16`, `total = subtotal + tax`.
  - Snapshot CFDI: traer datos del cliente (`rfc`, `razon_social`, etc.) una sola vez.
  - Insertar `invoices`. Si solo hay 1 reserva en el grupo, mantener `booking_id` para backcompat. Si hay 2+, dejar `booking_id = NULL` y usar exclusivamente la pivote.
  - Insertar N filas en `invoice_bookings` (una por reserva del grupo).
  - Update masivo `bookings.last_billed_date = endStr` para todas las reservas del grupo.

## Cambios técnicos

### Edge function

`supabase/functions/generate-recurring-invoices/index.ts`

- Reemplazar el loop actual por:
  1. Loop 1 — calcular `{ booking, billingStart, billingEnd, monthlyRate }` para cada reserva válida; descartar las que tengan `monthlyRate=0` o `billingStart > nowMty`.
  2. Agrupar por `customer_id|YYYY-MM` (clave compuesta).
  3. Por grupo: ejecutar la lógica descrita arriba.
- Mantener el contador `invoicesCreated` y agregar `bookingsBilled` al response.
- Logs: por grupo, log con cantidad de reservas agrupadas.

### Idempotencia

Verificación en dos pasos antes de crear factura del grupo:

```sql
SELECT i.id
FROM invoice_bookings ib
JOIN invoices i ON i.id = ib.invoice_id
WHERE ib.booking_id IN (<group_booking_ids>)
  AND i.billing_period_start = <startStr>
  AND i.billing_period_end = <endStr>
LIMIT 1;
```

Si existe → contar como duplicado, actualizar `last_billed_date` por consistencia y continuar.

### Tests

`supabase/functions/generate-recurring-invoices/index_test.ts`

- Agregar caso "agrupa dos reservas mismo cliente, mismo mes → 1 factura con 2 line items + 2 filas en invoice_bookings".
- Agregar caso "dos reservas, diferente cliente → 2 facturas separadas".
- Caso "dos reservas mismo cliente, distintos meses → 2 facturas separadas".

### UI

Sin cambios visuales requeridos: `InvoiceDetail` ya muestra todas las reservas origen vía `InvoiceSourceLinks` y la pivote.

### Changelog

Nueva entrada `v6.80.0` (minor): "Facturación recurrente: agrupar reservas del mismo cliente en una sola factura".

## Fuera de alcance

- No se cambia la generación manual de facturas (ya soporta multi-reserva desde v6.77.0).
- No se cambia el cálculo de `billingStart` por reserva (sigue siendo "mes siguiente al último facturado").
- No se renombra ni se deprecia `invoices.booking_id`; se conserva por compatibilidad y se sigue llenando cuando el grupo es de tamaño 1.
- No se modifica `generate-recurring-maintenance`.

SOLO si las facturas son del mismo dia