# Auditoría de Arquitectura — LiftGo

Revisión sin cambios de código. Resultado general: **arquitectura sólida** (feature-folders, hooks por dominio, RPCs para transaccionalidad, RLS por rol, sin `any`/`!`/`as`, sin `console.log`). Hay áreas mejorables, sobre todo en duplicación de lógica financiera, tamaño de algunos archivos y fronteras entre features.

---

## Lo que está bien (mantener)

- Feature-folders consistentes (`src/features/*/{pages,components,hooks,lib}`); 0 imports directos a `supabase/client` desde `pages/` o `components/` — toda la I/O vive en hooks. ✅
- Power of 10: 0 ocurrencias de `any`/`!.`/`as X`. ✅
- 0 `console.log`, sólo 3 `TODO/FIXME`. ✅
- Capa `src/lib/domain` bien separada (helpers puros, sin React).
- RPCs centralizan flujos multi-tabla (integridad transaccional).

---

## Hallazgos (de mayor a menor severidad)

### 🔴 CRÍTICO

**1. Lógica de "balance por pagos parciales" duplicada en 4+ lugares**
Cada consumidor recomputa `balance = total − Σ payments.amount`:
- `src/features/invoices/hooks/invoices/useUpcomingInvoices.ts` (recién agregado)
- `src/features/cash-flow/hooks/useCashFlowProjection.ts`
- `src/features/reports/components/reports/AgingReport.tsx` (recién agregado)
- `src/features/dashboard/hooks/dashboard/useDashboardSections.ts` (consume `balance` opcional)
- `src/features/portal/pages/PortalStatement.tsx`
- Y en SQL: `get_financial_kpis` y `get_dashboard_stats` recalculan el mismo agregado.

**Riesgo:** el bug recién corregido de cartera vencida volverá a aparecer en otra vista. Cada nueva pantalla financiera puede divergir de la "verdad".

**Fix sugerido:** crear `useInvoicesWithBalance(filter)` (o vista SQL `v_invoices_with_balance`) que devuelva `balance` calculado **una vez**, y consumirlo desde todas las pantallas. Eliminar los `paidByInvoice` manuales.

### 🟠 ALTO

**2. Acoplamiento cruzado entre features**
Top dependencias entre carpetas `features/`:
```
invoices → bookings (34), quotes (28), users (17), company-settings (17)
fleet → maintenance (22), damage (15), bookings (15)
quotes → customers (16), fleet (15)
```
`invoices` importa de 7+ features; algunas de estas deberían ser tipos/contratos compartidos en `src/lib/domain/` en vez de cruzar features.

**Fix:** mover tipos y helpers compartidos (p.ej. `BookingLite`, `CustomerLite`, `ForkliftLite`) a `src/lib/domain/`. Que features se comuniquen vía contratos, no vía hooks internos del otro feature.

**3. `useUpcomingInvoices` y `AgingReport` ahora hacen el mismo query `payments.select(invoice_id, amount)`**
Doble round-trip al backend cuando el usuario abre dashboard + reportes. Candidato natural a hook compartido con caché de TanStack Query.

**4. Archivos >150 LOC (regla "Power of 10" del proyecto)**
38 archivos exceden el límite. Top ofensores en código de negocio:
| LOC | Archivo |
|---|---|
| 261 | `accounts-payable/components/ExportPaymentsDialog.tsx` |
| 256 | `accounts-payable/pages/CuentasPorPagarPage.tsx` |
| 251 | `components/ListPageLayout.tsx` |
| 242 | `accounts-payable/components/SupplierBillFormDialog.tsx` |
| 214 | `invoices/components/invoice-detail/InvoicePaymentSummary.tsx` |
| 211 | `invoices/components/invoice-detail/CreateCreditNoteDialog.tsx` |
| 210 | `crm/pages/CRMClosedPage.tsx` |
| 200 | `accounts-payable/components/RegisterSupplierPaymentDialog.tsx` |
| 193 | `invoices/components/invoices/RecordPaymentDialog.tsx` |
| 191 | `lib/domain/invoiceHelpers.ts` |

(Se excluyen `ui/sidebar.tsx`, `ui/chart.tsx`, `pdf/theme/styles.ts` por ser librerías de presentación.)

**Patrón típico:** dialogo de formulario con estado + validación + submit + render. Extraer hook `use<X>FormLogic.ts` y componentes hijo.

### 🟡 MEDIO

**5. Hooks >80 LOC (regla del proyecto)**
20 hooks exceden el límite. Top:
- `invoices/hooks/invoiceForm/invoiceFormBuilders.ts` (130)
- `portal/hooks/usePaymentIntents.ts` (127)
- `bank-reconciliation/hooks/useBankReconciliationMutations.ts` (125)
- `invoices/hooks/creditNotes/useCreditNotes.ts` (121)
- `fleet/hooks/forklifts/useAssignForklifts.ts` (115)

La mayoría agrupan varias mutaciones (`useCreateX` + `useUpdateX` + `useDeleteX`). Considerar dividir en archivos por mutación cuando crezcan.

**6. `src/lib/domain/invoiceHelpers.ts` (191 LOC)** mezcla cálculo de totales, parsing de line items y otros utilitarios. Dividir en `totals.ts`, `lineItemParsers.ts`, etc.

