## Auditoría arquitectónica del codebase (sin cambios aplicados)

Esta es una **auditoría diagnóstica**. No se modifica código; al final hay una lista priorizada de pasos de refactor.

---

## 1. Separación de responsabilidades

### Hallazgos positivos
- Capa de **hooks de dominio** muy bien establecida: `useForklifts`, `useBookings`, `useInvoices`, etc. encapsulan acceso a datos vía TanStack Query.
- `src/lib/` está dividido por concern (PDFs, formularios, constantes, formatters).
- Subcarpetas por feature en `src/components/` y subcarpetas de hooks por página (`hooks/quoteForm/`, `hooks/invoiceDetail/`).

### Problemas detectados
1. **Páginas con acceso directo a Supabase** (rompe la regla de "hooks = data, pages = UI"):
   - `src/pages/DamageTrackingPage.tsx` — query inline `documents` para conteo de fotos.
   - `src/pages/ForkliftDetail.tsx` — query inline de ubicación.
   - `src/pages/AuthPage.tsx` — uso aceptable (auth flow) pero conviene aislarlo en `useAuthActions`.
2. **Lógica de permisos en `CRMPage.tsx`**: validaciones de rol con `toast` repetidas tres veces inline (líneas 75, 94, 189). Debería estar en un guard reutilizable o dentro de `useProspectActions`.
3. **Páginas grandes (>200 líneas) que mezclan UI + estado + reglas**:
   - `MaintenancePage.tsx` (261), `OperatingExpensesPage.tsx` (256), `DeliveriesPage.tsx` (227), `UserManagementPage.tsx` (220), `ReturnInspectionPage.tsx` (202), `CRMPage.tsx` (202).
   - Patrón: filtros + paginación + sort + handlers de diálogos viven todos en la página.
4. **`ChangelogPage.tsx` (271 líneas)** mezcla parsing, filtrado, agrupación y render. La lógica debería vivir en `useChangelog` (que ya existe pero está infrautilizado).

---

## 2. Acoplamiento y duplicación

1. **Patrón filtros+paginación+sort repetido**: todas las páginas tipo lista replican la misma estructura. Existe `useListPage` pero solo se usa parcialmente. Hay **>10 páginas** que reimplementan el mismo combo (`useListFilters` + `useSort` + `usePagination` + `useIsMobile`) en lugar de usar el hook combinado.
2. **`format(parseISO(...), 'dd/MM/yyyy')`** disperso en componentes en vez de usar un helper único `formatMtyDate`. `nowMty` ya está centralizado, falta el equivalente para display.
3. **Casts `as unknown as` para tipos de Supabase**: 25+ ocurrencias en hooks (`useDashboardStats`, `useFinancialKpis`, `useCustomerSummary`, `useMrrDetail`, `useContractTemplates`, etc.). Síntoma de que las RPCs no tienen tipos generados — falta una capa `src/types/rpc.ts` con interfaces compartidas y un wrapper `callRpc<T>()`.
4. **`as unknown as Json` para `line_items`/`rental_meta`** en `useQuoteFormLogic`, `useInvoiceFormLogic`, `useQuoteDetailData`. Patrón candidato a un helper `serializeLineItems()` / `parseLineItems()` en `src/lib/lineItems.ts`.
5. **PDFs**: `src/lib/pdf/quote/`, `src/lib/pdf/contract/`, `src/lib/pdf/customerStatement/` y `src/lib/pdf/incomeStatement/` reimplementan `formatCurrency`/header/footer en lugar de consumir `pdf/shared.ts`.
6. **Componentes grandes que deberían dividirse**:
   - `components/operations/ContractTemplateTab.tsx` (239) — debería separarse en formulario + render.
   - `components/calendar/GanttChart.tsx` (236) — UI + cálculo de días + tooltips juntos.
   - `components/customers/CustomerFormDialog.tsx` (232) — formulario monstruo (CSF + dirección + facturación).
   - `components/dashboard/AlertsRow.tsx` (196) — agregación de alertas + render.
   - `components/maintenance/MaintenanceKanban.tsx` (183) — drag&drop + columnas + tarjetas.

---

## 3. Type safety y mejores prácticas

1. **`useUserRole.ts:18`** usa `user!.id` (forbidden por la regla de no-`!`). Único caso real de non-null assertion fuera de tests.
2. **`SignaturePad.tsx`** usa `canvasRef.current!` tres veces. Refactor: guard con early return.
3. **`ExpenseFormDialog.tsx`** `undefined as unknown as number` para defaults — debería ser `null` con Zod refinement.
4. **Test file `InvoicesPage.test.tsx`** usa `paidRow!.textContent` — aceptable en tests pero podría limpiarse.
5. **No hay barrel exports** en `src/components/ui` ni en `src/hooks` — imports largos `@/components/ui/select`. Aceptable, pero mover a barrels reduciría ruido. (Trade-off: peor tree-shaking.)
6. **`useMutation` con error handling inconsistente**: algunos hooks lanzan `throw error`, otros `toast.error` directo. Falta un wrapper común `useDomainMutation` que centralice el toast vía sonner (que ya es la regla del proyecto).

---

## 4. Organización de archivos

