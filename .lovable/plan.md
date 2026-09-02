# Fixes Lovable — Ronda 2 (6 correcciones)

Aplicar los 6 fixes del documento `fixes_lovable_r2.md`, respetando las reglas duras: migraciones NUEVAS (nunca editar existentes), aritmética con `@/lib/money` / `_shared/money.ts`, sin mezclar monedas, IVA vía `resolveVatRatePercent`, e idempotencia apoyada en `uniq_invoices_recurring_period`.

## Orden de implementación

### FIX-1 · Tope de nota de crédito con REP suma pagos sin convertir divisa (Alto)
Hoy `sumRepBackedPayments` suma `payments.amount` crudo y el trigger `enforce_credit_note_max` hace `SUM(amount)` sin convertir: un pago USD topa una factura MXN 1:1.
- `repBackedPayments.ts`: agregar `currency` / `exchange_rate` al tipo, más `paymentAmountInInvoiceCurrency` y `sumRepBackedPaymentsInInvoiceCurrency` (devuelve `{ total, fxMissing }`). Se conserva `sumRepBackedPayments` marcada como deprecada.
- `creditNoteLimits.ts`: recibir moneda/TC de la factura, usar la suma convertida y, si `fxMissing > 0`, bloquear la emisión (fail-closed) con mensaje explícito en la UI de notas de crédito.
- Migración nueva: recrear `enforce_credit_note_max()` con el CASE canónico de `sync_invoice_status` y rechazo explícito cuando hay REP vigente en otra moneda sin tipo de cambio.

### FIX-2 · `prepare_payment_complement`: saldo anterior y parcialidad (Medio)
Migración nueva con `CREATE OR REPLACE` de la función (misma firma y mismo `jsonb` de retorno):
- `v_prior_paid` descuenta TODOS los pagos vigentes anteriores (no sólo los que ya tienen REP timbrado), con la conversión de divisa existente.
- `v_prior_emissions` cuenta sólo REP vigentes (`stamped` y sin `rep_cancelled_at`).
- Re-timbrado: se conserva la parcialidad original del pago en vez del `+1` fantasma.
- Intactos: validación de moneda/TC, `v_amount_dr`, criterio de NC, `UPDATE` de `installment_number`/`prior_balance`.

### FIX-6 · Facturación recurrente nunca cobra los extras de la cotización (Medio)
En `supabase/functions/generate-recurring-invoices/index.ts`:
- Traer `quote_id` en el select de reservas y precargar `quotes.line_items`.
- Portar `extractNonRentalLines` a `_shared/nonRentalLines.ts` (mismas claves SAT 84131500 / 78101800, `E48`, `objeto_imp "02"`).
- Detectar server-side las reservas con extras ya facturados (criterio de `useBilledExtraBookings`) para no cobrarlos dos veces.
- Anexar los extras sólo en el primer periodo facturado de cada reserva; totales e IVA con la aritmética en centavos ya existente.
- Sin columnas ni estados nuevos: la anti-duplicación sigue siendo el índice único parcial.

### FIX-3 · Cancelar lote de pago se bloquea por cualquier pago de la factura (Medio)
Migración nueva:
- `supplier_payments.batch_id` (FK a lotes, `ON DELETE SET NULL`) + índice parcial y backfill por antigüedad relativa.
- `cancel_supplier_payment_batch` bloquea sólo por pagos del propio lote.
- `release_stale_payment_locks` y `count_releasable_payment_locks` sólo consideran pagos con `batch_id` de un lote vigente.
- Frontend/RPC que registra los pagos del lote: llenar `batch_id` al insertar.

### FIX-4 · Cash flow proyecta rentas recurrentes sin IVA (Medio)
- `cash-flow/lib/queryKeys.ts`: traer `customer_id` y `customers(tax_rate)`.
- `cashFlowTransformers.ts`: aplicar `resolveVatRatePercent(customer_tax_rate)` con currency.js antes de `toMxn`; `tax_rate: 0` se respeta, null → 16%.
- Actualizar tests de `recurringBookingItems`.

### FIX-5 · OT de mantenimiento no valida reservas traslapadas (Medio)
Migración nueva con trigger `BEFORE INSERT OR UPDATE OF forklift_id, next_service_date, work_status` en `maintenance_logs`, espejo del guard ya existente en `create_booking`/`extend_booking`, usando `public.maintenance_buffer_days()`. Sin cambios de frontend salvo, a lo sumo, el mapeo del mensaje de error.

## Detalles técnicos

- Cada migración lleva timestamp real posterior a `20260902015942`; las migraciones citadas como origen quedan intactas.
- Se ejecutan `tsc --noEmit`, la suite de vitest y `scripts/arch-check.sh` tras cada fix.
- Al cerrar: nueva versión (minor, por el alcance) en `package.json`, `public/version.json`, `CHANGELOG.md`, `public/changelog.json`, `public/changelog-recent.json` y `public/changelog/<version>.json`.

## Riesgos

- FIX-3 incluye backfill aproximado de `batch_id` (por fecha relativa); se revisa el conteo afectado antes de aplicar.
- FIX-5 puede rechazar OTs futuras que hoy se traslapan; se revisan las OTs existentes antes de activar el trigger.