**7. SQL: lógica financiera duplicada entre RPCs**
`get_financial_kpis` y `get_dashboard_stats` calculan ambos `outstanding_revenue` y `overdue_total` con LEFT JOIN a `payments`. Misma fórmula, dos lugares. Extraer a vista `v_invoices_with_balance` y consumirla desde ambos RPCs.

**8. `useUpdateBooking` / `useCancelBooking` reparten lógica de máquina de estados**
Ya está documentado en memoria; verificar que toda transición pase por RPC (no mutaciones sueltas en hooks).

### 🟢 BAJO / OPCIONAL

**9. `tests/e2e` y `src/test/` coexisten** con convenciones distintas (Playwright vs Vitest). Documentar en `README` cuándo usar cada uno.

**10. `usePortalExtras.ts`** es solo barrel re-export. Útil, pero verificar que no oculte ciclos de import.

**11. Algunas páginas (`InvoicesPage`, `CustomersPage`, `BookingsPage`, ~160 LOC)** siguen usando el patrón `useListPage`+`useListFilters` correctamente; rozan el límite pero son aceptables.

**12. `src/integrations/supabase/types.ts` (3559 LOC)** — autogenerado, no tocar. ✅

---

## Plan priorizado de mejoras

Ordenado por impacto/riesgo. **Ningún paso bloquea al siguiente; se pueden tomar de a uno.**

1. **[CRÍTICO] Unificar cálculo de `balance` de facturas.**
   - Crear vista SQL `v_invoices_with_balance` (= `invoices` + `balance` + `paid_amount`).
   - Crear hook `useInvoicesWithBalance(filter)` que lo consuma.
   - Migrar: `useUpcomingInvoices`, `AgingReport`, `useDashboardSections`, `useCashFlowProjection`, `PortalStatement` y RPCs `get_financial_kpis` / `get_dashboard_stats`.
   - Beneficio: elimina la clase de bug "olvidé restar pagos parciales" para siempre.

2. **[ALTO] Reducir acoplamiento entre features.**
   - Inventariar tipos compartidos (`CustomerLite`, `ForkliftLite`, `BookingLite`) y moverlos a `src/lib/domain/sharedTypes.ts`.
   - Reemplazar imports cruzados de hooks por contratos: si `invoices` necesita datos de `bookings`, exponer un selector explícito (`getBookingForInvoice`) en `bookings/api/` y consumirlo.
   - Documentar regla: una feature **no** importa hooks internos (`/hooks/*/...`) de otra; solo su API pública (`/api/index.ts`).

3. **[ALTO] Romper los 5 componentes >200 LOC** (orden propuesto):
   1. `ExportPaymentsDialog.tsx` → extraer `useExportPaymentsForm` + `PaymentsExportPreview`.
   2. `CuentasPorPagarPage.tsx` → extraer `useCuentasPorPagarFilters` + `BillsTable`.
   3. `SupplierBillFormDialog.tsx` → extraer `useSupplierBillForm` + secciones (`SupplierBillHeader`, `SupplierBillLines`).
   4. `InvoicePaymentSummary.tsx` → extraer `usePaymentSummary` + `PaymentRow`.
   5. `CreateCreditNoteDialog.tsx` → mismo patrón.

4. **[MEDIO] Dividir `invoiceHelpers.ts`** en `totals.ts`, `lineItems.ts` (mover desde `lib/domain/lineItems.ts` si conviene), `formatting.ts`.

5. **[MEDIO] Dividir hooks >100 LOC** que agrupan múltiples mutaciones (`useCreditNotes`, `useBankReconciliationMutations`, `usePaymentIntents`).

6. **[MEDIO] DRY de RPCs financieras**: extraer subquery `paid_amount` a vista compartida (paso 1 cubre la mitad).

7. **[BAJO] Documentar fronteras**: añadir sección "Arquitectura" a `architecture.md` con:
   - Regla de capas (page → hook → supabase/RPC, jamás cruzar).
   - Regla de cross-feature (solo vía `lib/domain` o `/api/`).
   - Límites de tamaño (componente ≤150, hook ≤80).
   - Lista de RPCs como única vía para flujos multi-tabla.

8. **[BAJO] Linter custom**: añadir regla ESLint `no-restricted-imports` que prohíba `@/features/X/hooks/*` desde feature distinto, y prohíba `@/integrations/supabase` desde `pages/` o `components/`. Hace cumplir mecánicamente los pasos 2 y 7.

9. **[OPCIONAL] Resolver los 3 `TODO/FIXME`** restantes.

10. **[OPCIONAL] Auditoría de re-renders** en dashboard (varios `useMemo` ya, pero conviene perfilar con React DevTools después del paso 1).

---

## Métricas objetivo post-refactor

| Métrica | Hoy | Meta |
|---|---|---|
| Archivos de negocio >150 LOC | 28 | 0 |
| Hooks >80 LOC | 20 | <5 |
| Cálculos de `balance` duplicados | 6 | 1 |
| Imports cruzados `invoices → *` | 7 features | ≤3 features (vía contratos) |
| Reglas ESLint de arquitectura | 0 | 2 |

Cuando confirmes, propongo arrancar por el **paso 1** (mayor ROI: cierra una familia entera de bugs financieros).
