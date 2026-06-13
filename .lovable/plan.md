## Objetivo

Llevar el lint a **0 warnings** (hoy 31). Quedan tres categorías:

- **26 complexity** (ciclomática > 12) — la mayoría en hooks de cómputo y acciones de detalle.
- **3 react-refresh/only-export-components** — archivos que mezclan componente + constantes/hooks.
- **2 max-lines-per-function** — diálogos de 152 líneas (umbral 150).

## Estrategia

Refactor mecánico, sin cambios funcionales. Cada extracción se valida con `tsc --noEmit` + suite de Vitest (526 tests) antes de pasar a la siguiente oleada.

### Ola 1 — react-refresh (3 warnings, ~10 min, riesgo bajo)

Separar exports no-componente a un archivo hermano. Imports se actualizan en los consumidores.

| Archivo | Acción |
|---|---|
| `src/contexts/PageActionsContext.tsx` | Mover `usePageActions` y `PageActionsContext` a `usePageActions.ts`. Dejar solo `PageActionsProvider` en el archivo original. |
| `src/features/invoices/hooks/invoices/usePaymentHistoryColumns.tsx` | Extraer el sub-componente interno (probablemente una celda) a `PaymentHistoryCells.tsx`; el hook queda solo. |

### Ola 2 — max-lines-per-function (2 warnings, ~15 min, riesgo bajo)

Ambos diálogos están 2 líneas por encima del umbral. Extraer el bloque de footer/acciones a un sub-componente local.

- `RegisterSupplierPaymentDialog.tsx` (152 líneas) → extraer `<DialogFooter>` a `RegisterSupplierPaymentDialogFooter`.
- `RecordPaymentDialog.tsx` (152 líneas) → mismo patrón.

### Ola 3 — complexity (26 warnings, ~2 h, riesgo medio)

Patrones recurrentes y sus tácticas:

1. **Hooks con filtros encadenados** (`useAccountsPayableFilters`, `useAccountsPayableKpis`, `useAgingReport`, `useExportablePayables`, `useSupplierBills`, `useCashFlowProjection`, `useSupplierRepMutations`).
   - Extraer cada predicado/branch a una función pura en el mismo `lib/` (p. ej. `payableMatches(filter, row)`, `bucketByAging(row)`).
   - El hook queda como `data.filter(matches).map(toRow)`.

2. **Components Detail/Actions con muchos guards de estado** (`InvoiceDetail`, `InvoiceDetailActions`, `QuoteDetailActions`, `ContractDetail`, `BillApprovalSection`, `SupplierBillDetailSheet`, `SupplierPaymentRow`, `BankAccountFormDialog`, `BankLineDetailSheet`, `CalendarPage`).
   - Reemplazar cadenas `if/else if` por un objeto `actionsByStatus` o `useMemo` que devuelva la config a renderizar.
   - Mover `canEdit`/`canCancel`/`canStamp` a un selector en `lib/<entity>Permissions.ts` (reutilizable).

3. **Parsers y formatters** (`csvParsers.parseBankCsv`, `errorDetailsExtract.extractErrorDetails`/`deriveErrorCode`, `errorReportFormat.formatReportText`, `backfillStampSnapshot`, `syncInvoiceStatus`).
   - Pasar a una tabla de despacho (`Map<key, handler>`) o early-returns por caso.
   - `parseBankCsv` ya tiene casos por banco → extraer cada banco a su propio `parse<Bank>Row` y dejar `parseBankCsv` como dispatch.

4. **Form helpers** (`SupplierFormDialog` x2, `useHotkeys`).
   - Extraer la validación cruzada de `SupplierFormDialog` a `supplierFormSchema.refine`.
   - `useHotkeys`: separar el matcher de combos a `lib/hotkeyMatcher.ts`.

## Validación

Después de cada ola:

```
bunx tsc --noEmit
bun run test
bunx eslint src
```

Meta acumulada: 0 warnings al terminar la Ola 3.

## Changelog

Una sola entrada `v6.59.0` (minor, infra) al final con resumen por ola. No se afecta runtime ni UI.

## Detalles técnicos

- Los hooks extraídos respetan la Power-of-10 (≤ 80 LOC).
- Los selectores de permisos (`canEdit`, etc.) se ubican en `src/features/<feat>/lib/<entity>Permissions.ts` y se cubren con tests unitarios si introducen lógica no trivial.
- No se modifican APIs públicas de barrels; los nuevos archivos se re-exportan donde aplique.
- Excluido del scope: `src/components/ui/**` (ya ignorado por ESLint).

## Riesgos

- **Permission selectors**: cambios de orden en las ramas podrían alterar acciones visibles. Mitigación: snapshot de los tests existentes + revisión manual de cada Detail page tras la extracción.
- **`parseBankCsv`**: regresión en parsing por banco. Mitigación: ya hay tests en `src/features/bank-reconciliation/lib/__tests__/`; ampliar si no cubren todos los bancos.
