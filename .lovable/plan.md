## Auditoría Sprint F

### ✅ Funciona

- 5 páginas migradas al canónico (`useTableFilters` + `FiltersToolbar`): Cotizaciones, Contratos, Daños, Clientes, Mantenimiento.
- Facturas: `hasActive`/`clearAll` conectados a botón "Limpiar filtros".
- `FiltersToolbar.DateRange` añadido; serializa `YYYY-MM-DD..YYYY-MM-DD`.
- Bug P0 de Mantenimiento resuelto (filtro `?forklift=` persiste en URL).
- Typecheck limpio; screenshots verificados a 1600x900.

### 🐛 Bugs / deuda detectada

1. `**useResourceList` sigue usando `useListFilters` internamente** (`src/hooks/useResourceList.ts`). Sus 3 consumidores (Invoices, Bookings, Fleet) ejecutan filtrado interno **redundante** — inofensivo cuando pasan `externalFiltered`, pero mantiene vivo el legacy y duplica lógica.
2. **Bookings y Fleet no migrados** — todavía dependen del filtrado interno del legacy vía `useResourceList`. No están en el "5/30", así que quedan como generación intermedia.
3. **Sin tests nuevos** — `FiltersToolbar.DateRange`, `useInvoicesFilters.clearAll`, y el round-trip de URL de `useTableFilters` no tienen cobertura.
4. **14 tablas usan shadcn `<Table>` crudo**, pero sólo 3 son verdaderas tablas de listado (candidatas a DataTableV2). El resto son tablas de detalle/reporte estructuralmente distintas — mantenerlas fuera de scope.

Sin regresiones bloqueantes. Deuda controlada. Procedo a Sprint G.

---

## Sprint G — Retiro de `useListFilters` y migración de tablas de listado

**Objetivo:** eliminar la doble generación de filtros (legacy + canónico) y migrar las 3 tablas de listado que aún usan shadcn `<Table>` crudo a `DataTableV2`.

### G1 — Refactor de `useResourceList` (retiro del legacy)

- Convertir `useResourceList` en un thin wrapper sobre `useLiftgoTable` que **exige** `externalFiltered` como fuente única (elimina `filters` prop y la rama interna `useListFilters`).
- Actualizar sus 3 consumidores (`InvoicesPage`, `BookingsPage`, `FleetPage`) para pasar la data ya filtrada por su hook canónico:
  - Invoices: ya llama `useInvoicesFilters` (canónico) — sólo hay que quitar la config `filters` residual.
  - Bookings: migrar a `useTableFilters` (search + status).
  - Fleet: migrar a `useTableFilters` (search + status).
- Borrar `src/hooks/useListFilters.ts` y su test — dejar de exportarlo.

### G2 — Migrar 3 tablas de listado a `DataTableV2`

Sólo las que son estructuralmente listas paginables:

- `src/features/bank-reconciliation/pages/BankStatementImportsHistoryPage.tsx` (historial de imports).
- `src/features/invoices/components/reconciliation/ReconciliationTable.tsx` (líneas conciliables).
- `src/features/dashboard/pages/MrrDetailPage.tsx` (detalle MRR por cliente).

Las 11 restantes (`IncomeStatement*`, `AgingReport`, `CashFlowTable`, `AuditDiffTables`, `CreditNoteLinesTable`, `InvoiceCreditNotesCard`, `EditableLineItemsTable`, `SupplierContactsSection`, `SupplierBankAccountsSection`, `StatementTableRow`) se documentan como excepciones intencionales (tablas de detalle/reporte no paginables) en un comentario inline al top de cada archivo. Sin migración.

### G3 — Tests de las utilidades canónicas

Cobertura mínima para blindar el contrato:

- `src/hooks/filters/__tests__/useTableFilters.test.tsx` — round-trip URL (set/clear/hydrate), facet `dateRange` y `search.accessors`.
- `src/components/filters/__tests__/FiltersToolbar.test.tsx` — `DateRange` serializa/parsea correctamente; `ClearAll` respeta `visible`.
- `src/features/invoices/hooks/invoices/__tests__/useInvoicesFilters.test.tsx` — `hasActive` y `clearAll` resetean search + status + rango.

### Detalles técnicos

- **Cambios de API**: `useResourceList` pierde `filters` y `externalFiltered` deja de ser opcional (rename → `data`). Es un hook interno; sólo 3 consumidores.
- **Riesgo `useListFilters` borrado**: `useResourceList` y su test son los únicos consumidores restantes tras Sprint F. Con G1 completo la eliminación es segura.
- **DataTableV2 en `MrrDetailPage**`: la tabla actual comparte contenedor con KPIs; hay que preservar el orden visual (KPIs arriba, tabla abajo) y el ordenamiento por MRR desc por defecto.
- **Verificación**: typecheck + `bunx vitest run` + Playwright a 1600x900 sobre Invoices/Bookings/Fleet/BankStatementImports/MRR.
- **Changelog**: entrada `v7.69.0` (minor: retiro de API interna + migración de 3 tablas + tests).

### Fuera de scope

- Reescribir tablas de reporte/detalle (Aging, Income Statement, Cash Flow, etc.).
- Migrar `CRM Pipeline` a `useTableFilters` (usa Kanban, no tabla).
- Auditoría visual final — la dejamos como cierre de Sprint H.

Ejecuta el playwrite primero. 