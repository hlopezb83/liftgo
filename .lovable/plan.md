# Ola 2.2 — Facturación recurrente (Sprint 2)

## Auditoría de Ola 2.1 (previa)

- `extend_booking` RPC: `SECURITY DEFINER`, `SET search_path`, `FOR UPDATE`, buffer de 3 días y validación de overlap. ✔
- `useCreateBookingExtension` migrado al RPC atómico. ✔
- 4 casos nuevos en `useBookingExtensions.test.ts` (rol, buffer, overlap, éxito). ✔
- Vitest 1084/1084 + Deno 15/15 verde. ✔

Sin bugs ni tests faltantes detectados. Avanzamos.

## Alcance Ola 2.2

Objetivo: blindar `generate-recurring-invoices` (Edge Function, 494 LOC) para que sea idempotente, transaccional y consistente con reglas de negocio LiftGo.

### Findings a resolver

1. **BL-B1 — Idempotencia por período**
   Prevenir doble facturación si la Edge Function se reintenta o corre concurrentemente. Hoy sólo confía en `last_billed_date` sin lock.
   → Agregar índice único parcial `invoices(booking_id, billing_period_start)` para invoices recurrentes + advisory lock por `booking_id` durante generación.

2. **BL-B2 — Precio congelado al momento de facturar**
   Confirmar y documentar en tests que `monthly_rate` se toma de la reserva primero y del forklift como fallback en el instante de generación (memoria `recurring-billing-pricing`). Añadir test que cambie `monthly_rate` entre ciclos.

3. **BL-B3 — Prorrateo en cierre de reserva (bookingEnded)**
   Revisar `bookingEnded_test.ts`: cuando `end_date` cae a mitad de mes, prorratear el último ciclo con `computeProrate(1, end_day)`. Añadir caso "reserva termina el mismo día que inicia el ciclo" (0 días facturables).

4. **BL-B4 — Multi-currency defensivo (continuación de C-1)**
   Bloquear generación si `booking.currency` ≠ `forklift.currency` o si falta `exchange_rate` cuando aplique. Marcar línea como `eligible=false` con razón `currency_mismatch`.

5. **BL-B5 — Atomicidad multi-línea**
   Envolver la creación de invoice + líneas + actualización de `last_billed_date` en un RPC `create_recurring_invoice(booking_id, period_start, period_end, lines jsonb)` `SECURITY DEFINER` para evitar invoices huérfanas si falla la inserción de líneas.

### Cambios técnicos

- **Migración SQL**
  - `CREATE UNIQUE INDEX CONCURRENTLY invoices_booking_period_uniq ON invoices(booking_id, billing_period_start) WHERE booking_id IS NOT NULL AND billing_period_start IS NOT NULL;`
  - Nuevo RPC `create_recurring_invoice(...)` con `pg_advisory_xact_lock(hashtext(booking_id::text))`, insert de invoice + líneas + update `last_billed_date` en una transacción, retorna invoice id.
  - Añadir columnas `billing_period_start`, `billing_period_end` a `invoices` si no existen (verificar antes).
  - GRANTs a `authenticated` + `service_role`.

- **Edge Function** (`generate-recurring-invoices/index.ts`)
  - Reemplazar `supabase.from("invoices").insert(...)` por RPC.
  - Añadir chequeo `currency_mismatch` antes de push a `lines`.
  - Manejo de error `unique_violation` (23505) → log "already_billed" y continuar.

- **Tests Deno**
  - `index_test.ts`: caso concurrencia (dos runs seguidos → 1 invoice), caso `currency_mismatch`, caso `monthly_rate` cambiado.
  - `bookingEnded_test.ts`: caso 0 días facturables.

- **Tests Vitest**
  - `useRecurringInvoices` (si existe hook) o `MrrDetailPage` para confirmar que los cambios no rompen KPIs.

### Criterio de aceptación

- Deno tests ≥ 18/18 verde (15 actuales + 3 nuevos mínimos).
- Vitest 1084/1084 sigue verde.
- Correr la función dos veces seguidas sobre la misma reserva no duplica invoices.
- Cambio de `monthly_rate` entre ciclos se refleja en el siguiente invoice.

### Changelog

- `public/changelog.json` + `public/changelog/v7.118.0.json` (minor: nueva RPC + índice + lógica reforzada).

## Fuera de alcance

- Portal de clientes (Ola 2.3).
- CFDI edge cases (Sprint 3).
- Refactor visual de `MrrDetailPage`.
