# Auditoría de Tests — LiftGo (Cerrada)

Plan ejecutado en 4 fases. Las 4 fases están completas o explícitamente acotadas. Ver `public/changelog/v6.66.19.json` (Fase 1) y `public/changelog/v6.67.0.json` (Fases 2-4).

## Estado final

| Fase | Estado | Entregables |
|---|---|---|
| Fase 1 — Bugs activos | ✅ Completa | 3 bugs cerrados (idempotencia stamp-cfdi, auth check generate-recurring-invoices, teardown E2E). Tipos compartidos en `_shared/types.ts`. |
| Fase 2 — CFDI / dinero | ✅ Completa | Handlers puros: `cancel-cfdi`, `refresh-cancellation-status`. 19 handler_tests Deno nuevos. 4 suites Vitest CFDI. |
| Fase 3 — Mutaciones y RLS | ✅ Completa | 4 suites de mutaciones (booking, extension, assign forklift, payment batch). 5 RLS nuevas + fix useInvoices.rls. |
| Fase 4 — E2E y robustez | ⚠️ Parcial | Helper `getAuthToken`/`expectNoToastError` extraído. Specs E2E nuevos quedan pendientes (requieren scaffolding de seed específico por dominio). |

## Métricas

| Métrica | Antes | Después |
|---|---|---|
| Vitest archivos | 100 | 123 |
| Vitest tests | ~684 | 707 |
| Deno handler_test reales | 3 | 5 (stamp-cfdi, cancel-cfdi, refresh-cancellation-status, stamp-credit-note, _shared mocks) |
| Deno tests totales | ~35 | 54 |
| Bugs activos | 3 | 0 |

## Fase 4 — Trabajo restante (no bloqueante)

Specs E2E nuevos que requieren seed extendido y `data-testid` en componentes — recomendamos abordarlos por separado, dominio por dominio:

1. `maintenance-kanban.spec.ts` ✅ v6.67.2 — seed extendido con `maintenance_log_id`, columnas Kanban con `data-testid`, smoke spec creado.
2. `delivery-return-horometro.spec.ts`
3. `cfdi-cancel-credit-note.spec.ts`
4. `recurring-billing.spec.ts` (cron trigger)
5. `rbac-role-paths.spec.ts`
6. `contract-pdf-sign.spec.ts`
7. `damage-photo-billing.spec.ts`
8. `crm-deal-to-quote.spec.ts`

El helper `getAuthToken(page)` desbloquea la llamada de Edge Functions desde estos specs.

## Anti-patrones resueltos

- `fromResolver` genérico en `useInvoices.rls.test.ts` → `tableResolvers` (consistente con `useBookings.rls.test.ts`).
- `SupabaseLike`/`QueryBuilderLike` desacoplados en `_shared/types.ts`.
- Helper `getAuthToken` duplicado en 2+ specs → centralizado en `tests/e2e/fixtures/helpers.ts`.

## Anti-patrones pendientes (Fase 4 ampliada, no urgente)

- `data-testid` en componentes E2E críticos: ✅ aplicado a `RecordPaymentDialog` y `CustomerFormDialog` en v6.67.1. Restantes: `BookingFormDialog`, `QuoteFormDialog`, dialogs de mantenimiento/contratos.
- Aserciones de red mínimas (`waitForResponse`): ✅ aplicado a `invoice-payment.spec.ts` en v6.67.1. Restantes: `booking-to-invoice`, `quote-to-booking`, `customer-create`, `portal`.
- `PERMS` hardcodeado en E2E vs DB `role_permissions` — requiere fixture que lea la tabla en runtime.
- Smoke PDFs con `innerHTML.length > 0` (trivial) — falta aserción semántica (parsear PDF y verificar texto clave).
