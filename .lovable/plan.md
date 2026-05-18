# Auditoría de Arquitectura — Post-refactor v6.0.0

Análisis read-only del estado actual tras la consolidación de `features/`, `layouts/` y `lib/domain/`. La base está **notablemente limpia**: 0 errores de ESLint, 0 componentes de dominio en `src/components/`, 0 imports de `supabase/client` fuera de hooks/lib/contexts. Los hallazgos restantes son afinaciones, no problemas estructurales.

## Estado general

| Métrica | Valor | Salud |
|---|---|---|
| Archivos > 150 LOC (excl. UI/types) | 28 | 🟡 |
| Hooks > 80 LOC | ~6 | 🟡 |
| ESLint warnings | 56 (0 errores) | 🟡 |
| Knip — exports muertos | 9 | 🟢 |
| Knip — tipos muertos | 10 | 🟢 |
| `useQuery/Mutation` fuera de hooks | 2 archivos | 🟡 |
| `supabase/client` fuera de capa de datos | 2 (`AuthContext`, `AuthPage`) | 🟢 (legítimo) |
| Páginas duplicadas `pages/` ↔ `features/` | 0 | 🟢 |
| Shims hooks/components | 0 | 🟢 |

## Hallazgos

### 1. Lógica de datos acoplada a vistas (2 casos)
- **`src/features/maintenance/components/maintenance/MaintenanceKanban.tsx`** — usa `useQuery`/`useMutation` directo. Viola el patrón "el hook posee los datos". Debe extraerse a `useMaintenanceKanban()` en `features/maintenance/hooks/`.
- **`src/layouts/NoAccess.tsx`** — invoca `useQuery` para resolver módulo/rol. Aceptable porque es un layout chrome muy delgado, pero idealmente debería usar `useUserRole()` + `useRolePermissions()` ya existentes.

### 2. Archivos cerca o por encima del límite (150 LOC componente / 80 LOC hook)

**Componentes a partir candidatos:**
| Archivo | LOC | Recomendación |
|---|---|---|
| `src/components/DataTable.tsx` | 301 | Separar `DataTableHeader`, `DataTableBody`, `DataTablePagination`. |
| `features/crm/components/ProspectDetailSheet.tsx` | 244 | Extraer secciones (Header, History, Actions). |
| `features/users/pages/UserManagementPage.tsx` | 210 | Mover filas/filtros a sub-componentes. |
| `pages/HelpPage.tsx` | 188 (complejidad 20) | Extraer `HelpSidebar`, `HelpContent`, `HelpVersionSelector`. |
| `features/crm/pages/CRMPage.tsx` | 182 | Separar Kanban vs filtros. |
| `features/quotes/components/quotes/AssignForkliftsCard.tsx` | 178 | Extraer filas y selector. |
| `features/operations/components/operations/MaintenancePoliciesTab.tsx` | 178 | Separar lista y formulario. |
| `features/suppliers/components/suppliers/SupplierFormDialog.tsx` | 171 | Sub-componentes por sección. |
| `features/feedback/components/FeedbackFormDialog.tsx` | 162 | Extraer captura de screenshot y campos. |
| `features/expenses/components/expenses/ExpenseFormDialog.tsx` | 159 | Sub-secciones. |

**Hooks por encima de 80 LOC:**
| Hook | LOC | Recomendación |
|---|---|---|
| `features/quotes/hooks/quoteDetail/useQuoteConversionActions.ts` | 195 | Dividir por workflow: `useQuoteToBookings`, `useQuoteToSale`, `useDeliveryQueue`. |
| `features/users/hooks/useUserManagement.ts` | 163 | Separar invite/role/delete. |
| `features/quotes/hooks/useQuoteFormLogic.ts` | 159 | Aislar submit, prefill, validation. |

### 3. Páginas que viven fuera de su feature
- **`src/pages/HelpPage.tsx`** — ya tiene `useUserManual` propio; mover a `features/help/pages/` y crear `features/help/`.
- **`src/pages/AuthPage.tsx`** (complejidad 15) — usa `supabase/client` directo (legítimo para auth flows); aceptable en `pages/` o mover a `features/auth/`.
- **`src/pages/portal/*` (6 archivos)** — son un feature completo "Portal del cliente". Migrar a `features/portal/pages/` para consistencia.

### 4. Configuración Knip desactualizada
La salida sugiere 7 limpiezas en `knip.json` (entradas redundantes, `@types/node`, patterns `supabase/functions/**` y `scripts/**` ya cubiertos por defaults).

