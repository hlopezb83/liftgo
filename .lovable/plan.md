
# Plan v7.134.0 — Aplicar patch de verificación con ajustes

Aplicar el patch `00-TODO-EN-UNO.patch` (59 archivos) en 3 tandas, con los 3 ajustes acordados:

- **Reconcile CFDI**: schedule cada **10 min** (no 5, no 15).
- **`create_booking`**: dropear overload de 7 args antes de recrear la de 8.
- **`stamp_variance`**: alinear a `numeric(12,4)` (coincide con índice parcial ya existente).

Todos los cambios ya validados como bugs reales o mejoras necesarias (ver auditoría anterior).

---

## Tanda 1 — Migraciones SQL (7 migraciones)

Ejecutar por orden estricto para evitar conflictos de dependencia:

1. **`20260721000000_retry_queue_cron.sql`** — ajustado:
   - `ALTER TABLE invoices ADD COLUMN stamping_attempts int NOT NULL DEFAULT 0`.
   - `UNSCHEDULE` los jobs actuales `process-cfdi-retry-queue-every-5min` y `reconcile-stamping-invoices-every-15min` **antes** de programar los nuevos.
   - Reprogramar con los mismos nombres canónicos: `process-cfdi-retry-queue-every-5min` (5 min) y `reconcile-stamping-invoices-every-10min` (10 min).
   - Fallback: usar `internal_get_cron_secret()` ya existente (v7.133.0) en vez de leer Vault directo.

2. **`20260721090100_...`** — BL-A5:
   - `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stamp_variance_checked_at timestamptz`.
   - `ALTER TABLE invoices ALTER COLUMN stamp_variance TYPE numeric(12,4)` (columna ya existe sin escala).

3. **`20260721090200_...`** — filtro `deleted_at`:
   - `DROP FUNCTION IF EXISTS public.create_booking(uuid, uuid, text, text, date, date, boolean)` (overload de 7 args).
   - Recrear `get_available_forklifts` y `create_booking(8 args)` con `deleted_at IS NULL`.

4. **`20260721090300_...`** — `mark_started_bookings_rented()` + cron diario `20 7 * * *`.

5. **`20260721090400_...`** — `report_profit_by_model` (prorrateo multi-booking por factura).

6. **`20260721090500_...`** — `enforce_credit_note_max` con `SELECT … FOR UPDATE` (fix TOCTOU).

7. **`20260721090600_...`** — `lock_invoice_for_rep(uuid)` (serialización REP).

## Tanda 2 — Edge Functions (10 archivos)

Aplicar tal cual del patch, con un ajuste:

- **`stamp-cfdi/handler.ts`**:
  - Reemplazar `client.invoices.create` por `createInvoiceWithSignal` (abort real).
  - Timeout: en `TIMEOUT` la factura queda en `stamping` (sin encolar retry).
  - Escribir `stamp_variance` + `stamp_variance_checked_at` en el UPDATE final.
  - **Ajuste**: reutilizar `stampVariance` de `_shared/money.ts` (v7.133.0) en vez del helper local `computeStampVariance` — mantener una única fuente de verdad. Exportar `STAMP_VARIANCE_TOLERANCE_MXN` compartido.
- **`_shared/facturapi/client.ts`**: agregar `createInvoiceWithSignal` con fallback.
- **`_shared/auth.ts`**: nuevo `requireServiceOrRole` (bypass `service_role`).
- **`_shared/test/supabaseClientMock.ts`**: exponer `state.inserts[]` para tests.
- **`cancel-cfdi/handler.ts`**, **`cancel-payment-complement/handler.ts`**: bypass service_role + encolado transitorio (BL-44).
- **`cancel-credit-note/index.ts`**: migrar a `requireServiceOrRole`.
- **`stamp-payment-complement/index.ts`**: llamar `lock_invoice_for_rep` antes de calcular NumParcialidad.
- **`process-cfdi-retry-queue/index.ts`**: 
  - Auth por CRON_SECRET o service_role (comparación estricta, sin `.includes`).
  - Recuperación de filas `processing` huérfanas (>15 min).
  - Mapping `cancel_rep → payment_id`.
  - Manejo de error en cada UPDATE (log + continue).
