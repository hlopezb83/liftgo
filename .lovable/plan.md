## Auditoría de tablas en la app

Mapeo de todo lo que importa `@/components/ui/table` y clasificación según deben migrar a `DataTableV2` o quedarse como están.

### Estado actual

**Ya estandarizadas en `DataTableV2` + `useLiftgoTable`** (sorting, paginación, presentación uniforme): Customers, Invoices, Bookings, Quotes, Contracts, Fleet, Maintenance, Damage, Inventory, Suppliers (list + detail), Returns, Deliveries, Expenses, Users, Audit, Feedback (MyReports), Reports (Aging, Revenue, Utilization, Profitability, Maintenance), Portal (Rentals, Invoices, Contracts, InvoiceDetail), Operations tabs (Drivers, Mechanics, Models, Policies), MRR Detail, Forklift Hourometer, Invoice Payment Summary.

**Sub-tablas que deben quedarse en primitive `ui/table`** (no son tracking; tienen edición inline, totales, diff, o estructura jerárquica):
- `EditableLineItemsTable.tsx` — inputs por celda
- `ReadOnlyLineItemsTable.tsx` — con totales en footer
- `InvoiceCreditNotesCard.tsx` — embebida en card pequeña
- `CreateCreditNoteDialog.tsx` — selección dentro de dialog
- `AuditDiffTables.tsx` — visualización de diffs
- `IncomeStatementTable.tsx` + `ComparisonTable.tsx` + `StatementTableRow.tsx` — P&L jerárquico con subtotales

### Candidatas reales a migrar

Solo **2 archivos** todavía renderizan tracking-style listas con `ui/table` crudo:

1. **`src/features/crm/pages/CRMClosedPage.tsx`** — Tabla de prospectos cerrados (won/lost). Columnas: Empresa, Contacto, Valor, Fecha cierre, Vendedor, Razón (lost), acciones. Sin sorting, sin paginación, sin persistencia.
2. **`src/features/feedback/pages/LeaderboardPage.tsx`** — Ranking. Columnas: #, Nombre, Reportes, Aceptados, Resueltos, Puntos. Sin sorting interactivo.

### Plan de migración

**Paso 1 — `CRMClosedPage`**
- Reemplazar la función local `ClosedTable` por `DataTableV2` con `useLiftgoTable<Prospect>`.
- Definir `columns: ColumnDef<Prospect>[]` para won y lost (lost añade columna "Razón").
- Acción "Reabrir" como columna `actions` al estilo de Customers/Invoices (ícono + onClick).
- Persistence key: `crm-closed-won` y `crm-closed-lost`.
- Pagination por defecto 25 (memoria `arch/pagination`).
- Mantener `MobileCardList` en mobile (regla Core).

**Paso 2 — `LeaderboardPage`**
- Reemplazar `LeaderboardTable` por `DataTableV2`.
- Columnas con `sortable: true` en Reportes, Aceptados, Resueltos, Puntos (Puntos como sort default desc).
- Columna `#` calculada desde el índice después de sort (render `({ row, table }) => ...` o pre-calcular en data).
- Persistence key: `leaderboard-${period}`.

**Paso 3 — Estandarización transversal**
- Verificar que toda página migrada usa exactamente: `useLiftgoTable({ data, columns, initialPageSize: 25, persistenceKey })` + `<DataTableV2 table={...} />`.
- Confirmar formato de columnas monetarias con `formatCurrency` y `tabular-nums` / `font-mono` (consistente con MrrDetailPage).
- Confirmar fechas con `DD/MM/YYYY` vía utilidades existentes.

**Paso 4 — Changelog**
- `public/changelog/v6.24.6.json` + entrada en `public/changelog.json` describiendo "Estandarización de tablas de tracking en CRM Cerrados y Leaderboard a DataTableV2".

### Lo que NO se cambia y por qué

- Line items, credit notes embebidas, diff de auditoría e Income Statement **no migran**: `DataTableV2` está diseñado para listados paginables y ordenables con una fila = una entidad. Forzarlos perdería edición inline, totales jerárquicos y agrupamientos visuales — sería una regresión funcional, no una estandarización.

### Riesgos

- `CRMClosedPage` y `LeaderboardPage` son vistas pequeñas; bajo riesgo.
- Verificar que el sort de Leaderboard por "Puntos desc" mantenga la numeración `#` coherente (recalcular después del sort, no antes).
