# Auditoría arquitectónica — Fase 2 (post v6.39.0)

Síntesis de 3 subagentes (tamaño/complejidad, SoC, estructura/naming). El código ya está sano (Lotes 1–8 entregados); estas son las brechas restantes. Cada lote es independiente, con changelog propio y validación `tsc --noEmit` + `bunx vitest run`.

## Hallazgos clave

- **Estructura plana sobrecargada**: `src/features/` tiene 591 archivos sin agrupación; `src/lib/` mezcla genérico con dominio.
- **Hooks "god"**: `useInvoiceFormLogic` toca 6 entidades; `usePaymentIntents` (127 LOC), `useBankReconciliationMutations` (125), `usePayments` (123), `useForkliftMutations` (123), `useCreditNotes` (121) violan el límite Power-of-10 de 80 LOC.
- **Acoplamiento data↔presentación**: 3 archivos PDF importan `supabase` + `@react-pdf`.
- **Duplicación sistemática**: boilerplate de TanStack Query, celdas de tabla con `formatCurrency`, mapas de status inline.
- **Naming inconsistente**: kebab/camel/Pascal mezclados a nivel archivo y carpeta.
- **Misplaced**: `src/lib/lineItems.ts`, `src/features/quotes/utils/`, `src/features/quotes/constants.ts`, `src/lib/rpc.ts`.

## Lotes (crítico → opcional)

### Lote 11 — Romper hooks "god" de mutaciones (v6.39.1 · patch) — CRÍTICO
- `useBankReconciliationMutations` (125 LOC) → un archivo por mutación (`useMatchTransaction`, `useUnmatchTransaction`, `useIgnoreTransaction`, …) + barrel.
- `usePayments` (123) → separar CRUD (`usePaymentMutations`) de sincronización de status de factura (`useSyncInvoiceStatus`).
- `useForkliftMutations` (123) → dividir por verbo (create/update/delete/assign) ya que cada uno trae lógica de status logs.
- `useCreditNotes` (121) → ya separado por dominio; sub-extraer `useCancelCreditNote` y `useStampCreditNote` a archivos propios.

### Lote 12 — Desacoplar `useInvoiceFormLogic` (v6.39.2 · patch) — CRÍTICO
Toca 6 entidades (invoices, bookings, forklifts, customers, quotes, assignments). Split:
- `useInvoiceFromBooking.ts` (prefill desde reserva).
- `useInvoiceFromQuote.ts` (prefill desde cotización + assignments).
- `useInvoiceCustomerSnapshot.ts` (hidratación fiscal del cliente).
- `useInvoiceFormLogic` queda como orquestador ≤80 LOC.

Aplicar el mismo patrón a `useQuoteFormLogic` y `useAssignForklifts`.

### Lote 13 — Romper data↔presentación en PDFs (v6.39.3 · patch) — ALTO
`src/lib/pdf/quote/build.tsx`, `src/lib/pdf/customerStatement.tsx`, `src/features/invoices/lib/pdf/build.tsx` mezclan `supabase` con `@react-pdf`. Patrón:
- `…/pdf/<doc>/data.ts` ← lee de Supabase, devuelve VM tipado.
- `…/pdf/<doc>/Document.tsx` ← presentación pura sobre el VM.
- `build.tsx` queda en 1 función: `data() → Document()`.

### Lote 14 — Extraer formateadores de celda y mapas de status (v6.39.4 · patch) — ALTO
Eliminar duplicación detectada en 20+ páginas:
- `src/components/dataTable/cells/`: `CurrencyCell`, `DateCell`, `StatusCell`, `BadgeCell` reutilizables.
- `src/lib/domain/statusVariants.ts`: helper único `statusVariant(entity, status)` que reemplace los maps inline en `BankAccountsPage`, `BankStatementImportsHistoryPage`, `CashFlowSummaryCards`, etc.

### Lote 15 — Reorganizar `src/lib/` y `src/features/` (v6.40.0 · minor) — MEDIO
- Mover `src/lib/lineItems.ts` → `src/lib/domain/lineItems.ts` (ya es dominio).
- Mover `src/features/quotes/utils/` y `src/features/quotes/constants.ts` → `src/features/quotes/lib/`.
- Crear `src/features/{system,operations,reports,returns,suppliers,company-settings,maintenance}/lib/` cuando aplique para uniformar shape `{components, hooks, lib, pages}`.
- Unificar `src/lib/formatCurrency.ts` y `src/lib/money.ts` en un solo módulo (`src/lib/money.ts`) con re-export deprecado.
- Mover `src/lib/rpc.ts` bajo `src/integrations/supabase/` o renombrar a `src/lib/supabaseRpc.ts` para clarificar pertenencia.

### Lote 16 — Convenciones de naming (v6.40.1 · patch) — MEDIO
Definir y aplicar:
- Archivos: `PascalCase.tsx` para componentes, `camelCase.ts` para utils/hooks.
- Carpetas: `kebab-case`.
- Renombrar offenders: `src/components/DatePickerField.tsx` ↔ `src/hooks/use-mobile.tsx` (decidir uno), `src/components/dataTable/` → `src/components/data-table/`.
- Documentar la convención en `.workspace/skills/` o `README.md`.

### Lote 17 — Constantes de queryKeys (v6.40.2 · patch) — BAJO
Cada hook redefine `"forklifts"`, `"quotes"`, `"invoices"`, etc. como literales. Crear `src/lib/queryKeys.ts` con `QK = { forklifts: 'forklifts', quotes: 'quotes', … } as const` y reemplazar usos.

### Lote 18 — Limpieza de comentarios/dead code residual (v6.40.3 · patch) — OPCIONAL
- Borrar comentarios placeholder en `client.ts:9`, `useUserManagement.ts:1`.
- Convertir bloques explicativos en `matchingScore.ts`, `StatusBadge.tsx`, `cfdiPrechecks.test.ts` en JSDoc o moverlos a `/docs`.

### Lote 19 — Reducir complejidad ciclomática (v6.40.4 · patch) — OPCIONAL
- `calculateRentalCost` y `buildDailyRemainder` en `invoiceHelpers.ts`: extraer rate-resolver puro con tabla de prioridades.
- `useAccountsPayableKpis`: separar accumulator por tipo en funciones pequeñas.
- Ternarios anidados de `ListPageLayout`, `CashFlowSummaryCards`, `InvoicePaymentSummary` → helpers `getSubtitle()`, `getTone()`.

## Detalles técnicos

- Power of 10: hooks ≤80 LOC, componentes ≤150 LOC, sin `any`/`!`/`as`.
- Cambios sin impacto visible al usuario salvo Lote 13 (regenera PDFs — validar visualmente).
- Lote 15 y 16 son los que más diffs producen; ejecutarlos en lotes separados para keep PRs revisables.
- Sin cambios de schema ni de RLS en esta fase — sólo código cliente.

## Orden recomendado

11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19. Critical-path (11–14) entrega la mayor parte del valor arquitectónico; del 15 en adelante es pulido.
