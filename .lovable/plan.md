# Plan: Fase 1 restante Auditoría de Tests

Cerrar los 6 pendientes del top-10 + T4 (RLS reales) + T5 (E2E fiscales). Todo en una entrega v7.222.0.

## Alcance

### A. Tests unitarios de regresión (top-10 pendientes)

1. **#2 `work_status` no revierte al cerrar OT** — `src/features/maintenance/hooks/__tests__/workStatus.regression.test.tsx`
   - Mock del RPC `close_work_order`; verificar `work_status='closed'` persiste tras invalidación.

2. **#6 Claim atómico stamp-cfdi (mock con filtros)** — endurecer `src/test/helpers/supabaseChain.ts`
   - Añadir un modo `strictFilters: true` que evalúe `.eq()/.in()/.is()` contra un dataset in-memory; sin él, 2ª llamada concurrente en tests actuales devuelve success falso.
   - Nuevo test `supabase/functions/stamp-cfdi/handler_test.ts` (extender) para claim UPDATE ... WHERE stamping_status='pending' → 2ª llamada 0 rows, no invoca PAC.

3. **#8 EC-A2 timeout deja `stamping`** — `supabase/functions/stamp-cfdi/handler_test.ts`
   - Simular `AbortError` del PAC; assert que factura NO pasa a `error`, queda `stamping` con `stamping_attempts++`.

4. **#9 Cancelación motivo 01 sin substitution_uuid bloqueada en cliente** — `src/features/invoices/lib/__tests__/cancelReasonValidation.test.ts`
   - Validar Zod schema del formulario de cancelación: motivo `01` sin `substitution_uuid` → error antes de llamar edge.

5. **#10 Cambio de rol revoca acceso** — `src/features/users/__tests__/roleRevocation.test.tsx`
   - Mutación `updateUserRole` invalida `user_roles`, `role_permissions`; siguiente query de Facturas con rol demoted (administrativo→dispatcher) devuelve 403 y UI muestra guard.

### B. T4 · RLS reales (reemplazar mocks por policy evaluation)

Los `*.rls.test.ts` actuales son mockeados. Sin `supabase start` en CI (Fase 2), la aproximación pragmática:

6. **Tests de policy via SQL** — nuevo directorio `supabase/tests/rls/` con archivos `.sql` ejecutables por `supabase db test` o vía `supabase--read_query` como smoke:
   - `customer_payment_intents_portal.sql`: SET ROLE authenticated + set_config('request.jwt.claims') → INSERT ajeno bloqueado.
   - `quotes_portal.sql`: SELECT de cotización de otro cliente devuelve 0.
   - `supplier_payments.sql`, `user_roles.sql`, `parts_inventory.sql`, `return_inspections.sql`, `damage_records.sql`.
   - Añadir job `rls-policies` en `ci.yml` que corre `psql` contra los archivos (requiere `SUPABASE_DB_URL` como secret; si no está disponible, skipear con warning y dejar los `.sql` para Fase 2).

### C. T5 · E2E fiscales (Playwright)

Sin cubrir hoy: timbrado, cancelación, REP, NC, multi-moneda, extensión, devolución, portal, CxP.

7. **`tests/e2e/fiscal-stamp.spec.ts`** — flujo BORRADOR → Timbrar → assert FAC-XXXX + `stamping_status='stamped'`.
8. **`tests/e2e/fiscal-cancel.spec.ts`** — factura timbrada → cancelar motivo 02 → assert `cancel_status='pending'`.
9. **`tests/e2e/fiscal-rep.spec.ts`** — factura PPD → registrar pago → generar REP → assert complement generado.
10. **`tests/e2e/fiscal-credit-note.spec.ts`** — NC parcial → assert saldo actualizado en `v_invoices_with_balance`.
11. **`tests/e2e/portal-statement.spec.ts`** — login portal cliente E2E → assert balance MXN + USD convertido.
12. **`tests/e2e/accounts-payable.spec.ts`** — crear supplier_bill → aprobar → pagar → REP CxP.
13. **`tests/e2e/return-inspection.spec.ts`** — devolución con daño → cierra reserva + genera cargo.
14. **Smoke-nav**: agregar `/cuentas-por-pagar`, `/rep`, `/notas-de-credito`.
15. **`data-testid`** en los 5 flujos de dinero: `stamp-invoice-btn`, `cancel-invoice-btn`, `register-payment-btn`, `generate-rep-btn`, `create-credit-note-btn` — reemplazar `getByText` frágiles en los specs nuevos.

### D. Fixtures y helpers

16. **`tests/e2e/fixtures/fiscalSeed.ts`** — extender el RPC seed E2E existente con `is_e2e` para crear facturas PPD/PUE, PDF placeholder, mock PAC en modo test.
17. **`tests/e2e/fixtures/portalAuth.ts`** — helper de login del portal cliente.
18. Quitar skips silenciosos en `filters-quotes.spec.ts:23` y `roles-matrix.spec.ts:64` (convertir a fixture proper o fail explícito).

## Fuera de alcance (Fase 2)

- `supabase start` en CI (service container).
- Reemplazar las 4 réplicas TS (`portalBalance`, `mrrParity`, `auditImmutability`, `supplierRepTrigger`) con tests de integración reales.
- Factories tipadas globales (`buildInvoice()`).
- `fast-check` property-based.
- Ratchet global de coverage 13→40.
- Stryker mutation testing.

## Riesgos

- **Mock strictFilters** puede romper tests existentes que dependen del comportamiento permisivo. Mitigación: opt-in (`chain({ strictFilters: true })`), migrar progresivo.
- **RLS SQL job en CI** necesita `SUPABASE_DB_URL` de un proyecto shadow. Si el user no lo provee, dejamos los `.sql` versionados y el job en `continue-on-error: true` hasta Fase 2.
- **E2E fiscales** requieren PAC en modo test/mock. Reutilizar `facturapiMock` del harness Vitest en Playwright via MSW o interceptar `functions.invoke('stamp-cfdi')` con feature flag `E2E_MOCK_PAC=1`.

## Entregable

- ~15 archivos nuevos, 3 modificados (`supabaseChain.ts`, `ci.yml`, `smoke-nav.spec.ts`).
- v7.222.0 con changelog detallado.
- Validación: `bun run test`, `bun run test:e2e` (subset fiscal), `deno test` sobre `stamp-cfdi/handler_test.ts`.