1. **`src/components/CustomerPortalRoutes.tsx`** está en raíz; debería estar en `src/layouts/` o `src/pages/portal/`.
2. **`src/components/AppProviders.tsx`** — bien ubicado, pero `AuthGuard.tsx`, `RoleGuard.tsx`, `ErrorBoundary.tsx` podrían vivir en `src/components/auth/` y `src/components/system/`.
3. **`src/lib/routes.ts` + `src/lib/routes-config.tsx`**: dos archivos para el mismo concept. Consolidar en `src/lib/routes/`.
4. **`src/hooks/`** raíz tiene 60+ archivos. Conviene crear subcarpetas por dominio (`hooks/forklifts/`, `hooks/invoices/`, etc.) — ya existe el patrón en `hooks/quoteDetail/` pero solo para hooks específicos de página.
5. **`src/types/rental.ts`** — único archivo en `types/`; faltan tipos compartidos de RPCs, line_items, etc.

---

## 5. Performance / patrones

1. Algunos `useMemo` en reportes (`UtilizationReport`, `RevenueReport`) reciben `columns` inline sin memoizar — ya optimizado parcialmente con `DataTable.memo` + `columnsKey` interno, pero el caller seguiría re-creando arrays.
2. **AuthGuard** ya no hace doble fetch (corregido en v5.26.0). OK.
3. `console.error` solo en `NotFound` y `ErrorBoundary`. OK.

---

## Plan de refactor priorizado

### Crítico (correcciones de regla / seguridad de tipos)
1. **Eliminar `user!.id` en `useUserRole.ts`** y `canvasRef.current!` en `SignaturePad.tsx`.
2. **Mover queries Supabase de `DamageTrackingPage` y `ForkliftDetail` a hooks** (`useDamagePhotoCounts`, `useForkliftLocation`).
3. **Centralizar guard de permisos CRM**: `useProspectGuard()` que reemplace los tres `toast` inline en `CRMPage`.

### Alto (reducción de duplicación estructural)
4. **Crear `src/lib/rpc.ts`** con `callRpc<TResult>(name, args)` que tipa el resultado y elimina los `as unknown as` en 10+ hooks de RPC.
5. **Crear `src/lib/lineItems.ts`** con `parseLineItems(json)` / `serializeLineItems(items)` y reemplazar los casts en quote/invoice form/detail hooks.
6. **Adoptar `useListPage` en todas las páginas tipo lista** (`MaintenancePage`, `DeliveriesPage`, `ReturnInspectionPage`, `CRMPage`, `DamageTrackingPage`). Reduce ~30 líneas de boilerplate por página.
7. **Crear `formatMtyDate(date, fmt?)`** en `src/lib/utils.ts` y migrar los `format(parseISO(...))` dispersos.

### Medio (modularización)
8. **Dividir páginas >200 líneas** extrayendo:
   - `MaintenancePage` → `useMaintenancePageState` + `MaintenanceFiltersBar` + `MaintenanceKanbanView`.
   - `OperatingExpensesPage` → `useOperatingExpensesFilters` + `ExpensesTableView`.
   - `CRMPage` → `useCrmBoardState` + `CrmBoardView`.
   - `ChangelogPage` → mover parsing/agrupado a `useChangelog`.
9. **Dividir componentes >200 líneas**: `GanttChart`, `CustomerFormDialog`, `ContractTemplateTab`, `AlertsRow`.
10. **Reorganizar `src/hooks/`** en subcarpetas por dominio (`hooks/forklifts/`, `hooks/invoices/`, etc.).
11. **Consolidar `src/lib/routes.ts` + `routes-config.tsx`** en `src/lib/routes/`.

### Bajo (limpieza)
12. **Mover `CustomerPortalRoutes.tsx`** a `src/pages/portal/` o `src/layouts/`.
13. **Crear `src/components/system/`** para `ErrorBoundary`, `AuthGuard`, `RoleGuard`, `PageTransition`.
14. **`useDomainMutation` wrapper** para estandarizar toasts/errores en mutations (complementa la regla de error handling global con sonner).
15. **Refactor `ExpenseFormDialog`** para usar `null` + Zod en lugar de `undefined as unknown as number`.

### Opcional (mejoras estéticas)
16. Añadir barrel exports `src/components/ui/index.ts` (evaluar impacto en bundle).
17. Crear `src/types/rpc.ts`, `src/types/lineItems.ts`, `src/types/dashboard.ts` consolidando interfaces hoy esparcidas en hooks.
18. Convertir reportes (`reports/*Report.tsx`) a memoizar `columns` con `useMemo` para aprovechar el `React.memo` ya añadido a `DataTable`.

---

## Resumen ejecutivo
El codebase tiene una **arquitectura sólida y consistente** (capa de hooks, separación por feature, design system, RLS, RPCs transaccionales). Los problemas son de **deuda incremental**: páginas grandes que crecieron sin extraer state, casts de tipos por RPCs sin tipar, y micro-duplicaciones en formato de fechas/PDFs.

**Prioridad recomendada**: ejecutar primero los pasos 1–3 (correcciones de regla), luego 4–7 (reducir duplicación con utilidades pequeñas), y finalmente 8–10 (modularización profunda).