- **`reconcile-stamping-invoices/index.ts`**:
  - Auth CRON_SECRET/service_role.
  - XML obligatorio antes de RPC.
  - Contador `stamping_attempts`, tope 10 intentos → `error`.
- Tests actualizados: `handler_test.ts` (stamp/cancel), `index_test.ts` (retry queue, reconcile), `money_test.ts` intacto.

## Tanda 3 — Frontend (26 archivos)

Aplicar tal cual del patch:

**Fix de negocio (crítico):**
- `useBookingActions.handleExtend` → `useCreateBookingExtension` (RPC `extend_booking` en vez de UPDATE crudo).
- `useBookingActionsLogic.ts`, `BookingActions.tsx`: renombrar `updateBookingPending` → `extendBookingPending`.
- `useBookingExtensions.ts`: invalidar también `forkliftKeys.all`.
- Borrar `ExtendBookingDialog.tsx` (dead code tras el fix).
- `BookingDetail.tsx`: quitar import + uso.

**UX (list pages con `isError`/`onRetry`):**
- `CuentasPorPagarPage`, `AuditTrailPage`, `ContractsPage`, `DamageTrackingPage`, `DeliveriesPage`, `InventoryPage`, `MaintenancePage`, `QuotesPage`, `ReturnInspectionPage`, `SuppliersPage`, `UserManagementPage`.
- `useAccountsPayableKpis`: exponer `isError`/`refetch`.

**UX (detail 404 → EmptyState + botón Volver):**
- `BookingDetail`, `ContractDetail`, `CustomerDetailPage`, `DeliveryDetail`, `ForkliftDetail`, `InvoiceDetail`.

**Seguridad UI:**
- `InvoiceDetailActions`: envolver Editar / Timbrar / Registrar Pago en `<RoleGuard module="Facturas" minAccess="full">`.

**A11y & copy ES-MX:**
- Skeletons con `role="status"` + `sr-only "Cargando…"` (Card/Form/Table).
- `EmptyState` subtitle "Aún no hay registros aquí".
- `Sidebar`: "Alternar barra lateral".

**Schema-first:**
- `ContractForm`: migrar 3 numéricos de `register()` a `<FormField>`.

**Errores DB:**
- `dbErrors.ts`: traducir `23P01` / `no_overlapping_bookings` a "Las fechas se traslapan con otra reserva o con mantenimiento programado."
- Test agregado.

**Portal:**
- `PortalInvoicesTable`: scroll horizontal (`overflow-x-auto`).

**Types:**
- `src/integrations/supabase/types.ts` se regenera tras migraciones (no editamos a mano).

## Verificación

1. `deno fmt --check` en `supabase/functions/`.
2. `bunx vitest run` (esperamos +N tests verdes: BL-A5 stamp, cancel service_role, dbErrors overlap, ListPageLayout isError).
3. `deno test _shared/` (money, cfdiRetryQueue, auth).
4. Query manual en DB: `SELECT jobname, schedule FROM cron.job` — confirmar 3 crons CFDI únicos (retry 5min, reconcile 10min, mark_started_bookings 07:20).
5. Smoke test: crear reserva futura, verificar que `forklift.status` sigue `available` hasta el día de inicio.
6. Smoke test: timbrar una factura de prueba → verificar `stamp_variance` y `stamp_variance_checked_at` poblados.

## Changelog

Agregar `public/changelog/v7.134.0.json` (minor) + entry en `public/changelog.json`. Título: **"Cierre de verificación integral (BL/EC/UX) + fix reservas futuras"**. Highlights por bloque (extend booking RPC, mark_started_bookings, cancel* service_role bypass, stamping_attempts cap, RoleGuard Facturas, overlap error copy, ES-MX sidebar).

## Fuera de alcance

- No tocar `src/integrations/supabase/client.ts` (auto-gen).
- No tocar tests de baseline visual (E2E Playwright).
- No aplicar cambios de bundling / dependencias.
