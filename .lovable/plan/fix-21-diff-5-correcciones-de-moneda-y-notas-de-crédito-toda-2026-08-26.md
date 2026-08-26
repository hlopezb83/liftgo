# fix-21.diff — 5 correcciones de moneda y notas de crédito (todas en base de datos)

Verifiqué los cinco hallazgos contra la base de datos real. **Los cinco son bugs reales**, todos de dinero. Ninguno toca código de frontend.

## Qué está mal hoy

**R4-03 — Pagos en dólares se guardan como si fueran pesos**
El trigger que calcula `amount_mxn` termina en `COALESCE(..., 1)`: si no hay tipo de cambio, multiplica por 1. Un pago de 1,000 USD queda registrado como 1,000 MXN. Además nunca mira `payments.currency`, así que un pago en USD contra una factura en MXN se convierte igual, sin aviso.

**R4-10 — La vista de saldos suma peras con manzanas**
`v_invoices_with_balance` hace `sum(payments.amount)` en crudo, sin convertir. Si una factura en USD recibe pagos en USD el saldo cuadra por casualidad; en cualquier mezcla de monedas el saldo mostrado es incorrecto.

**R4-15 — El tope de sobrepago tampoco convierte**
`enforce_payment_within_invoice_total` compara `SUM(amount)` crudo contra el total de la factura. (El criterio de notas de crédito que el diff propone ya está aplicado en ambas funciones desde N-21, así que de este punto solo falta la parte de moneda.)

**R4-16 — Factura saldada con nota de crédito aparece como vencida**
Si una nota de crédito timbrada cubre el 100% de la factura y no hubo pagos, la función deja el estado en `sent`/`overdue` con saldo cero. Sale en cobranza una factura que ya no se debe.

**R4-12 — Conversión de cotización con tipo de cambio inventado**
`convert_quote_to_bookings` hace `COALESCE(v_quote.tipo_cambio, 1)`: una cotización en USD sin tipo de cambio genera reservas a paridad 1:1.

## Qué se va a hacer

Cinco migraciones SQL, en este orden:

1. **R4-03** — `trg_payment_amount_mxn` consciente de moneda: pago en MXN se guarda tal cual; pago en moneda distinta a la de la factura se rechaza con mensaje claro; misma divisa usa el tipo de cambio del pago y si no hay, deja `amount_mxn` en NULL (patrón `fx_missing` ya usado en reportes) en vez de 1:1.
2. **R4-10** — la subquery de pagos de `v_invoices_with_balance` convierte cada pago a la moneda de la factura con la misma precedencia que `report_revenue_by_month` (tipo de cambio del pago, luego el de la factura). Se conservan los GRANT actuales de la vista.
3. **R4-15** — `enforce_payment_within_invoice_total` suma pagos ya convertidos a la moneda de la factura.
4. **R4-16** — nueva rama en `sync_invoice_status_from_payments`: cero pagos + crédito >= total (tolerancia 0.005) marca `paid`.
5. **R4-12** — `convert_quote_to_bookings` usa `COALESCE(NULLIF(tc,0), CASE WHEN moneda='MXN' THEN 1 END)`, es decir NULL cuando falta tipo de cambio en divisa, en vez de bloquear la conversión.

Todas las funciones conservan `SECURITY DEFINER` / `SET search_path = public` y los guards de rol existentes, según las reglas permanentes de migraciones del proyecto.

## Sin backfill

Solo protección hacia adelante: no se recalculan `amount_mxn` ni estados de facturas históricos. Si después quieres una lista de los registros ya afectados, la genero aparte como reporte de solo lectura.

## Verificación

- `deno check` / pruebas de funciones y suite Vitest completa.
- Consulta de control tras cada migración para confirmar que la definición quedó aplicada.
- Revisión de que la vista siga accesible con los mismos permisos.

## Changelog

Nueva entrada **v7.352.0** (minor) en `public/changelog.json` y `public/changelog/v7.352.0.json`, más bump en `package.json`.
