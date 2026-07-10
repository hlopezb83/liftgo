## Barrido completo de warnings de ESLint (32 → 0)

Objetivo: eliminar los 32 warnings actuales (`complexity`, `max-lines-per-function`, `max-lines`, `react-refresh/only-export-components`, `no-restricted-imports`, directiva no usada) **sin cambiar comportamiento**. Todo se hace por extracción de subcomponentes y helpers puros, siguiendo Power of 10 y DRY.

### Reglas del sprint
- Cada archivo tocado se cubre con `bun run lint <file>` y los tests existentes del módulo.
- Cero cambios de UI visible, cero cambios de queries, cero cambios de tipos públicos.
- Los helpers extraídos van al mismo directorio del archivo (o a `lib/` de la feature si aplican a varios).
- Al final: `bun run lint` limpio + `bunx vitest run` verde + smoke Playwright de facturación/mantenimiento.

---

### Lote 1 — Trivial (2 warnings, ~10 min)

1. `src/features/inventory/components/inventory/PartFormDialog.tsx` — quitar la línea `/* eslint-disable react-refresh/only-export-components */` no usada.
2. `src/features/crm/components/prospect-form/ProspectDialogParts.tsx` — mover las 2 constantes exportadas a `prospect-form/constants.ts` para que el archivo solo exporte componentes.

### Lote 2 — Invoices (12 warnings, riesgo bajo-medio)

Módulo con más deuda. Cada uno se divide en subcomponentes puros.

- `pages/InvoicesPage.tsx` (195 LOC) → extraer `InvoicesToolbar`, `InvoicesFiltersRow`.
- `pages/InvoicesReconciliation.tsx` (168 LOC) → extraer `ReconciliationSummary`, `ReconciliationTable`.
- `pages/InvoiceDetail.tsx` (complexity 21) → mover la lógica de `flags`/`visibility` a un hook `useInvoiceDetailState`.
- `components/invoice-form/CfdiFieldsCard.tsx` (182 LOC, complexity 13) → extraer `CfdiUsageField`, `CfdiPaymentFormField`.
- `components/recurring/RecurringInvoicesPreviewDialog.tsx` (169 LOC) → extraer `PreviewSummary`, `PreviewLineRow`.
- `components/invoice-detail/InvoiceDetailActions.tsx` (complexity 16) — dividir en `PrimaryActions` y `SecondaryActions`.
- `components/invoice-detail/InvoiceFiscalDataCard.tsx` (13) — early returns por estado fiscal.
- `components/invoice-detail/InvoicePaymentSummary.tsx` (13) — extraer helper `resolvePaymentStatus`.
- `hooks/invoiceForm/useInvoiceFormHandlers.ts` (13) — extraer `buildInvoicePayload`.
- `lib/formatStoredCfdiError.ts` (13) — tabla `{code → message}` en lugar de cadena de `if`.
- `lib/invoiceVisibility.ts` (13) — dividir `computeInvoiceVisibility` en `canView`/`canEdit`/`canDelete`.

Tests: `src/lib/domain/__tests__/invoiceHelpers.test.ts`, `invoiceTotals.test.ts` + smoke `/invoices` con Playwright.

### Lote 3 — Suppliers & AP (6 warnings, riesgo bajo)

- `SupplierBillDetailSheet.tsx` (306 LOC file, 151 LOC function, complexity 32) — dividir en `BillHeaderCard`, `BillLinesTable`, `BillPaymentsCard`. Este es el más pesado del sprint.
- `SupplierBillFormDialog.tsx` (172 LOC) — extraer `BillLineItemsField`, `BillSummaryFooter`.
- `SupplierPaymentRow.tsx` (complexity 20) — mover badges/acciones a subcomponentes `PaymentStatusBadge`, `PaymentRowActions`.
- `PaymentActions.tsx` (13) — early returns por estado.
- Fix de `no-restricted-imports`: reemplazar `import … from "@/features/company-settings/hooks/useCompanySettings"` por el barrel público `@/features/company-settings`.

### Lote 4 — Reportes y componentes compartidos (5 warnings)

- `components/domain/KpiTile.tsx` (16) — dividir render en `<KpiHeader>` + `<KpiBody>` según `variant`.
- `components/forms/fields/DateRangeField` (13) — extraer `buildRangePresets`.
- `features/reports/…/StatementTableRow.tsx` (16) — extraer helper `formatCell` con lookup por tipo de fila.
- `features/portal/pages/PortalStatement.tsx` (153 LOC) — extraer `StatementSummary`, `StatementLineRow`.
- `features/company-settings/…/CompanyLogoTab.tsx` (regla `react-refresh` en línea 75) — mover el helper exportado a `companyLogoHelpers.ts`.

### Lote 5 — Utilidades y config (7 warnings)

- `lib/rules/invoices.ts::computeActionFlags` (15) — dividir en `computeCfdiFlags` + `computePaymentFlags` y componer.
- `lib/supabase/invokeEdgeFunction.ts::extractErrorMessage` (15) — tabla `{shape → parser}` en vez de cadena de `if`.
- `features/expenses/…/parseCfdiXml` (27) — extraer `parseEmisor`, `parseReceptor`, `parseConceptos`, `parseImpuestos` (helpers puros ya testeados vía snapshot).
- `features/accounts-payable/hooks/useSupplierBillActions.ts` (complexity 23 en arrow) — dividir `handleStatusChange` por transición de estado.
- `vite.config.ts::manualChunks` (16) — extraer objeto `CHUNK_GROUPS` con matcher por regex; el método queda de 3 líneas.

### Verificación final

1. `bun run lint` → 0 problems.
2. `bunx vitest run` → 804/804 verde.
3. Smoke Playwright: `/invoices`, `/invoices/:id`, `/cuentas-por-pagar`, `/reports/estado-resultados`, `/portal/estado-cuenta`.
4. Registro en changelog `v7.5.0` (minor) — refactor amplio pero sin cambios funcionales.

### Detalles técnicos

- **`react-refresh/only-export-components`**: la regla exige que un archivo solo exporte componentes React para que Vite HMR pueda hacer fast refresh. Cualquier `export const X = …` no-componente rompe la garantía. Fix: mover a `*.constants.ts` o `*.helpers.ts` hermanos.
- **`complexity` (max 12)**: cuenta caminos independientes (if/else, `&&`, `||`, `?:`, `switch`, `catch`). Los patrones de fix habituales del proyecto son (a) early returns, (b) tablas `{key → fn}`, (c) extraer helpers puros, (d) dividir componentes por `variant`.
- **`max-lines-per-function` (150) y `max-lines` (300)**: umbrales de v5.80.0. Ningún archivo del sprint requiere subir el umbral; todos bajan por extracción.
- **Riesgo**: bajo en lotes 1, 4, 5 (helpers puros y presentacionales). Medio en 2 y 3 (Invoices y SupplierBillDetailSheet manejan estado fiscal). Mitigación: los hooks y llamadas Supabase no se tocan, solo la composición del render.
- **Fuera de alcance**: no se cambian tipos exportados, no se renombran archivos públicos, no se tocan Edge Functions ni migraciones.
