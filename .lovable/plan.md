# Auditoría de Tests — LiftGo

Tres sub-agentes auditaron en paralelo las suites: Vitest (100 archivos), Deno Edge Functions (20 funciones), Playwright E2E (8 specs).

## Veredicto global

| Suite | Archivos | Calidad | Cobertura crítica |
|---|---|---|---|
| Vitest | 100 | Buena en helpers; débil en hooks CFDI y mutaciones | ~60% |
| Deno Edge | 20 funciones | **3** con handler_test real; **16** solo CORS+401; **2** sin nada | ~25% |
| Playwright | 8 specs (~35 tests) | Infra de seed sólida; cobertura funcional escasa | ~15% |

## Bugs activos descubiertos por la auditoría

1. **`stamp-cfdi` sin guard de idempotencia** (`handler.ts:103-160`). Doble llamada genera dos CFDIs en SAT con UUIDs distintos. `stamp-credit-note` sí lo tiene (409).
2. **`generate-recurring-invoices` auth check inconsistente** (`index.ts:78`): usa `!authHeader` en lugar de `!authHeader?.startsWith("Bearer ")`. Permite header malformado.
3. **Teardown E2E silenciado en shards no-finales** (`seed.ts:112` + `playwright.config.ts:33-37`): si `e2e_teardown` falla en shard intermedio, datos quedan en BD demo (globalTeardown solo corre en shard final).

## Anti-patrones transversales

- **Selectores E2E por texto en español** sin ningún `data-testid` — frágiles ante cambios de copy.
- **`fromResolver` genérico** en `useInvoices.rls.test.ts:12` enmascara joins (vs `tableResolvers` correcto en `useBookings.rls.test.ts`).
- **`as unknown as Parameters<>`** en `invoiceFlow`/`bookingFlow` desactiva type-checking.
- **`.catch(() => {})`** en `useContracts.test.ts:92` y `waitForLoadState("networkidle").catch(...)` en E2E silencian errores reales.
- **`PERMS` hardcodeado** desconectado de `role_permissions` en DB → falsa seguridad.
- **Smoke PDFs aserten `innerHTML.length > 0`** (`documents.smoke.test.tsx:48`) — nunca fallarían.
- **16 Edge Functions con tests "solo CORS+401"** sin validar lógica real.
- **Sin aserciones de red en Playwright** — un optimistic update roto pasa el test aunque el backend falle.

---

## Plan por fases

### Fase 1 — Bugs activos (1-2 días, máximo riesgo)

| # | Tarea | Archivo |
|---|---|---|
| 1.1 | Guard de idempotencia en `stamp-cfdi` + test 409 | `supabase/functions/stamp-cfdi/handler.ts` + `handler_test.ts` |
| 1.2 | Corregir auth check en `generate-recurring-invoices` (`startsWith("Bearer ")`) + test 401 | `supabase/functions/generate-recurring-invoices/index.ts` + `index_test.ts` |
| 1.3 | Diferenciar teardown E2E: si test pasó, relanzar error; si falló, log | `tests/e2e/fixtures/seed.ts:112` y `portalSeed.ts:104` |
| 1.4 | Mover `SupabaseLike`/`QueryBuilderLike` de `stamp-cfdi/handler.ts` a `_shared/types.ts` | refactor |

### Fase 2 — CFDI / dinero (3-4 días)

Hooks Vitest críticos sin cobertura:
- `useStampCfdi.test.ts` — happy path, factura mal formada, Facturapi 429, doble click
- `useCancelCfdi.test.ts` — SAT 01/02, factura ya pagada, RLS denied
- `usePaymentComplement.test.ts` — PPD timbrado, monto ≠ saldo, error → no marca complemented
- `useRefreshCancellationStatus.test.ts` — polling SAT
- Extender `syncInvoiceStatus.test.ts` — overpayment, factura cancelada no se reactiva

Edge Functions Deno (handler_test con mocks reales):
- `cancel-cfdi/handler_test.ts`
- `stamp-payment-complement/handler_test.ts`
- `cancel-credit-note/handler_test.ts`
- `download-cfdi/handler_test.ts` (función con 3 branches y 0 tests)
- `refresh-cancellation-status/handler_test.ts` (0 tests hoy)

