# Validación de fix-10.diff — 4 correcciones reales, 1 opcional

Revisé cada punto contra las funciones reales de la base de datos y el código del frontend.

## N-3 — Reversar un pago de una factura de proveedor "pagada" sigue trabado — REAL, prioritario

Confirmado: la corrección anterior (v7.342.4) sólo dio la llave del bypass `app.cxp_recalc` al candado `lock_paid_supplier_bill_with_payments`. Pero `supplier_bills` también tiene el trigger `trg_validate_transition`, y `validate_transition` conserva el mismo guard ("salir de 'paid' requiere service_role o cero pagos"). Al borrar uno de varios pagos, el recálculo intenta pasar la factura de `paid` a `partial` y este segundo candado lanza la excepción. El bug sigue vivo.

Acción: agregar en `validate_transition` el bypass `app.cxp_recalc = 'on'` para `supplier_bills`, antes del guard 4.3. El bloqueo sigue activo para ediciones manuales.

## N-1 — Una factura sólo acreditada se marca como "pagada" — REAL

Confirmado: hoy `sync_invoice_status_from_payments` compara `v_paid >= v_total - v_credited - 0.005` sin exigir pagos reales. Si una nota de crédito cubre el total, la factura pasa a `paid` con `paid_at` de hoy aunque el cliente nunca pagó un peso. Contablemente es incorrecto y ensucia reportes de cobranza.

Nota de alcance: hay 16 facturas históricas en `paid` sin pagos, pero **ninguna** tiene notas de crédito — son datos migrados, no producto de este bug. No se tocan.

Acción: exigir `v_paid > 0` para marcar `paid`, y agregar la rama "sólo acreditada" que conserva el status actual (revirtiendo a `sent` si estaba `paid`).

## N-21 — Criterio de notas de crédito distinto entre pantalla y base de datos — REAL

Confirmado: el frontend (`creditNoteLimits.ts`, `InvoiceDetail.tsx`) cuenta NC con `cfdi_status='stamped' AND status<>'cancelled' AND cancellation_status<>'accepted'`, mientras la base usa sólo `status='stamped'` en `sync_invoice_status_from_payments` y `enforce_payment_within_invoice_total`. Hoy hay una sola NC y los dos criterios coinciden, así que no hay daño acumulado; pero en cuanto se cancele una NC ante el SAT, la pantalla y el saldo del servidor van a diferir (la UI permitiría un pago que el trigger rechaza, o al revés).

Acción: unificar ambas funciones al criterio de la pantalla.

## N-33 — Tipo de cambio bloqueado por cualquier pago — REAL (menor)

Confirmado: `trg_invoice_tipo_cambio_inmutable` bloquea si existe **cualquier** pago. La razón real del candado es no contradecir un CFDI ya timbrado; un pago sin REP timbrado no tiene efecto fiscal, y `payments` guarda su propio `amount_mxn`, así que corregir un tipo de cambio mal capturado es seguro mientras no haya REP timbrado.

Acción: condicionar el bloqueo a `cfdi_uuid IS NOT NULL` o a la existencia de un pago con `rep_cfdi_status='stamped'`.

## N-2 — Validación de cliente en todo UPDATE — OPCIONAL, se aplica como blindaje

`enforce_invoice_customer_when_not_draft` corre en INSERT y UPDATE y hoy no hay ninguna factura fuera de borrador sin cliente, así que no está rompiendo nada. Pero con N-1 la sincronización de pagos empieza a hacer más UPDATEs de status, y una fila legada sin cliente dejaría de poder actualizarse. Lo incluyo como blindaje barato: validar sólo la salida de borrador y eximir la sincronización de pagos.

## Detalles técnicos

- Una sola migración con los cinco `CREATE OR REPLACE FUNCTION` (sin DDL de tablas), cumpliendo las reglas permanentes: `SET search_path`, sin policies `USING (true)`, sin cambios de grants.
- Orden dentro de la migración: `validate_transition` (N-3), `sync_invoice_status_from_payments` (N-1 + N-21), `enforce_payment_within_invoice_total` (N-21), `trg_invoice_tipo_cambio_inmutable` (N-33), `enforce_invoice_customer_when_not_draft` (N-2).
- Prueba de humo SQL nueva en `supabase/tests/`: (a) borrar un pago de una factura de proveedor `paid` con dos pagos y verificar que queda `partial`; (b) acreditar el total de una factura sin pagos y verificar que **no** queda `paid`.
- Changelog: entrada **v7.343.0** (minor) con la fecha de hoy más su archivo de detalle en `public/changelog/`.
