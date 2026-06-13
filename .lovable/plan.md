# Auditoría de Tests — LiftGo

Tres auditorías paralelas (Vitest, Playwright E2E, Deno Edge Functions). Resumen ejecutivo y plan accionable.

---

## Estado actual

| Suite | Archivos | Cobertura real | Riesgo principal |
|---|---|---|---|
| **Vitest** | 87 (~1180 casos) | lines 13 / branches 12 / funcs 9 — umbrales irrealmente bajos | Cero tests en hooks que mueven dinero (credit notes, recurring billing, accounts-payable, audit revert) |
| **Playwright** | 8 specs | ~12% del surface | Specs son mayormente *lectura* sobre datos sembrados, no transiciones reales desde la UI. Cero tests de permisos por rol |
| **Deno Edge** | 17 funciones | 4 con test real, 6 smoke-only, 7 sin test | `stamp-payment-complement`, `cancel-credit-note`, `refresh-cancellation-status`, `generate-recurring-*` sin lógica probada |

---

## Hallazgos críticos (bugs latentes en la suite)

1. **`portalSeed.ts:41`** — `loadConfig()` ejecutado al importar; si falta `E2E_PORTAL_EMAIL` aborta toda la suite Playwright (incluso specs que no usan el fixture).
2. **`playwright.config.ts:33`** — Lógica `SHARD_INDEX === SHARD_TOTAL` sin guard: si `SHARD_TOTAL` no está definida en CI, cada shard ejecuta `purge_e2e_data` y borra datos de shards hermanos activos.
3. **`smoke-nav.spec.ts`** — Solo verifica `domcontentloaded` + ausencia de "404"; una página completamente en blanco pasa los 31 tests.
4. **`global.setup.ts:26`** — `networkidle.catch(() => {})` silencia timeouts reales de login.
5. **`src/test/invoiceHelpers.test.ts`** — Duplicado obsoleto en inglés; testea wrapper legacy que ya está cubierto por `rentalCalculation.test.ts`.

---

## Roadmap por Lotes

### Lote 1 — Estabilización (1-2 días, sin tests nuevos)

**Vitest**
- Eliminar `src/test/invoiceHelpers.test.ts` (duplicado).
- Endurecer mocks frágiles: `useRecordPaymentForm.test.ts` (interfaz incompleta del hook), `useBookings.rls.test.ts` (migrar a `tableResolvers`), `syncInvoiceStatus.test.ts` (mover state a closures locales).
- Wrapper `useFakeTimeMty(iso)` en `src/test/helpers/time.ts` para tests de fechas (`cashFlowUtils`, `rentalCalculation`).

**Playwright**
- Mover `loadConfig()` dentro del fixture `portalSeed` con `test.skip` si faltan vars.
- Guard de `SHARD_TOTAL` en `playwright.config.ts`.
- `smoke-nav.spec.ts`: añadir aserción de landmark visible (`nav`, `heading`, `main`) por ruta.
- Reemplazar `.last()`/`.first()` por selectores con `data-testid` o nombres exactos en `customer-create.spec.ts`, `invoice-payment.spec.ts`.
- `global.setup.ts`: cambiar `networkidle.catch` por `waitForURL` con timeout explícito.

**Deno**
- Extender `supabaseClientMock.ts`: añadir `rpc()`, `insert()` con captura de payload, soporte `.in()` / `.match()` / `.delete()`, multi-llamada por tabla.

### Lote 2 — Tests críticos de dinero/CFDI (3-5 días)

**Vitest (top 5)**
1. `useCreditNoteMutations` — happy path + rollback si falla timbrado.
2. `useGenerateRecurringInvoices` — respuesta vacía, error de red, conteo correcto.
3. `useAuditLogs.revertAuditLog` — RPC OK/fail.
4. `useBillApprovalMutations` — transiciones approve/reject.
5. `useCreditNoteForm` — borde `maxCreditable ± 0.01`.