### 5. Exports/Tipos muertos detectados por Knip
9 exports + 10 tipos sin uso. Lista exacta abajo en sección técnica. Eliminación segura.

### 6. Complejidad ciclomática alta (ESLint)
4 funciones superan el límite 12:
- `src/lib/pdf/quote/table.ts::drawPremiumTable` — 18
- `src/pages/HelpPage.tsx::HelpPage` — 20
- `src/pages/portal/PortalDashboard.tsx::PortalDashboard` — 17
- `src/pages/AuthPage.tsx::AuthPage` — 15

### 7. Otros warnings (52 restantes)
Mayormente `no-explicit-any` y `react-hooks/exhaustive-deps` heredados. Objetivo cero-warnings está pendiente.

### 8. Subdirectorio innecesario en components
`features/maintenance/components/maintenance/` y similares duplican el nombre del feature en la ruta (`features/maintenance/components/maintenance/`). Patrón actual del proyecto, pero podría plano-izarse a `features/maintenance/components/` (estilo opcional, no crítico).

## Plan de acción ordenado

### 🔴 Crítico (deuda activa, riesgo bajo)
1. **Extraer queries de `MaintenanceKanban` a un hook** (`useMaintenanceKanban`).
2. **Migrar `NoAccess` a hooks existentes** (`useUserRole` + `useRolePermissions`), eliminar `useQuery` inline.
3. **Eliminar exports/tipos muertos** reportados por Knip (9 + 10).

### 🟠 Alto valor (refactors de tamaño)
4. **Dividir `useQuoteConversionActions` (195 LOC)** en 3 hooks por workflow.
5. **Dividir `DataTable.tsx` (301 LOC)** en Header/Body/Pagination.
6. **Refactorizar `HelpPage` (188 LOC, complejidad 20)** y mover a `features/help/`.
7. **Dividir `useUserManagement` (163)** y `useQuoteFormLogic` (159) por responsabilidad.

### 🟡 Medio (limpieza estructural)
8. **Migrar `src/pages/portal/*` → `src/features/portal/pages/*`** para consistencia con el resto del proyecto.
9. **Reducir complejidad** de `drawPremiumTable`, `AuthPage`, `PortalDashboard` por debajo de 12.
10. **Limpiar `knip.json`** según las 7 hints (entradas redundantes y dependencias ignoradas innecesarias).

### 🟢 Opcional (calidad incremental)
11. **Refactorizar componentes 150–250 LOC** restantes (ProspectDetailSheet, UserManagementPage, CRMPage, AssignForkliftsCard, MaintenancePoliciesTab, SupplierFormDialog, FeedbackFormDialog, ExpenseFormDialog).
12. **Política cero-warnings**: resolver los 52 warnings restantes (`no-explicit-any`, `exhaustive-deps`) en oleadas por feature.
13. **Aplanar** `features/<x>/components/<x>/` → `features/<x>/components/` (decisión de estilo, alto churn).

## Detalle técnico

### Hooks/imports que necesitan extracción
```
features/maintenance/components/maintenance/MaintenanceKanban.tsx  → useMaintenanceKanban
layouts/NoAccess.tsx                                                → usar useUserRole/useRolePermissions
```

### Exports muertos (Knip)
```
ACTIVE_STAGE_KEYS, CLOSED_STAGE_KEYS         src/features/crm/lib/constants.ts
FINAL_STATUSES                                src/features/feedback/lib/constants.ts
MultiForkliftSelector                         src/features/fleet/components/fleet/ForkliftSelector.tsx
useDeleteSupplier                             src/features/suppliers/hooks/useSuppliers.ts
getModuleForPath                              src/features/users/hooks/useRolePermissions.ts
useInvoicePaymentsTotal                       src/hooks/usePayments.ts
GRAY_400                                      src/lib/pdf/quote/constants.ts
createChainableQuery                          src/test/helpers/mockSupabase.ts
```

### Tipos muertos
```
ChangelogEntry, ActivityEntry, FeedbackHistoryEntry, ReporterType,
AssignedForklift, MaintenancePart, BookingFormInput, SupplierFormData,
MockSupabaseClient, StatusLog
```

### Recomendación de orden de ejecución
Ejecutar 1–3 en una sola PR (`v6.0.1` patch), 4–7 en otra (`v6.1.0` minor), 8–10 en otra (`v6.2.0` minor). Las opcionales 11–13 conviene calendarizarlas por feature.

---

¿Procedo con los pasos **🔴 Críticos (1–3)** primero, o prefieres otro punto de partida?
