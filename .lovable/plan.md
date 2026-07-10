# Auditoría DRY · Estimado consolidado

4 subagentes recorrieron en paralelo edge functions, hooks, componentes UI y `src/lib`. Estimado total: **~1,380 LOC eliminables** sin cambios funcionales, aplicando helpers canónicos ya existentes.

## Resumen ejecutivo

| Área | LOC eliminables | Helpers canónicos disponibles | Nuevos helpers a crear |
| --- | --- | --- | --- |
| Edge Functions | **~615** | `getAdminClient`, `getCallerClient`, `jsonResponse`, `jsonError`, `corsHeaders` | `requireRole(req, roles)`, `getFacturapiConfig()`, `_shared/cfdi.ts` |
| Hooks / Mutations | **~480** | `useEntityMutation`, `createEntityKeys`, `notifyError/Success` | — |
| Componentes UI | **~190** | `ReportChartCard`, `DetailRow`, `DataTableV2`, `FormDialog`, field wrappers | `useDialogs` (multi-dialog state) |
| Utils / Schemas / Rules | **~95** | `callRpc`, `computeTotals`, `LineItem`, `formatCurrency`, `coerce`, `schemas/common` | `rfcPublicoGeneral`, `addressSchema`, `notesSchema`, `phoneSchema` |
| **TOTAL** | **~1,380 LOC** | | |

## Lote 1 — Edge Functions (~615 LOC, mayor ROI)

Aunque el Lote 9 anterior migró clients y responses en varias funciones, quedan **17 funciones** con auth manual y **72 instancias** de `new Response(JSON.stringify(...))`. Además hay boilerplate de Facturapi y parsers XML duplicados.

Acciones:
1. Crear `_shared/auth.ts::requireRole(req, roles[])` que unifique `getCallerClient` + `getClaims` + `has_role` + respuesta 401/403.
2. Crear `_shared/facturapi.ts::getFacturapiConfig(admin)` que lea `company_settings.facturapi_mode` + `billing_secrets` y devuelva `{ mode, apiKey }`.
3. Centralizar parsers XML CFDI en `_shared/cfdi.ts` (hoy `validate-supplier-rep` reimplementa lo que ya existe en `parse-cfdi-expense/cfdi-parser.ts`).
4. Reemplazar los 72 `new Response(JSON.stringify(...))` restantes por `jsonResponse`/`jsonError`.

Top 5 archivos: `validate-supplier-rep` (65), `stamp-cfdi` (45), `stamp-credit-note` (45), `cancel-cfdi` (45), `cancel-credit-note` (40).

## Lote 2 — Hooks y Mutations (~480 LOC)

Quedan ~40 hooks con `useMutation` crudo (onSuccess/onError manuales) que deberían usar `useEntityMutation`, más algunas query keys como arrays literales.

Top 10 archivos:
- `useSupplierBillMutations.ts` (32), `useForkliftMutations.ts` (28), `useBankLineActions.ts` (24)
- `useSuppliers.ts` (22), `useAuditLogs.ts` (18), `useInvoices.ts` (15)
- `useCashFlowSettings.ts` (15), `useInviteUser.ts` (12), `useBookings.ts` (12)
- `useCreatePaymentIntent.ts` (10)

Nota: `useForkliftMutations` tiene optimistic updates (`setQueryData`) — requiere extender `useEntityMutation` con opción `optimistic` o dejar fuera del alcance.

## Lote 3 — Componentes UI (~190 LOC)

Duplicaciones detectadas:
- **Reports charts** (RevenueReport, MaintenanceCostReport, UtilizationReport, CashFlowChart): ~55 LOC migrando a `ReportChartCard`.
- **AuditDiffTables**: 40 LOC migrando a `DataTableV2`.
- **SupplierBillDetailSheet**: 30 LOC (extraer `Row` local a `DetailRow` + hook `useDialogs` para 4 diálogos).
- **ContractDetail / ContractDetailsCard**: 30 LOC con `DetailRow` en lugar de Cards manuales.
- **RegisterSupplierPaymentDialog**: 8 LOC con `FileField` wrapper.

## Lote 4 — Utils, Schemas, Rules (~95 LOC)

- Migrar ~15 hooks de `supabase.rpc(...)` directo a `callRpc<T>()` (~30 LOC).
- Redefiniciones de `LineItem` y cálculo de totales en `PortalInvoiceDetail`/`PortalQuoteDetail` → usar `src/lib/domain/invoiceTotals.ts` (~13 LOC).
- Refactor de RFC público y schemas comunes (address, notes, phone) en `src/lib/schemas/common.ts` (~22 LOC).
- Coerción numérica manual en editores de líneas → `src/lib/coerce.ts` (~12 LOC).
- IVA hardcodeado (`* 1.16`) en `RecurringInvoicesPreviewDialog` → helper `money()` (~2 LOC).

## Orden sugerido

1. **Lote 1 (Edge Functions)** — mayor ROI, riesgo aislado por función, tests unitarios ya cubren cada handler.
2. **Lote 2 (Hooks)** — barrido mecánico, patrón ya validado en Lotes 7-8 anteriores.
3. **Lote 4 (Utils/Schemas)** — desbloquea Lote 3 al centralizar `LineItem` y schemas.
4. **Lote 3 (UI)** — el más visible; se hace al final tras estabilizar helpers.

## Criterios de éxito

- Reducción neta ≥ 1,200 LOC (dejando margen para helpers nuevos que suman ~100 LOC).
- 0 regresiones: `bunx vitest run` verde tras cada lote.
- 0 cambios funcionales: mismos endpoints, misma UI, mismas RLS.
- Changelog por lote (`v6.141.0` … `v6.144.0`).

## Fuera de alcance

- `useForkliftMutations` (optimistic updates especiales) salvo que se extienda `useEntityMutation`.
- `useCreateSupplier`/`useUpdateSupplier` (translateSupplierError propio).
- Duplicaciones cosméticas o de <5 LOC por archivo.

## Confirmación requerida

¿Ejecutamos los 4 lotes en secuencia (Lote 1 → 2 → 4 → 3) o prefieres empezar solo por el Lote 1 (Edge Functions, mayor ahorro) y evaluar antes de continuar?