**Playwright (top 2)**
6. `rbac-permissions.spec.ts` — fixture `roleSeed` + 4 tests (Ventas no Closed Won, Auditor read-only, Portal aislado, Admin todo).
7. `invoice-partial-payment.spec.ts` — pago parcial → saldo → segundo pago → `paid` con verificación numérica.

**Deno (top 3)**
8. `generate-recurring-invoices` — lógica de no-duplicación + cálculo de fechas.
9. `cancel-cfdi` — migrar de smoke a unit con `handler` (motivo `02`, update DB).
10. `refresh-cancellation-status` — mock Facturapi para `accepted`/`rejected`/`pending`.

### Lote 3 — Ciclo de vida de negocio (1 semana)

**Playwright**
- `crm-deal-won.spec.ts` (kanban → cotización)
- `contract-lifecycle.spec.ts` (anexos + estados)
- `delivery-return-flow.spec.ts` (ENT- → DEV-, estado forklift)
- `maintenance-kanban.spec.ts` (drag + transiciones)

**Vitest**
- `useMrrDetail` (source of truth del dashboard)
- `useAccountsPayableKpis` + `useAgingReport` (buckets)
- `rentalCalculation` casos bisiestos (feb 2024)
- `computeTotals` con descuento fijo + IVA (redondeo)

**Deno**
- `stamp-payment-complement` (REP)
- `cancel-credit-note`
- `generate-recurring-maintenance`

### Lote 4 — Cobertura avanzada (continuo)

**Playwright**
- `damage-tracking.spec.ts`, `recurring-billing.spec.ts`, `bank-reconciliation.spec.ts`, `audit-revert.spec.ts`, `quote-multi-equipment.spec.ts`, `portal-full-flow.spec.ts`
- Mobile viewport (`devices["iPhone 14"]`) para specs Lote 2-3 (foco `MobileCardList`)
- Casos negativos (RFC inválido, fechas pasadas, montos negativos)

**Vitest**
- Schemas Zod CFDI 4.0 (RFC física/moral, CP con cero inicial)
- `useSupplierBillMutations`, `csvParsers` malformados, `deliveryDetailHelpers` parcial

**Deno**
- `generate-invoice-pdf`, `invite-user` (verificar `user_roles`), `classify-feedback-report`

---

## Mejoras estructurales

### Fixtures de test (Vitest)
Crear `src/test/fixtures/{invoice,customer,booking,payment}Fixture.ts` con `makeX(over?)` — elimina ~40% del boilerplate.

### Helper `renderWithProviders()` 
Centralizar `QueryClient + BrowserRouter` que hoy se duplica en tests de página.

### `e2e_seed_scenario` (Playwright)
- Descomponer en RPCs composables (`e2e_seed_customer`, `_quote`, `_contract`, `_maintenance`).
- Aceptar `p_options jsonb` para override de estados (factura vencida, pago parcial pre-sembrado).
- Devolver `jsonb` libre + cast tipado por spec.
- Auditoría dinámica del teardown vs `information_schema.columns WHERE column_name='is_e2e'`.
- Usar `SERVICE_ROLE_KEY` en CI para evitar logins admin concurrentes en `portalSeed`.

### Umbrales de cobertura escalonados

| Lote | lines | branches | funcs | statements |
|---|---|---|---|---|
| Actual | 13 | 12 | 9 | 13 |
| Tras Lote 2 | 18 | 15 | 13 | 18 |
| Tras Lote 3 | 24 | 20 | 18 | 24 |
| Tras Lote 4 | 30 | 26 | 23 | 30 |
| Objetivo 6m | 50 | 45 | 40 | 50 |

**Regla especial**: features que tocan dinero (`invoices`, `accounts-payable`, `payments`) deben llegar a **≥80% branches** independientemente del promedio.

---

## Recomendación

Aprobar **Lote 1 (estabilización)** primero — corrige 5 bugs latentes en la propia suite que pueden enmascarar regresiones reales en producción. Luego Lote 2 para cerrar la brecha de tests en código que mueve dinero. Lotes 3-4 según ciclos de release.
