## Auditoría de Sprint 4 (v7.102.0)

**Estado: verde.**

- `generate-recurring-maintenance/index.ts`: claim atómico correcto. Bajo READ COMMITTED, el segundo `UPDATE ... WHERE last_generated_month < currentMonth` reevalúa la fila tras el lock del primero (EvalPlanQual) y devuelve 0 filas → idempotente sin race. Rollback restaura el valor original sólo cuando el claim propio tuvo éxito → seguro.
- Timezone `America/Monterrey` alineado con `generate-recurring-invoices`. Logs nacen `scheduled` y `get_income_statement` ya filtra `work_status='completed'` (P&L limpio).
- `PostDeliveryPickupDialog`: Zod refinement con baseline `delivery.hours_reading`; propagación desde `DeliveryDetail` verificada.
- Tests: `pickupHorometerSchema.test.ts` (4/4 ✅) y smoke Deno de la edge function (2/2 ✅).

**Gap detectado (no bloqueante, se aborda como deuda):** no hay test unitario que ejercite el claim atómico con mock de Supabase (dos corridas seguidas → segunda devuelve `skipped`). Se agrega en Sprint 5 junto con la infra de idempotencia general.

---

## Sprint 5 — v7.103.0 (Ronda 3: BL-43, BL-44, BL-45 · Idempotencia de webhooks y reintentos)

Cierra los 3 hallazgos restantes de Ronda 3. Todos tocan integraciones externas asíncronas (Facturapi CFDI + confirmaciones de pago del portal) donde hoy un reintento del proveedor puede duplicar estado.

### BL-43 — Idempotencia de webhooks Facturapi (cancelaciones / status CFDI)

`refresh-cancellation-status` y los flujos de `cancel-cfdi` / `stamp-cfdi` no registran el `event_id` que envía Facturapi. Si Facturapi reintenta el POST (timeout, 5xx transitorio), reprocesamos y podemos:
- Marcar dos veces `cancellation_status`.
- Insertar filas duplicadas en `activity_log`.
- Disparar notificaciones repetidas al operador.

Cambios:
1. **Migración `webhook_events`** — bitácora append-only:
   ```
   CREATE TABLE public.webhook_events (
     id uuid PK default gen_random_uuid(),
     provider text NOT NULL,              -- 'facturapi' | 'portal_payment' | ...
     event_id text NOT NULL,              -- id externo del evento
     event_type text NOT NULL,
     payload jsonb NOT NULL,
     received_at timestamptz NOT NULL default now(),
     processed_at timestamptz,
     status text NOT NULL default 'pending' CHECK (status IN ('pending','processed','failed','duplicate')),
     error_message text,
     UNIQUE (provider, event_id)
   );
   ```
   - GRANT sólo a `service_role` (edge functions); RLS con policy admin-read.
2. **Helper `_shared/webhookIdempotency.ts`** con `claimWebhookEvent(provider, eventId, eventType, payload)` que:
   - Inserta la fila; si el UNIQUE violó, devuelve `{ duplicate: true }` sin reprocesar.
   - Si insertó, devuelve `{ duplicate: false, markProcessed(), markFailed(err) }`.
3. **Aplicar en**:
   - `refresh-cancellation-status/index.ts` (usa `x-facturapi-event-id` o hash del payload como fallback).
   - `stamp-cfdi/handler.ts` (respuesta síncrona de Facturapi con `id` propio → deduplicar por `invoice_id + facturapi_id`).
   - `cancel-cfdi/index.ts` y `cancel-credit-note/index.ts` (mismo patrón).

### BL-44 — Cola de reintento para operaciones fallidas de CFDI

Hoy si `stamp-cfdi` falla con error transitorio de Facturapi (red / 502), la UI muestra error y el operador debe reintentar manualmente. No hay reintento automático ni visibilidad de fallas históricas.

