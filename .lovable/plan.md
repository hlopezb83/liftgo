# Sprint DRY — Auditoría y refactor por lotes

Consolidación de hallazgos de 3 auditorías paralelas (hooks/data-access, reglas/validaciones, componentes UI). Cada lote es una versión (`patch` o `minor`) con changelog obligatorio y **cero cambios funcionales**. Orden por severidad + dependencias.

## Objetivos

- Eliminar ~1,400 LOC de código duplicado.
- Centralizar cálculos financieros, validaciones Zod y reglas de dominio en `src/lib/`.
- Extraer 4 componentes UI reutilizables.
- Corregir 3 bugs latentes descubiertos durante la auditoría (drift de centavos en credit notes, `exchange_rate=0`, invalidaciones rotas por typo).

## Reglas de ejecución

- Preservar firmas públicas de componentes/hooks.
- Cada lote incluye entrada en `public/changelog.json` + `public/changelog/vX.Y.Z.json`.
- Un solo cambio conceptual por lote → PR pequeño, fácil de revisar/revertir.
- Sin `any`, sin `!`, sin `as` — reglas Power of 10 vigentes.

---

## Lote 1 — Utilidades y schemas comunes (v6.131.0) · CRITICAL · S

Crear la infraestructura compartida que consumen los lotes 2-5.

**Nuevos archivos:**
- `src/lib/schemas/common.ts` → `optionalEmail()`, `rfcOptional()`, `rfcRequired()`, `clabeOptional()`, `CLABE_REGEX`, `isValidClabe`, `positiveAmount(msg?)`.
- `src/lib/query/createEntityKeys.ts` → factory `{ all, lists, details, detail(id), byFilter(f) }`.
- `src/lib/hooks/useEntityMutation.ts` → wrapper de `useMutation` con `invalidateKeys`, `errorTitle`, `successMsg`, `onSuccess` opcional.
- `src/lib/supabase/fetchNextDocNumber.ts` → helper tipado para RPCs `next_*_number`.
- Mover `toMxn` de `src/features/cash-flow/lib/cashFlowTransformers.ts` → `src/lib/money/index.ts` (junto a `roundMoney`, `computeTotals`). Corregir guard `rate > 0` para no devolver 0 silencioso.

**Tests:** unitarios para cada util (Vitest) — RFC formato, CLABE 18 dígitos, `toMxn` con fx=0/null, `computeEntityKeys` estabilidad.

## Lote 2 — Adopción de schemas y formatters comunes (v6.132.0) · CRITICAL · S-M

Reemplazar copias inline por los helpers del Lote 1. **Solo búsqueda-y-reemplazo dirigido**, sin refactor estructural.

**Archivos a tocar (12):**
- `customers/lib/customerFormSchema.ts`, `suppliers/lib/supplierFormSchema.ts`, `suppliers/components/.../SupplierContactFormDialog.tsx` → `optionalEmail()`, `rfcOptional()`.
- `operations/lib/operationsSchemas.ts` → `rfcRequired()`.
- `suppliers/hooks/useSupplierBankAccounts.ts` → re-exportar desde `@/lib/schemas/common`; `SupplierBankAccountFormDialog.tsx` importar de allí.
- `accounts-payable/lib/supplierPaymentSchema.ts`, `portal/.../ReportTransferDialog.tsx`, `invoices/.../EditPaymentDialog.tsx`, `crm/components/CloseWonDialog.tsx` → `positiveAmount()`.
- `accounts-payable/.../SupplierBillFormDialog.tsx:205` → `formatCurrencyWithCode()` en lugar de `toLocaleString` inline.
- Eliminar alias `STATUS_LABELS` en `useBookingActionsLogic.ts`; consumers usan `BOOKING_STATUS_LABELS`.

## Lote 3 — Reglas de dominio centralizadas (v6.133.0) · HIGH · M

Extraer guards de estado dispersas a `src/lib/rules/`. Puro (sin efectos), testeable.

**Nuevos archivos:**
- `src/lib/rules/quotes.ts` → `canEditQuote(q)`, `canConvertQuote(q, isSale, alreadyConverted)`, `canActOnPortalQuote(q)`.
- `src/lib/rules/invoices.ts` → `computeInvoiceFlags(invoice, cfdiStatus)` fusionando `computeFlags` (de `InvoiceDetailActions`) y la parte booleana de `invoiceVisibility.ts`. La función existente `computeInvoiceVisibility` se refactoriza para consumir `computeInvoiceFlags` internamente.

