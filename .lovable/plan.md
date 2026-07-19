# Sprint v7.91.0 — Auditoría BL-21…34 (dominios nuevos)

14 hallazgos nuevos agrupados en 4 fases por criticidad e independencia. Cada fase es entregable por sí sola; se puede detener entre fases.

## Fase 1 — Integridad financiera destructiva (CRÍTICOS de datos)

**BL-21 · Editar total de factura de proveedor no destruye pagos**

- Migración: trigger `BEFORE UPDATE OF total ON supplier_bills` que recalcule `NEW.balance = GREATEST(NEW.total - COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE bill_id = NEW.id AND status='completed'), 0), 0)`.
- Quitar el `balance: patch.total` del cliente en `useSupplierBillMutations.ts` (dejar que el trigger mande).
- Test Deno/psql: factura con pagos, editar total ↑ y ↓, verificar balance correcto.

**BL-22 · Delete/cancel de factura de proveedor con pagos**

- Migración: `ALTER TABLE supplier_payments DROP CONSTRAINT ... bill_id_fkey, ADD ... ON DELETE RESTRICT`.
- `useDeleteSupplierBill` y `useCancelSupplierBill`: precheck `SELECT COUNT(*) FROM supplier_payments WHERE bill_id=? AND status='completed'`; si >0, error con mensaje "Reversa los pagos antes de eliminar/cancelar".
- Test Vitest sobre las mutaciones (mock supabase).

**BL-25 · Doble aprobación de payment intent del portal**

- Convertir `useReviewPaymentIntent` a RPC `approve_payment_intent(p_intent_id, p_payment_data)` que en una sola transacción:
  1. `UPDATE customer_payment_intents SET status='approved', payment_id=<new> WHERE id=? AND status='pending' RETURNING *` — 0 filas → error.
  2. INSERT en `payments` con `payment_form_sat` y método canónico (fix BL-26 en el mismo RPC).
- Migración: añadir columna `payment_id UUID REFERENCES payments(id)` a `customer_payment_intents` si no existe.
- Test Deno del RPC: doble llamada concurrente → segunda falla.

**BL-26 · Portal pagos sin payment_form_sat bloquea REP**

- Incluido en el RPC de BL-25: mapear `payment_method` portal → catálogo interno + `payment_form_sat` desde `satCodeForMethod`.
- Test unit del mapeo.

## Fase 2 — Conciliación y precios contaminados

**BL-24 · confirm_bank_match sin exclusividad ni revalidación**

- Migración con tres cambios:
  1. `CREATE UNIQUE INDEX ... ON bank_statement_lines(matched_payment_id) WHERE matched_payment_id IS NOT NULL` (+ igual para `matched_supplier_payment_id`).
  2. Reescribir `confirm_bank_match` para validar: línea en `status IN ('unmatched','suggested')`, y `ABS(line.amount - payment.amount) < 0.01`.
  3. Retornar error tipado si falla.
- Test psql: intentar casar dos líneas con el mismo pago → segunda rechazada.

**BL-31 · Conversión de cotización reescribe tarifas maestras**

- `quoteBookingBuilders.ts`: eliminar `applyRatesToForklifts`. Las tarifas negociadas viven en la reserva (`bookings.monthly_rate` — verificar que exista, si no, añadir columna en migración).
- Ajustar `generate-recurring-invoices` para leer `bookings.monthly_rate` con fallback a `forklifts.monthly_rate` cuando la reserva no tenga override.
- Test Vitest: convertir cotización con descuento, verificar que `forklifts.monthly_rate` NO cambió.

**BL-34 · MRR usa tarifa maestra**

- Modificar `get_financial_kpis`: `SUM(COALESCE(b.monthly_rate, f.monthly_rate))` desde la reserva activa, no del maestro.
- Test psql con reserva de precio negociado.

## Fase 3 — Consistencia operativa

**BL-28 · Refacciones no descuentan stock**

