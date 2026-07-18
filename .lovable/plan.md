# Plan: Code Review Remediation (22 hallazgos confirmados)

## Resultados de validación

De los 27 hallazgos del reporte, 22 confirmados y **5 descartados**:

| Descartado | Razón |
|---|---|
| SEC-001 | `company_settings.facturapi_key` no existe; políticas ya usan `has_role`. |
| SEC-003 | Ninguna política actual usa `FOR ALL USING (true)`; todas usan `has_role`. |
| BL-005 | `useBookingFormSubmit.ts:30` ya valida `if (!from \|\| !to) return`. |
| BL-007 | `useInvoiceLineItemHandlers.ts:18` ya recomputa `total` en cambio. |
| DI-006 | `invoice_bookings_pkey` cubre `(invoice_id, booking_id)`. |

---

## Sprint 1 — Críticos de seguridad y CFDI (v7.73.0)

1. **SEC-005** — Revocar `SELECT` de `v_invoices_with_balance` a `authenticated`; mover consumo a RPC `SECURITY DEFINER` que filtre por rol (admin/administrativo/ventas ven todo, customers filtran por `customer_id`). Actualizar `useInvoicesWithBalance`.
2. **SEC-002** — Añadir políticas `INSERT` a `status_logs` para `dispatcher` y `mechanic`; añadir `.select("id")` + `assertRowsAffected` en `useAssignForklift.ts`, `useUnassignForklift.ts`, `useForkliftMutations.ts`.
3. **SEC-004** — Revocar `EXECUTE ON e2e_seed_scenario` de `authenticated`; conceder solo a `service_role`. Actualizar helper E2E si aplica.
4. **DI-003** — Reescribir `assign_stamped_invoice_number` y `assign_stamped_rep_number` con `INSERT/UPDATE ... ON CONFLICT` o `EXCEPTION WHEN unique_violation THEN` con reintento del siguiente número.
5. **DI-001** — Migración: `ALTER TABLE payments ADD CONSTRAINT payments_invoice_installment_uq UNIQUE (invoice_id, installment_number) DEFERRABLE INITIALLY IMMEDIATE` (validar backfill primero).
6. **BL-004** — `stamp-payment-complement/index.ts`: leer `invoice.tax_rate` (default 0.16 si null) y usarlo en el breakdown REP.

## Sprint 2 — Race conditions y money math (v7.74.0)

7. **DI-004** — `create_booking` RPC: `SELECT ... FROM forklifts WHERE id = p_forklift_id FOR UPDATE` antes de validar `status='available'`.
8. **DI-002** — `generate-recurring-invoices`: envolver `executePlan` en RPC con `pg_advisory_xact_lock(hashtext('recurring.'||customer_id||'.'||period))` antes del check `existingLink`.
9. **BL-009** — `generate-recurring-maintenance`: atomic claim `UPDATE maintenance_policies SET last_generated_month = ? WHERE id = ? AND (last_generated_month IS NULL OR last_generated_month < ?) RETURNING id` y saltar policies sin filas afectadas.
10. **BL-001** — `useCreditNoteForm.ts`: reemplazar `Number` math por `lineItemTotal` / `computeTotals` / `roundMoney` de `src/lib/domain/invoiceTotals.ts`.
11. **BL-002** — Nuevo RPC `record_payment(p_invoice_id, p_amount, ...)` que valida `SUM(payments.amount) + p_amount <= invoice.total` en la misma transacción. `useRecordPaymentForm.ts` invoca el RPC. Añadir `CHECK (amount > 0)` en `payments`.
12. **BL-003** — `generate-recurring-invoices`: reemplazar `Math.round(x*100)/100` con helper compartido (puerto de `currency.js` a Deno en `supabase/functions/_shared/money.ts`).

## Sprint 3 — Consistencia y auth (v7.75.0)

13. **DI-005** — Trigger `AFTER INSERT OR UPDATE OR DELETE ON payments` que recalcula `invoices.status` (`paid`/`partial`/`sent`) atómicamente. Eliminar el sync client-side de `usePayments.ts`.
14. **DI-007** — Extender `soft_delete_customer`/`_supplier` para (a) rechazar si hay dependencias activas, o (b) marcar `deleted_at` en children de tablas hijas relevantes. Añadir filtros `deleted_at IS NULL` faltantes en `useBookings`, `useContracts`.
15. **AUTH-001** — `invite-user`: pre-check `auth.users` por email antes de `createUser`, devolver 409 con mensaje claro.
16. **AUTH-002** — `refresh-cancellation-status/handler.ts`: si en el futuro hay multitenancy, verificar `company_id` del invoice contra el del caller. Por ahora: añadir log + comentario `TODO tenant` y verificar rol == admin/administrativo (ya lo hace).
17. **AUTH-003** — Alinear `AdminRouteGuard` sobre "Crear Reserva Directa" con la RPC: o (a) remover el guard (dispatcher/ventas ya pueden crear con cotización), o (b) apretar la RPC. Decisión recomendada: **remover guard** y mantener regla "no admin ⇒ requiere `p_quote_id`" en RPC.
18. **BL-006** — `useMaintenanceKanban.ts`: añadir `onSuccess` que reconcilia cache con la respuesta del servidor.
19. **BL-008** — `useGenerateRecurringInvoices.ts`: leer `result.failed[]` y `result.error`, pasar a `notifyError` con detalles por booking.

## Sprint 4 — Performance (v7.76.0)

20. **PERF-002** — `CREATE INDEX idx_payments_invoice_date ON payments(invoice_id, payment_date DESC)`.
21. **PERF-003** — `useSyncInvoiceBookings` (`useInvoiceBookings.ts:60`): añadir `.select("id")` y `assertRowsAffected`.
22. **PERF-001** — Paginación server-side: nuevo RPC `list_invoices_with_balance(p_limit, p_cursor, p_filters)` + refactor `useInvoices`/`useInvoicesWithBalance` a `useInfiniteQuery` con cursor `(issued_at, id)`. Este es el ítem más grande — se puede diferir a sprint aparte si conviene.

---

## Detalles técnicos clave

- **Migraciones**: cada sprint = una migración numerada; incluir `GRANT` explícito en tablas nuevas si aplica y `SET search_path = public` en funciones nuevas.
- **RPCs nuevos**: `record_payment`, `list_invoices_with_balance` — ambos `SECURITY DEFINER` con `has_role` checks al inicio.
- **Tests**: agregar Vitest para `record_payment` (over-payment), `create_booking` (concurrencia via `pg_backend_pid()` simulado), stamping race (con reintento).
- **Rollout**: cada Sprint bumpea versión en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json` (regla del proyecto).
- **Backward-compat**: el trigger de `payments` (DI-005) debe hacer un backfill inicial para no dejar invoices con status desactualizado.

## Fuera de alcance

- Reestructuración multitenant real (AUTH-002 completo).
- Reescritura completa de tabla `payments` con `numeric(14,2)` si ya no lo es (validar en Sprint 1 y añadir sólo si aplica).

## Entregable por sprint

Cada sprint: migración SQL, cambios de código frontend/edge, tests, entrada en changelog, verificación en preview con Playwright de las rutas afectadas.
