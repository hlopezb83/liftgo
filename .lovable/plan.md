# Primera factura de reserva larga: cobrar días, no "1 día prorrateado"

## Problema

Hoy, al crear una factura manual desde una reserva de largo plazo que inicia a media
mes, la partida se precarga como **cantidad 1** con el importe prorrateado del mes.
Se ve como si se cobrara un solo día carísimo y no cuadra visualmente con la renta
mensual.

## Comportamiento deseado

La partida debe mostrar los **días restantes del mes** como cantidad, al **precio
diario derivado de la renta mensual**:

```text
Reserva 15-sep al 14-sep-2027, renta mensual $30,000
Antes:  1 DAY  x $16,000.00  = $16,000.00
Después: 16 DAY x $1,000.00  = $16,000.00   (30,000 / 30 días x 16 días)
```

El total facturado sigue siendo el mismo prorrateo que ya calcula el motor de
facturación recurrente; sólo cambia cómo se desglosa la partida.

## Alcance

Sólo el prellenado de la factura manual desde reserva. No se toca el motor de
facturación recurrente, ni reglas fiscales, RLS, RPCs ni validaciones de backend.

## Detalles técnicos

1. `src/lib/domain/firstBillingPeriod.ts`: agregar un helper que devuelva
   `{ quantity, unitPrice, total }` para el primer ciclo:
   - `quantity = billedDays`
   - `unitPrice = monthlyRate / daysInMonth` redondeado a 6 decimales (el CFDI 4.0
     admite hasta 6 decimales en Valor Unitario)
   - `total = round2(quantity * unitPrice)`
   - Se conserva `prorateMonthlyAmount` para no alterar otros consumidores; si el
     total derivado difiere en centavos del prorrateo canónico, se ajusta el
     `total` al valor canónico para mantener paridad con el motor recurrente,
     manteniendo la invariante timbrable (`total = qty x precio` dentro de la
     tolerancia de 1 centavo que aceptan las validaciones actuales); si la
     tolerancia no aplica, se prioriza `qty x precio` exacto.
2. `buildLinesForBooking` en
   `src/features/invoices/hooks/invoiceForm/useInvoiceFormHandlers.ts`: usar el
   nuevo helper en la rama `period.truncated && period.isProrated`, con descripción
   tipo `"<Montacargas> — Renta (16 días de septiembre)"` y `clave_unidad: "DAY"`.
3. Pruebas: actualizar/extender
   `src/lib/domain/__tests__/firstBillingPeriod.test.ts` y las pruebas de
   `useInvoiceFormHandlers` para cubrir meses de 28/30/31 días y el caso de inicio
   día 1 (sin prorrateo).
4. Changelog: nueva entrada patch/minor y sincronización de versión.
