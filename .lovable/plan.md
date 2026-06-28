## Fase 3 — Cierre final: páginas de Cash Flow y Bank Reconciliation

Quedan 4 páginas con layout manual (`p-4 sm:p-6` + `PageTransition` + `<div>` envoltorios) que aún no usan `PageContainer`. Las migro para cerrar al 100% la auditoría visual.

### Páginas a migrar

1. **`src/features/cash-flow/pages/CashFlowPage.tsx`** — reemplazar `<div className="p-4 sm:p-6 space-y-4">` por `<PageContainer>`.
2. **`src/features/bank-reconciliation/pages/BankReconciliationPage.tsx`** — mismo cambio.
3. **`src/features/bank-reconciliation/pages/BankStatementImportsHistoryPage.tsx`** — mismo cambio.
4. **`src/features/bank-reconciliation/pages/BankAccountsPage.tsx`** — mismo cambio.

`PageTransition` y `RoleGuard` se mantienen como wrappers externos; `PageContainer` sustituye sólo al `<div>` con padding/spacing.

### Excluidos (correctos como están)
- `ChangelogPage.tsx` — ya usa `PageContainer`; el `p-6` restante es de un `Card` interno (intencional).
- `ListPageLayout.tsx` y `TableSkeleton.tsx` — primitivas de layout, no páginas.
- `NotFound.tsx` — pantalla full-screen centrada (no aplica `PageContainer`).

### Entregables
- 4 archivos editados.
- Entrada en `public/changelog.json` + `public/changelog/v6.98.6.json` (patch) describiendo el cierre de Fase 3.
