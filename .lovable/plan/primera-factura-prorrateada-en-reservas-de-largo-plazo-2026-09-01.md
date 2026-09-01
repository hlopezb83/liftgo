# Primera factura prorrateada en reservas de largo plazo

## Estado actual (verificado en el código)

Hay dos caminos distintos para facturar una reserva y hoy se comportan diferente:

1. **Asistente de facturas recurrentes** (`generate-recurring-invoices`): ya hace exactamente lo que pides. Si la reserva arranca el 12 de septiembre, el primer periodo es 12/09 – 30/09 con monto prorrateado (`computeProrate`), y a partir de octubre factura meses completos (01/10 – 31/10). No requiere cambios.

2. **Factura manual creada desde la reserva** (`buildLinesForBooking` → `generateLineItems`): calcula el costo de **toda** la reserva de una sola vez. Para una renta de 1 año prellena una partida de "Renta mensual x 12" más el remanente diario. Eso contradice la regla que quieres.

Analogía: el asistente recurrente ya cobra "la renta del mes como el casero" — la primera quincena y luego meses completos. La factura manual, en cambio, te pasa la cuenta del año entero por adelantado.

## Qué se va a cambiar

Solo el prellenado de la factura manual creada desde una reserva de largo plazo:

- Cuando la reserva dura más de un mes calendario, la factura precargada cubrirá **únicamente del inicio de la reserva al último día de ese mes**, con monto prorrateado por días.
- Si la reserva empieza el día 1, el primer periodo es el mes completo (sin prorrateo).
- El periodo de facturación (`billing_period_start` / `billing_period_end`) se precarga con ese mismo rango, para que el siguiente ciclo empiece limpio el día 1 del mes siguiente.
- Las partidas que no son renta (logística, entrega, etc.) que hoy se arrastran de la cotización se conservan igual.
- Rentas cortas (que empiezan y terminan dentro del mismo mes) siguen calculándose como hoy, sin ningún cambio.
- El usuario puede seguir editando cantidades y montos a mano: esto es solo el valor precargado.

## Detalles técnicos

- `src/features/invoices/hooks/invoiceForm/useInvoiceFormHandlers.ts` → `buildLinesForBooking`: recortar el rango pasado a `generateLineItems` al fin de mes del `start_date` cuando `end_date` cae en un mes posterior; el importe prorrateado se calcula con la misma fórmula que usa el motor recurrente (tarifa mensual × días facturados / días del mes) para que ambos caminos den el mismo número.
- Extraer esa fórmula a un helper compartido en `src/lib/domain/` y reutilizarla; **no** se toca `supabase/functions/generate-recurring-invoices/prorate.ts` ni la lógica del edge function.
- Prellenar `billingPeriodStart` / `billingPeriodEnd` con el rango recortado (respetando `resolveBillingPeriod`, que ya existe).
- Sin cambios de esquema, RLS, triggers, RPC, permisos ni reglas fiscales.
- Pruebas: casos nuevos en los tests de `useInvoiceFormHandlers` (inicio a mitad de mes en reserva de 1 año, inicio el día 1, reserva corta dentro del mismo mes) y un test del helper de prorrateo compartido.
- Changelog: entrada **minor** (nueva regla de prellenado de facturación).
