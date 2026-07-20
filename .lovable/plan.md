
## Auditoría de la fase pasada (Sprint 1a · v7.113.0)

**Estado: verde.** Sin bugs pendientes, con tests, y el bloqueo de CI (deno fmt de `cancel-cfdi/handler.ts` + `handler_test.ts`) ya está resuelto en la última acción.

- **C-2 (cancel-cfdi anti-stub en live):** handler rechaza con 400 cuando `mode='live'` y falta `apiKey` o `facturapi_invoice_id`. Nunca se marca `cancelled` en ese path (verificado en tests: `updates` queda vacío).
- **C-1 (bloqueo de divisa en pagos):** trigger `enforce_payment_matches_invoice_currency` + `useRecordPaymentForm.lockedCurrency` + UI con `<Select disabled>` mostrando la moneda de la factura. Sin `!`/`as`.
- **Tests:** 1083/1083 Vitest + 13 Deno (incluye los 2 nuevos C-2 y el nuevo test de Vitest para lock de moneda).
- **Deuda del sprint:** ninguna. La medida C-1 es explícitamente temporal ("hasta implementar soporte formal multi-moneda") — se retomará como parte del Sprint 2 planificado.

---

## Sprint 1b — Fiscal y dinero (continuación)

Cubre los 6 hallazgos restantes del Sprint 1 del roadmap del auditor. Todos son de riesgo fiscal/financiero, así que este bloque cierra la deuda regulatoria antes de saltar a flota (Sprint 2).

### 1. BL-A4 — `cancel-cfdi` debe revertir pagos y liberar la reserva
- Antes de cancelar, si hay pagos aplicados a la factura: bloquear con error accionable ("Reversa los pagos antes de cancelar") **o** marcar `payments.status='void'` + revertir asignaciones (`payment_allocations`) dentro de una transacción. Decisión por defecto: **bloquear** (más seguro; el usuario decide qué hacer con el dinero).
- Al aceptar cancelación (`cfdi_status='cancelled'`): resetear en el booking asociado los flags de facturación (`is_invoiced=false`, `invoice_id=null` o equivalente) para permitir re-facturar limpio.
- Para motivo `01`, validar que `substitution_uuid` corresponda a una factura **timbrada y vigente** del mismo cliente antes de cancelar.
- Tests Deno: (a) cancelación bloqueada con pagos, (b) reset de booking, (c) motivo 01 con sustituta inválida rechazada.

### 2. BL-A5 — Reconciliar total timbrado contra `invoices.total`
- Tras timbrar (`stamp-cfdi/handler.ts`), leer `total` del CFDI devuelto por Facturapi y comparar contra `invoices.total` con tolerancia ±0.01. Si difiere: registrar en `invoices.stamp_variance` (nueva columna numérica) y en logs; NO fallar el timbrado (el CFDI ya existe ante el SAT), pero disparar alerta y bloquear cobros PPD hasta reconciliar.
- Unificar el cálculo de descuento en `_shared/money.ts` (una sola ruta, `currency.js`), reemplazando el `Math.round` de las líneas 250-277/316-338.
- Test Deno con fixture que fuerza divergencia de 1 centavo.

### 3. EC-A1 — Consumidor real de `cfdi_retry_queue`
- Nueva edge function `process-cfdi-retry-queue`: reclama filas atómicamente (`FOR UPDATE SKIP LOCKED`, `status='pending'` con backoff exponencial vía `next_attempt_at`), reintenta el timbrado, mueve a `success` o `dead` según resultado, cap de intentos configurable (default 5).
- Programar en `pg_cron` cada 5 min.
- `cancel-cfdi` deja de aparentar que encola (limpiar el comentario) hasta que exista una cola separada de cancelaciones (fuera de scope del sprint).
- Tests: reclamación atómica con concurrencia simulada + transición a `dead` tras N intentos.

### 4. EC-A2 — Reparar `stamping` huérfanos + timeouts en Facturapi SDK
- Envolver todas las llamadas del cliente Facturapi (`_shared/facturapi/client.ts`) con `AbortController` (default 25 s) para que un isolate colgado no deje CFDI emitidos sin registrar.
- Cambiar el orden en `stamp-cfdi` y `stamp-payment-complement`: al recibir respuesta OK de Facturapi, primero **persistir el UUID/facturapi_invoice_id en una tabla `cfdi_stamp_log`** (idempotente por request_id) y sólo entonces actualizar la fila principal. Si el UPDATE final falla, la información no se pierde.
- Nueva edge function `reconcile-cfdi-stamping` (cron diario): busca `cfdi_status='stamping'` con antigüedad >10 min, consulta Facturapi por `request_id`/UUID y corrige el estado.
- Tests Deno: happy path escribe log antes de UPDATE; simulación de UPDATE fallido y reparación.

### 5. BL-M5 — Orden secuencial correcto de REP (`ImpSaldoAnt`)
- En `stamp-payment-complement/index.ts` (líneas 126-178) sólo consumir pagos y REPs previos con `cfdi_status='stamped'` **ordenados por `payment_date, created_at`**, ignorando parcialidades en `error`/`draft`.
- Calcular `ImpSaldoAnt` como `total - sum(pagos_previos_timbrados)` en vez de sumar montos crudos.
- Test: escenario con 3 parcialidades donde la segunda falló timbrado → `ImpSaldoAnt` de la tercera debe reflejar sólo la primera.

### 6. EC-M6 — Validación de signos en montos/cantidades
- Guardas server-side (edge functions + triggers) que rechacen `quantity <= 0` y `unit_price < 0` en:
  - `stamp-cfdi/handler.ts` (líneas 251-252).
  - `generate-recurring-invoices/index.ts` (línea 133).
  - Trigger `enforce_positive_line_amounts` en `invoice_line_items` y `quote_line_items`.
- Tests: RPC y edge functions rechazan payloads inválidos.

---

### Detalles técnicos

- **Migraciones:** ~5 (columnas + triggers + tabla `cfdi_stamp_log` + índice único de `cfdi_retry_queue` claim + pg_cron entries).
- **Edge functions nuevas:** `process-cfdi-retry-queue`, `reconcile-cfdi-stamping`.
- **Módulo nuevo:** `supabase/functions/_shared/money.ts` (ruta única de redondeo con `currency.js` vía import npm).
- **Frontend impact:** mínimo — banner en `InvoiceDetailBody` cuando `stamp_variance > 0`.
- **Testing target:** +12 tests Deno, +3 Vitest. Meta CI final: 1086+ Vitest / 25+ Deno, todos verdes.
- **Changelog:** v7.114.0 (minor — nuevas funciones + triggers), un JSON de detalle con 6 secciones (una por hallazgo).
- **Fuera de scope:** soporte formal multi-moneda (Sprint 2), soft-delete de unidades (Sprint 2).

### Verificación
1. `bun run test` → 1086+/1086+ verde.
2. `deno fmt --check supabase/functions/` + `supabase--test_edge_functions` → verde.
3. Playwright smoke sobre `invoice-payment.spec.ts` para confirmar que el flujo de pago sigue funcionando con el trigger de sanity checks.
4. Verificación funcional en preview: cancelar una factura FAC de test con pago aplicado → debe bloquear.
