# Auditoría Arquitectónica — Reporte (sin cambios de código)

Alcance: ~280 archivos TS/TSX, 88 hooks, 46 páginas. La arquitectura ya está madura (capa de hooks por dominio, RPCs, RLS, layout estático, lazy routes, helpers compartidos). Este reporte identifica fricciones residuales y oportunidades, ordenadas por impacto.

## Resumen ejecutivo

**Lo que ya está bien**
- Páginas no importan `supabase` directamente (excepto `AuthPage`, justificado).
- Hooks de dominio bien segmentados (`hooks/quoteDetail`, `hooks/customerDetail`, etc.).
- Helpers transversales consolidados: `rpc.ts`, `lineItems.ts`, `formatMtyDate`, `useListPage`, `useListFilters`.
- PDFs modularizados en `src/lib/pdf/**` con secciones independientes.
- `useEffect` con cleanup ya regularizado.

**Principales focos de mejora** (detalle abajo): 6 componentes con `supabase` inline, 4 páginas que aún concentran filtros + estado de diálogos + render, una capa `lib/` que mezcla utilidades genéricas con dominio, y oportunidades de memoización + dead code.

---

## 1. Lógica fuera de lugar (misplaced logic)

### 1.1 Componentes que llaman a Supabase directamente
Rompen la regla "vistas no hablan con el backend":
- `src/components/bookings/BookingStatusHistory.tsx` — `useQuery` a `audit_logs` inline → mover a `useBookingAuditLogs(bookingId)` en `hooks/bookingDetail/`.
- `src/components/contracts/RentalFinancialSummary.tsx` — query inline → `useContractFinancialSummary`.
- `src/components/invoices/InvoicePDFButton.tsx` (201 LOC) — fetch + composición de PDF → extraer a `hooks/useInvoicePdfDownload.ts` y `lib/pdf/invoice/build.ts`.
- `src/components/quotes/QuotePDFButton.tsx` — mismo patrón → `useQuotePdfDownload`.
- `src/components/company-settings/LogoUploader.tsx` — `supabase.storage` inline → `useUploadCompanyLogo`.
- `src/layouts/CustomerPortalLayout.tsx` — `supabase.auth.signOut()` directo → usar `useAuth().signOut`.

### 1.2 Constantes de dominio dispersas
- `CRMPage.tsx` define `ACTIVE_STAGES`, `VALUE_OPTIONS`, `AGE_OPTIONS` inline. Ya existe `src/lib/constants/crm.ts` → moverlas allí.
- `ReturnInspectionPage.tsx` define `initialForm` (forma del formulario) en el archivo de la página → mover a `hooks/useReturnInspectionForm.ts` o `lib/forms/returnInspectionPayload.ts`.

### 1.3 `src/lib/` mezcla utilidades genéricas con dominio
`lib/` contiene utilidades puras (`utils.ts`, `formatCurrency.ts`, `cn`) junto con dominio (`invoiceUtils.ts`, `activityTranslations.ts`, `templateUtils.ts`, `satCatalogs.ts`). Recomendación: subdividir en `lib/utils/` (puro) y `lib/domain/` (dominio), o mover los archivos de dominio bajo `features/<dominio>/`.

---

## 2. Separación de concerns

### 2.1 Páginas con demasiada responsabilidad
- **`CRMPage.tsx` (294 LOC)** — orquesta 7 `useState`, filtros, métricas, drag-and-drop, render kanban + lista. Ya tiene `useCRMFilters`/`useCRMMetrics`. Falta extraer:
  - `useCRMPage()` orquestador (estado de diálogos, handlers DnD).
  - `<CRMToolbar>` (búsqueda + filtros + toggle vista).
  - `<CRMListView>` separado del kanban.
- **`UserManagementPage.tsx` (218 LOC)** — 8 `useState` para targets de diálogos. Aplicar el patrón de `useCustomerDetailDialogs` → crear `hooks/users/useUserManagementDialogs.ts` y `useUserManagementFilters.ts`.
- **`InvoicesPage.tsx` (207 LOC)** — filtro "overdue" recalculado inline con `parseISO`/`isWithinInterval` → mover a `useListFilters` como predicado custom o a `lib/invoiceUtils.ts`.
- **`ReturnInspectionPage.tsx` (202 LOC)** — `initialForm`, lógica de submit y dialog state en el componente → `hooks/useReturnInspectionPage.ts`.

### 2.2 Páginas detalle aún con `useState` para diálogos
`SupplierDetailPage`, `MaintenancePage`, `OperatingExpensesPage`, `DamageTrackingPage`, `InventoryPage` siguen el patrón antiguo (4–5 `useState` por página). Aplicar `useDialogState`/`useListPage` ya existentes para uniformar.

