# Plan de remediación — Auditoría de lógica de negocio (20 hallazgos)

Ataco los 20 hallazgos en 4 sprints ordenados por severidad e impacto fiscal. Antes de cada fix crítico verifico el código real (varios hallazgos requieren confirmar el estado actual del archivo — la auditoría puede citar líneas desactualizadas).

## Sprint 1 — Fixes fiscales críticos (v7.87.0)

Prioridad máxima: cada uno es de pocas líneas, con impacto directo en CFDI ante el SAT.

- **BL-01** `stamp-cfdi/handler.ts` — distinguir tasa 0 legítima de "no capturada": usar `taxRate >= 0 ? taxRate/100 : 0.16`. Replicar en `stamp-credit-note/handler.ts` (parte de BL-16).
- **BL-02** `stamp-cfdi/handler.ts` — pasar `discount` a Facturapi por línea, o prorratear `unit_price` neto. Validar con test que el total timbrado = total mostrado en la app cuando hay descuentos.
- **BL-03** Timbrado atascado en `stamping`: revertir a `pending` (o `error`) en todos los `return` posteriores al claim, en `stamp-cfdi/handler.ts` y `stamp-credit-note/handler.ts`. Añadir helper `releaseStampingClaim()`.
- **BL-04** `stamp-payment-complement/index.ts:49` — quitar `"stamping"` del `.in(...)` del claim. La recuperación de wedges se resuelve con BL-03, no ampliando la carrera.
- **BL-05** REP USD con MXN hardcodeado: leer `moneda` y `tipo_cambio` de la factura y usarlos en `relatedDoc`.
- **BL-06** REP cancelado rompe cadena: (a) `priorPaid` suma pagos con REP `cancelled` (el dinero sí se recibió); (b) permitir re-timbrado desde `cancelled` generando nueva parcialidad.
- **BL-07** Parcialidad por fecha de pago retroactiva: numerar por orden de creación/timbrado (o bloquear REP retroactivo posterior a un REP ya timbrado con parcialidad mayor).
- **BL-08** NCs pendientes no cuentan en `maxCreditable`: incluir `pending/stamping` en `computeCreditedAmount` (cliente) y validar en el handler de timbrado contra la suma ya acreditada (server-side, evita carreras).

## Sprint 2 — Cobros incorrectos silenciosos (v7.88.0)

Impactan facturación mensual real de clientes actuales.

- **BL-09** `get_income_statement`: restar NCs `stamped` (no canceladas) por mes con misma clasificación rental/venta. Migración + tests.
- **BL-10** `syncInvoiceStatus.ts`: early return si `status === 'cancelled'` o `'draft'`.
- **BL-11** Sobrepagos: validar `monto ≤ balance` en `useRecordPaymentForm` y en la RPC de creación de pago; exponer `credit_balance` si el negocio permite anticipos (a confirmar contigo).
- **BL-12** Recurrentes cobran mes completo desde día 15: prorratear el primer período usando `rentalCalculation`.
- **BL-13** Recurrentes no se detienen: filtrar `end_date >= billingStart` en `generate-recurring-invoices`. Evaluar auto-completar reserva al registrar la devolución (cambio de flujo, lo dejo detrás de flag si toca).
- **BL-14** Timezone en `rentalCalculation.ts:117-118`: usar `parseDateLocal` (ya existe en `invoiceFormBuilders.ts`) dentro de `generateLineItems*`. Test que reproduzca el caso Monterrey UTC-6.
- **BL-15** Remanente diario > tarifa mensual: capar `remanente = min(calculado, tarifa_superior_aplicable)`.

## Sprint 3 — Inconsistencias fiscales y operativas (v7.89.0)

- **BL-16** `stamp-credit-note/handler.ts`: propagar `payment_method` de la factura origen (PUE/PPD), leer `exchange` real, pasar `modeOverride` como en `stamp-cfdi`.
- **BL-17** Constraint `no_overlapping_bookings`: excluir `completed`, y evaluar cambio de `daterange` a `'[)'` para permitir rotación mismo día. Requiere migración cuidadosa (revisar índice GiST existente y datos históricos).
- **BL-18** Depreciación por día completo: prorratear `rented_per_month` y `months_rented` por días reales rentados en el mes.
- **BL-19** Base de efectivo asimétrica: cuando `p_basis='cash'`, gastos por fecha de pago (supplier_payments), no por emisión.

## Sprint 4 — Detalles con trampa (v7.90.0) — BL-20

- Rechazar timbrado stub cuando `mode === 'live'` sin API key (no marcar como `stamped`).
- `DamageActions.tsx`: usar `actual_cost ?? estimated_cost` al facturar.
- `stamp-cfdi:263`: validar folio numérico antes de `Number(...)`.
- `cancel-payment-complement`: rechazar motivo inválido con 400 en vez de fallback silencioso a `"02"`.

## Detalles técnicos

- Cada sprint acompañado de tests: `stamp-cfdi` (descuentos, tasa 0, claim rollback), `stamp-payment-complement` (USD, cancelados, retroactivos), `rentalCalculation` (timezone, cap remanente), `get_income_statement` (NCs, cash basis).
- Migraciones DB: BL-08 (validación server-side de NC), BL-09/18/19 (RPC reporte), BL-17 (constraint booking).
- Changelog: una entrada minor por sprint (v7.87.0 → v7.90.0).

## Preguntas antes de arrancar

1. **BL-11** — ¿El negocio acepta sobrepagos como saldo a favor (crear `credit_balance` en customers), o siempre son error y hay que rechazarlos? No acepta
2. **BL-13** — ¿Auto-completar la reserva al registrar la devolución, o solo excluir del recurrente por `end_date`? Lo primero es más limpio pero cambia el flujo operativo. Auto Completar
3. **BL-17** — Cambiar `daterange` de `[]` a `[)` afecta reservas históricas; ¿arranco solo con excluir `completed` y dejo el cambio de rango para después con revisión de datos? Si

¿Arranco con Sprint 1 asumiendo respuestas conservadoras (rechazar sobrepagos, solo excluir por `end_date`, solo excluir `completed` del constraint) y ajustamos en el camino?