### Fase 3 — Mutaciones de negocio y RLS (2-3 días)

Vitest:
- `useBookingMutations.test.ts` — confirmar/completar/cancelar, transiciones inválidas, RLS
- `useBookingExtensions.test.ts` — extensión válida, fecha < end_date, cancelled
- `useAssignForklift.test.ts` + `useQuoteAssignments.test.ts` — `quote_assigned_forklifts` (0 tests hoy)
- `useCreatePaymentBatch.test.ts` — CXP masivo, CLABE inválida
- RLS faltantes: `payments.rls.test.ts`, `contracts.rls.test.ts`, `quote_assigned_forklifts.rls.test.ts`, `credit_notes.rls.test.ts`, `audit_logs.rls.test.ts`
- Corregir `useInvoices.rls.test.ts` → cambiar `fromResolver` a `tableResolvers`

Edge Functions:
- `generate-recurring-invoices/handler_test.ts` — boundary timezone Monterrey, `next_invoice_number` mock
- `delete-user/handler_test.ts` — self-delete bloqueado, no admin → no puede borrar admin
- `invite-user`/`invite-customer` handler_test — email inválido, duplicado

### Fase 4 — E2E críticos y robustez (3-4 días)

Specs nuevos prioritarios:
1. `maintenance-kanban.spec.ts` — crear OT, drag de estado, recurrente
2. `delivery-return-horometro.spec.ts` — horómetro inicial/final → horas en factura
3. `cfdi-cancel-credit-note.spec.ts` — cancelar CFDI → NC generada
4. `recurring-billing.spec.ts` — trigger Edge → N facturas creadas
5. `rbac-role-paths.spec.ts` — ventas/despachador/mecánico: paths permitidos y bloqueados
6. `contract-pdf-sign.spec.ts` — generar PDF + flujo de firma
7. `damage-photo-billing.spec.ts` — foto + cargo en factura
8. `crm-deal-to-quote.spec.ts` — deal won → cotización auto

Mejoras transversales:
- Añadir `data-testid` en 5 componentes más usados en E2E (`PaymentDialog`, `CustomerFormDialog`, `QuoteFormDialog`, `BookingFormDialog`, `InvoiceFormDialog`).
- Extender `smoke-nav.spec.ts`: rutas `/portal/invoices`, `/portal/contracts`, detalles `/fleet/:id`, `/customers/:id`, `/maintenance/:id`, `/contracts/:id`; assertion adicional `not.toHaveURL(/\/login/)` y verificación de toast de error ausente.
- Mobile coverage: añadir `/maintenance`, `/quotes`, `/crm` + viewport tablet 768×1024.
- Crear helper `getAuthToken(page)` en `tests/e2e/fixtures/helpers.ts` (duplicado en 3 archivos hoy).
- Aserciones de red mínimas en `invoice-payment.spec.ts` y `customer-create.spec.ts` (`waitForResponse` del POST).

---

## Detalles técnicos

**Helpers a crear/extender:**
- `src/test/helpers/supabaseChain.ts` — añadir helper para mockear errores 42501 con HINT.
- `supabase/functions/_shared/test/openaiMock.ts` — para `classify-feedback-report`.
- `tests/e2e/fixtures/helpers.ts` — `getAuthToken(page)` y `expectNoToastError(page)`.

**Métricas de éxito de la auditoría completa:**
- Edge Functions con `handler_test.ts`: 3 → 12+
- Hooks CFDI con tests: 0 → 4
- Specs E2E: 8 → 16+
- Bugs activos descubiertos cerrados: 3/3
- Anti-patrones críticos resueltos: `fromResolver` genérico, `.catch(() => {})`, casts `as unknown`, smoke PDFs triviales

---

## Recomendación

Sugiero empezar por **Fase 1** (bugs activos, 1-2 días) y luego **Fase 2** (CFDI/dinero, 3-4 días). Las Fases 3 y 4 pueden paralelizarse si se quiere.

¿Apruebo el plan y arranco por la Fase 1, o prefieres que cubra primero alguna área específica (CFDI, RBAC, E2E)?