### 2.3 Hooks "form logic" mezclan estado, validación y mutación
`useQuoteFormLogic`, `useInvoiceFormLogic`, `useForkliftFormLogic`, `useBookingFormLogic` (>120 LOC c/u) ya están parcialmente partidos. Estandarizar el split: `useXFormState` (RHF + defaults) + `useXFormSubmit` (mutación + side-effects) + `useXFormPrefill` (hidratación). El patrón ya existe en `quoteForm/` y `contractForm/`.

---

## 3. Complejidad y best practices

- **`InvoicePDFButton.tsx`** (201 LOC) y **`AppSidebar.tsx`** (207 LOC) son los componentes no-shadcn más grandes. El primero combina fetch + transformación + render del botón; el segundo concentra navegación, branding y permisos. Ambos justifican un split.
- **88 hooks en plano** (sólo 16 sub-carpetas). Hay agrupación por feature en algunos casos pero la raíz `src/hooks/` sigue creciendo. Recomendación incremental: cada vez que un hook nuevo se relacione con un dominio existente, colocarlo en su sub-carpeta (`hooks/invoices/`, `hooks/forklifts/`, `hooks/maintenance/`).
- **Constantes mágicas**: `STATUSES = ["all","draft",...]` en `InvoicesPage` y similares en `BookingsPage`/`QuotesPage`. Deberían vivir junto a `STATUS_LABELS` en `lib/constants.ts`.
- **Memoización pendiente**: `filtered` en `UserManagementPage` y `InvoicesPage` ya usa `useMemo`, pero los `handlers` (`handleEdit`, `handleDelete`) que se pasan a sub-componentes en `CRMPage` y `UserManagementPage` no usan `useCallback` → re-render innecesario de `KanbanColumn`/`UserRow`.
- **`AuthPage.tsx`** importa `supabase` directamente para `signInWithOAuth` (Google). Consistente con la regla, pero merece un wrapper `useGoogleSignIn` para uniformar.

---

## 4. Plan de pasos ordenado (más crítico → opcional)

1. **Mover queries de Supabase fuera de los 6 componentes listados en §1.1.** Crear los hooks correspondientes; impacto inmediato en testabilidad y consistencia.
2. **Refactor `CRMPage` y `UserManagementPage`**: extraer `useXDialogs`/`useXFilters`, mover constantes a `lib/constants/`, dividir vistas (kanban vs lista en CRM).
3. **Refactor `ReturnInspectionPage` e `InvoicesPage`**: mover `initialForm` y el predicado overdue a sus capas (`hooks/`, `lib/invoiceUtils.ts`).
4. **Estandarizar páginas detalle** (`SupplierDetailPage`, `MaintenancePage`, `OperatingExpensesPage`, `DamageTrackingPage`, `InventoryPage`) usando `useDialogState` + `useListPage`.
5. **Subdividir `src/lib/`** en `lib/utils/` (puro) y `lib/domain/` (o `features/<dominio>/lib/`). Mover `invoiceUtils`, `activityTranslations`, `satCatalogs`, `templateUtils`.
6. **Dividir `InvoicePDFButton` y `AppSidebar`**: extraer la lógica de generación PDF a `lib/pdf/invoice/` y la navegación del sidebar a `components/sidebar/{NavSection,SidebarBranding,SidebarFooter}`.
7. **Estandarizar hooks de formulario** en el triplete `state/prefill/submit` para `useInvoiceFormLogic`, `useForkliftFormLogic`, `useBookingFormLogic`.
8. **Reorganizar `src/hooks/` por dominio** moviendo hooks raíz a sub-carpetas (`hooks/invoices/`, `hooks/forklifts/`, `hooks/maintenance/`, `hooks/users/`).
9. **Memoización fina**: `useCallback` en handlers que se pasan a `KanbanColumn`, `ProspectCard`, filas de `UserManagementPage`.
10. **(Opcional)** Adoptar estructura `features/<dominio>/{components,hooks,lib,pages}` a largo plazo. Sería un cambio de gran superficie pero bajo riesgo si se hace módulo por módulo, empezando por CRM o Invoices.

## Detalle técnico

- Convención de hooks: el patrón actual `useXDetailLogic = data + state + actions` (ver `useQuoteDetailLogic`) funciona y debe replicarse en CRM y UserManagement.
- Capa PDF: `lib/pdf/contract/` ya está bien partida (sections + fetchers + page builder). Replicar para invoice y quote.
- No se requieren migraciones de DB ni cambios de RLS para ninguno de estos pasos.
- Cada paso debe acompañarse de su entrada en `public/changelog/` (regla del proyecto).