**Consumidores actualizados:**
- `quotes/components/quotes/QuoteDetailActions.tsx` (líneas 29, 110)
- `portal/pages/PortalQuoteDetail.tsx:56`
- `invoices/components/invoice-detail/InvoiceDetailActions.tsx` (borra `computeFlags` local)

**Corrección de bug latente:** unificar la fórmula de `isCancelled`/`isStamped` (hoy divergente entre los dos archivos).

## Lote 4 — Query keys factory + `useEntityMutation` (v6.134.0) · HIGH · M

Aplicar factories del Lote 1 a las 5 features que aún manejan strings crudos.

**Archivos a migrar:**
- `contracts/hooks/useContracts.ts`, `quotes/hooks/quotes/useQuotes.ts`, `deliveries/hooks/useDeliveries.ts`, `returns/hooks/useReturnInspections.ts`, `accounts-payable/hooks/*` (6 archivos que usan literal `"supplier_bill"` mal-pluralizado).
- Crear `contractKeys`, `quoteKeys`, `deliveryKeys`, `returnKeys`, `supplierBillKeys` con `createEntityKeys`.
- Migrar ~15 mutaciones piloto (create/update/delete de `contracts`, `deliveries`, `returns`, `prospects`) a `useEntityMutation`. **No** migrar todas las 121 en este lote — solo estas 5 features para validar el patrón. Lote de seguimiento futuro cubrirá el resto.

**Corrección de bug latente:** unificar `queryKey: ["deliveries", bookingId]` vs `["deliveries", "detail", id]` (hoy ambigüedad hace que invalidar detail no refresque list).

## Lote 5 — Componentes UI reutilizables (v6.135.0) · HIGH · S-M

Extraer 4 componentes; refactor visual puro, sin cambio de comportamiento.

**Nuevos componentes:**

1. `src/components/ui/DetailRow.tsx` — reemplaza la definición local en `damage/DamageDetailSheet.tsx`, `maintenance/MaintenanceDetailSheet.tsx`, `crm/ProspectDetailSheet.tsx`, `inventory/PartDetailSheet.tsx`.
2. `src/features/reports/components/reports/ReportChartCard.tsx` — cabecera Card + botón Export CSV. Consumida por los 5 reports (`RevenueReport`, `UtilizationReport`, `MaintenanceCostReport`, `ProfitabilityByModelReport`, `UtilizationByModelReport`).
3. `src/components/layout/ListFilterBar.tsx` — props `search, onSearchChange, statusFilter?, onStatusChange?, statuses?, extra?` (slot). Adoptado en `BookingsPage`, `ContractsPage`, `InvoicesPage`, `QuotesPage`, `DamageTrackingPage`.
4. `src/components/ui/KpiTile.tsx` — extraído del cuerpo de `StatCards`; `StatCards`, `FinancialKpiCards`, `MrrDetailPage:105-115` lo consumen. `href?` opcional para tiles linkeables.

**Cierre:** `ConfirmDialog` ya está adoptado en 15+ sitios — no requiere trabajo.

## Lotes futuros (fuera de este sprint, referencia)

- **Lote 6 (post-sprint):** aplicar `useEntityMutation` al resto de features (~106 mutaciones restantes) y `DetailSheet` shell + `DetailPageSkeleton` (H7/H6 del audit UI). Se difiere porque la superficie es amplia y conviene validar el patrón con el Lote 4 antes.
- **Lote 7 (post-sprint):** aplicar `computeTotals` en `useCreditNoteForm.ts` y sustituir `.toFixed(2)` por `roundMoney` en `accounts-payable/hooks/useExportPaymentsForm.ts` + `lib/buildPaymentsXlsx.ts`. Requiere validación numérica caso-por-caso.

## Notas técnicas

- Todos los lotes son **retro-compatibles**: los helpers nuevos son aditivos; el reemplazo en consumidores preserva firmas.
- La factorización de mutaciones cuida los `onSuccess` custom (navegación, toast personalizado, cache manual) — quedan como callback opcional del helper.
- Tests actuales deben seguir verdes sin cambio; agregar tests unitarios solo para los helpers nuevos del Lote 1.

## Entregables por lote

Cada versión: código + changelog entry + actualización de `mem://` si aplica (Lote 1 introduce `src/lib/schemas/common.ts` y `src/lib/rules/*` — merecen entrada en memoria).

**¿Arranco por Lote 1 al aprobar?**
