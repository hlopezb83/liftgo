# Plan de cobertura de tests — LiftGo

## Estado actual (12 archivos, 71 tests)

**Ya cubierto:**
- Utilidades: `formatCurrency`, `exportCsv`, `constants`
- Dominio: `invoiceHelpers`, `invoiceFormSchema`, `useInvoiceLineItemHandlers`
- Flujos (con mocks de Supabase): `bookingFlow`, `invoiceFlow`, `paymentFlow`
- Seguridad: `rolePermissions`
- Smoke: `InvoicesPage`

## Gaps detectados (27 features, solo 1 con cobertura profunda)

### P0 — Lógica crítica de negocio (riesgo alto, dinero/contratos)

1. **Quotes** — multi-equipo, multi-divisa, rental_meta JSONB
   - `quoteFormSchema` (validación Zod)
   - Cálculo de meses calendario exactos (`rental-calculation`)
   - Mapeo `quote_assigned_forklifts` por `line_index`
   - Conversión cotización → reserva (constraint "Público en General")

2. **Bookings** — reglas GiST y buffer de mantenimiento
   - `bookingFormSchema`
   - Cálculo de fechas / extensiones / cancelación atómica
   - Generación de `RSV-XXXX`

3. **Contracts** — plantillas y placeholders dinámicos
   - `contractPayload`, `replacePlaceholders`, `placeholderRegistry`
   - Construcción de Anexo A/B

4. **Recurring billing** — alineación con mes calendario
   - `generate-recurring-invoices` (edge function)
   - `generate-recurring-maintenance` (edge function)
   - `recurringExpensesHelpers`

5. **Reports / P&L** — exclusión de software/depreciación
   - `useIncomeStatementData` y calculadores en `reports/hooks/incomeStatement/`
   - KPIs MRR (`MrrDetailPage` lógica)

### P1 — Hooks y utilidades transversales

6. **Hooks compartidos**
   - `useListFilters` (búsqueda multi-campo)
   - `useListPage` (paginación headless usada por ChangelogPage)
   - `useDebouncedValue`, `useDialogState`, `useDocuments`, `usePrefillEffect`

7. **Lib utilities**
   - `utils.ts` — `parseDateLocal`, `nowMty`, `formatDateDisplay`, `capitalize` (timezone Monterrey)
   - `coerce.ts` — saneo de inputs numéricos
   - `lineItems.ts` — totales/subtotales/IVA
   - `rpc.ts` — wrapper de RPCs
   - `domain/templateUtils.ts`, `domain/activityTranslations.ts`

8. **Tabla nueva (post-migración)**
   - `useLiftgoTable` — sorting, paginación, `getRowId`
   - `DataTableV2` — render de columnas, `meta.align`, `onRowClick`
   - `MobileCardList` — keyExtractor, fallback empty

### P2 — Flujos de feature con mocks Supabase

9. **CRM** — workflow validado, restricción Closed Won a admin
10. **Fleet** — `forkliftFormSchema`, ROI, alertas seguro 30 días, estado solo por eventos explícitos
11. **Maintenance** — `maintenanceFormHelpers`, prompt "Marcar disponible", recurrentes
12. **Customers** — `customerFormSchema`, CSF import, restricciones de delete, dirección genérica CFDI
13. **Deliveries / Returns** — ENT-/DEV-, horómetro, márgenes, e-firma
14. **Damage tracking** — flujo de reparación → facturación
15. **Expenses** — `expenseFormSchema`, exclusión categorías de P&L
16. **Inventory** — unique constraint `serial_number` parcial
17. **Feedback / Leaderboard** — scoring atómico vía RPC
18. **Users** — validación HIBP de contraseñas, matriz de permisos

### P3 — Edge Functions (Deno tests bajo `supabase/functions/`)

- `stamp-cfdi`, `cancel-cfdi` — integración Facturapi (test/live keys)
- `parse-csf` — extracción de RFC/dirección
- `invite-user`, `invite-customer`, `reset-user-password`, `delete-user`, `toggle-user-status`
- `classify-feedback-report` — clasificación AI
- `generate-manual`, `generate-invoice-pdf`

### P4 — Smoke tests de páginas principales (siguiendo patrón `InvoicesPage.test.tsx`)

Una por módulo: `Fleet`, `BookingsPage`, `QuotesPage`, `ContractsPage`, `CustomersPage`, `DeliveriesPage`, `ReturnInspectionPage`, `MaintenancePage`, `DamageTrackingPage`, `OperatingExpensesPage`, `InventoryPage`, `SuppliersPage`, `AuditTrailPage`, `UserManagementPage`, `Dashboard`, `IncomeStatementPage`, `CalendarPage`.

## Recomendación de ejecución

Implementar por sprints en orden P0 → P4. P0+P1 (≈ 15 archivos nuevos) cubre el 80% del riesgo real (dinero, contratos, fechas, billing). Cada sprint cierra con `bunx vitest run` verde y entrada en changelog.

## Detalles técnicos

- Reusar `src/test/helpers/mockSupabase.ts` para evitar duplicar mocks.
- Tests de hooks: `@testing-library/react` + `renderHook`.
- Tests de schemas Zod: validar `safeParse` en happy path y casos borde.
- Edge functions: `supabase--test_edge_functions` con archivos `*_test.ts` Deno.
- Convención de naming actual: mezcla `__tests__/` (invoices) y `test/` raíz. **Sugerencia:** estandarizar a `__tests__/` colocalizado por feature.

## Pregunta para continuar

¿Empezamos por **P0 Quotes + Bookings** (mayor superficie de bug financiero) o prefieres que arranque por **P1 hooks/utils** (más rápido y desbloquea futuros tests de feature)?