- Migración: trigger sobre `maintenance_parts`:
  - INSERT → `UPDATE parts_inventory SET stock_quantity = stock_quantity - NEW.quantity_used`, check ≥ 0.
  - DELETE → reponer.
  - UPDATE de `quantity_used` → ajustar delta.
- Test psql con INSERT/UPDATE/DELETE.

**BL-29 · Costo de mantenimiento con read-modify-write**

- Migración: trigger `AFTER INSERT/UPDATE/DELETE ON maintenance_parts` que recalcule `maintenance_logs.cost = SUM(quantity_used * cost_at_time)`.
- Quitar el `UPDATE maintenance_logs SET cost` manual de `useAddMaintenancePart`.
- Test psql: dos inserts simulan concurrencia, cost final correcto.

**BL-32 · Conversión cotización→reservas no atómica**

- Nuevo RPC `convert_quote_to_bookings(p_quote_id, p_bookings jsonb)` que inserta todas las reservas en una transacción y marca la cotización como `accepted`.
- `useQuoteBookingCreator`: reemplazar `Promise.all` por `supabase.rpc`.
- Test Deno del RPC: si una reserva viola solape, ninguna se inserta.

## Fase 4 — Contratos, vigencia y saneamiento

**BL-27 · Contrato firmado sigue editable**

- Migración: trigger `BEFORE UPDATE ON contracts` que rechace cambios en `total`, `daily/weekly/monthly_rate`, `start_date`, `end_date`, `terms` cuando `OLD.signed_at IS NOT NULL`.
- Añadir columna `signed_by UUID REFERENCES auth.users(id)` y `terms_snapshot JSONB`.
- Nuevo RPC `sign_contract(p_contract_id)` que setea `status='signed'`, `signed_at=now()`, `signed_by=auth.uid()`, `terms_snapshot=<contenido actual>`.
- `ContractDetailActions.tsx`: llamar al RPC en lugar del `updateContract` para el flip de "signed".
- Test Vitest + psql.

**BL-33 · valid_until decorativo**

- `accept_quote_from_portal`: añadir check `quote.valid_until >= CURRENT_DATE` o error `quote_expired`.
- `useQuoteBookingCreator`: mismo check en cliente + RPC de BL-32.
- Job simple: extender `generate-recurring-*` o añadir cron RPC `expire_stale_quotes()` que marque `expired` cuando `valid_until < today AND status IN ('draft','sent')`.
- Test.

**BL-23 · Estatus "vencida" solo se refresca al escribir**

- Opción elegida: vista `v_supplier_bills_with_status` que compute `status_computed = CASE WHEN balance>0 AND due_date<today THEN 'overdue' ELSE status END`.
- `useSupplierBills` lee de la vista. `GRANT SELECT` a `authenticated`.
- Test rápido.

**Extra menor (register_supplier_payment)**

- Validar `p_payment_date >= issue_date` en el RPC. Test.

## Verificación final por fase

- `bunx vitest run` (≥1040 verdes + nuevos).
- `cd supabase/functions && deno fmt --check && deno test --allow-net --allow-env`.
- `bun run lint --max-warnings 0`.
- Playwright manual del flujo tocado en cada fase (Fase 1: editar factura con pago; Fase 2: cotización con descuento; Fase 3: refacción en OT; Fase 4: firmar contrato y verificar bloqueo).

## Changelog

- Fase 1 → `v7.91.0` minor.
- Fase 2 → `v7.92.0` minor (breaking a nivel datos: tarifas ya no se escriben al maestro).
- Fase 3 → `v7.93.0` minor.
- Fase 4 → `v7.94.0` minor.

Cada fase añade entrada en `public/changelog.json` + detalle `public/changelog/vX.Y.Z.json`.

## Pregunta antes de empezar

¿Ejecuto las 4 fases seguidas en este turno, o solo la Fase 1 (destructivos) y esperamos revisión antes de la siguiente? ejecuta todas