Cambios:
1. **Migración `cfdi_retry_queue`**:
   ```
   CREATE TABLE public.cfdi_retry_queue (
     id uuid PK,
     operation text NOT NULL CHECK (operation IN ('stamp','cancel','cancel_nc','cancel_rep')),
     invoice_id uuid NOT NULL,
     payload jsonb NOT NULL,
     attempts int NOT NULL default 0,
     max_attempts int NOT NULL default 5,
     next_retry_at timestamptz NOT NULL default now(),
     last_error text,
     status text NOT NULL default 'pending' CHECK (status IN ('pending','processing','succeeded','exhausted')),
     created_at timestamptz default now(),
     updated_at timestamptz default now()
   );
   ```
2. **Nueva edge function `process-cfdi-retry-queue`**:
   - Lock-and-claim `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 20 WHERE status='pending' AND next_retry_at <= now()`.
   - Ejecuta la operación reutilizando los handlers existentes.
   - En éxito → `status='succeeded'`. En fallo transitorio → backoff exponencial (`next_retry_at = now() + interval '2^attempts minutes'`). Si `attempts >= max_attempts` → `status='exhausted'` y notifica en `activity_log`.
3. **Cron `pg_cron`**: `*/5 * * * *` invoca la function con `CRON_SECRET`.
4. **`stamp-cfdi` / `cancel-cfdi`**: en fallo con código transitorio (network, 5xx, timeout), encolar en lugar de sólo devolver error. Errores de negocio (RFC inválido, timbre rechazado por SAT) NO se encolan.

### BL-45 — Idempotencia de confirmaciones de pago del portal

`approve_portal_payment` / `reject_portal_payment` (RPCs de Sprint v7.92.0) no rechazan una segunda invocación con mismo `payment_intent_id` si el estado ya cambió. Un doble click del admin puede duplicar la fila de `invoice_payments`.

Cambios:
1. Añadir guard idempotente al inicio de ambas RPCs:
   ```sql
   IF EXISTS (SELECT 1 FROM payment_intents WHERE id = _intent_id AND status IN ('approved','rejected')) THEN
     RAISE EXCEPTION 'PAYMENT_INTENT_ALREADY_PROCESSED' USING ERRCODE = 'P0001';
   END IF;
   ```
2. UI: mapear ese código a mensaje amable "Este pago ya fue procesado" y refrescar cache.

### Tests

- **`webhookIdempotencyHelper_test.ts`** (Deno): insert nuevo → `duplicate:false`; segundo insert mismo `event_id` → `duplicate:true`, sin side effects. (3 casos)
- **`generateRecurringMaintenanceClaim.test.ts`** (Deno, deuda del sprint anterior): mockea Supabase, simula dos corridas → segunda cuenta como `skipped`, no inserta log. (2 casos)
- **`cfdiRetryQueue.test.ts`** (Vitest): backoff exponencial correcto, `exhausted` tras 5 intentos, `SKIP LOCKED` no toma filas en processing. (4 casos)
- **`portalPaymentIdempotency.test.ts`** (Vitest): segunda llamada a `approve_portal_payment` → error `PAYMENT_INTENT_ALREADY_PROCESSED`; no duplica fila en `invoice_payments`. (2 casos)

### Entregables

- Migraciones: `create_webhook_events.sql`, `create_cfdi_retry_queue.sql`, `harden_portal_payment_idempotency.sql`.
- `supabase/functions/_shared/webhookIdempotency.ts`.
- `supabase/functions/process-cfdi-retry-queue/index.ts` (+ smoke test).
- Modificaciones en: `refresh-cancellation-status`, `stamp-cfdi/handler.ts`, `cancel-cfdi`, `cancel-credit-note`.
- 4 archivos de test nuevos.
- `public/changelog.json` + `public/changelog/v7.103.0.json` (minor).

### Verificación

- `cd supabase/functions && deno test --allow-all`
- `cd supabase/functions && deno fmt --check`
- `bunx vitest run`

### Fuera de alcance

- Migrar `activity_log` a partición temporal (BL futuro).
- Reintentos de `generate-recurring-invoices` (ya idempotente por diseño).
