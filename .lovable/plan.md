# Plan v6.1.5 — Quinta oleada de reducción de complejidad

Continúa el paso 12 del plan original (política cero-warnings). Hoy quedan **22 warnings** ESLint (0 errores). Este plan cierra los **12 más críticos** (complejidad ≥14 o >150 LOC) y deja sólo los warnings <14 para una oleada final.

## Archivos a refactorizar (ordenados por severidad)

| # | Archivo | Métrica | Estrategia |
|---|---|---|---|
| 1 | `features/maintenance/pages/MaintenancePage.tsx` | complejidad 18 | Extraer dialogs (delete/edit/cost) y filtros a sub-componentes. |
| 2 | `features/contracts/pages/ContractDetail.tsx` | 17 | Extraer ContractDetailDialogs + ContractDetailHeader. |
| 3 | `features/operations/components/operations/FiscalDataTab.tsx` | 16 (async) | Extraer `handleSubmit` a helper + reducir `||` con `??`. |
| 4 | `features/deliveries/pages/DeliveryDetail.tsx` | 16 | Extraer DeliverySignatureBlock + DeliveryHistoryBlock. |
| 5 | `features/bookings/pages/BookingForm.tsx` | 16 | Mover lógica de prefill/submit ya en hook; extraer FormSections. |
| 6 | `features/crm/components/ProspectFormDialog.tsx` | 16 | Aislar campos en ProspectFormFields. |
| 7 | `features/quotes/pages/QuoteDetail.tsx` | 16 | Extraer QuoteDetailDialogs (delete/convert/email). |
| 8 | `features/users/components/users/SetPasswordDialog.tsx` | 15 | Mover validación remanente y handler a hook `useSetPasswordForm`. |
| 9 | `features/users/pages/UserManagementPage.tsx` | 169 LOC | Extraer `UsersTableSection` y `UsersInviteSection`. |
| 10 | `layouts/RoleGuard.tsx` | 14 | Consolidar guard reasons restantes en helper. |
| 11 | `features/crm/components/ProspectCard.tsx` | 14 | Extraer `ProspectCardMeta` + helpers de color. |
| 12 | `features/customers/pages/CustomersPage.tsx` | 14 (arrow line 92) | Extraer `customerRowMatchesFilters` puro. |

Los restantes 10 warnings (complejidad 13: `useDataTableState`, `DeleteAuditLogDialog`, `BookingDetail`, `ContractPDFButton`, `useDashboardSections`, `Dashboard`, `EquipmentAssignmentDialog`, `InvoiceDetailActions`, `ReportsPage`, `AuditDiffTables` fast-refresh) se atacarán en **v6.1.6** para mantener PRs verificables.

## Patrón de refactor (consistente con v6.0.1–v6.1.4)

1. Extraer **sub-componentes puros de presentación** para bloques de JSX condicional repetido (Header, Dialogs, Sections).
2. Extraer **helpers puros** (`buildX`, `mapXtoY`, predicados) a `lib/` o adyacentes con tipo explícito.
3. Sustituir `||` por `??` cuando el operando puede ser `0`/`""` válido.
4. Consolidar early-returns y derivar booleanos antes del JSX.
5. Mantener **fast-refresh limpio**: componentes en archivos sólo-componente; constantes/helpers en archivos `*Helpers.ts` o `*Constants.ts`.

## Detalle técnico clave

- **MaintenancePage**: ya usa `useMaintenanceKanban`; el ruido viene de 3 dialogs inline + 4 filtros. Crear `MaintenancePageDialogs` + `MaintenancePageFilters`.
- **ContractDetail**: bloque de PDF/email/delete dialogs + clauses → `ContractDetailDialogs`, `ContractClausesSection`.
- **FiscalDataTab**: el handler async tiene cadena `?? || ?? ||`. Extraer `buildFiscalPayload(formValues)` puro.
- **DeliveryDetail**: bloques de firma y horómetro → componentes.
- **UserManagementPage**: superando 150 LOC; extraer tabla + acciones masivas.
- **SetPasswordDialog**: ya extrajimos `validatePassword`; queda lógica de submit/UI. Mover a hook `useSetPasswordForm` con `isValid`, `errors`, `onSubmit`.

## Verificación

- `bunx vitest run` (esperado: 48/48 PASS).
- `npx eslint src` (esperado: ≤10 warnings, 0 errores).
- Sin cambios funcionales: ninguna ruta, prop pública ni endpoint se modifica.

## Changelog

Agregar `v6.1.5` (patch, refactor) al inicio de `public/changelog.json` y crear `public/changelog/v6.1.5.json` con métricas before/after.

## Riesgos

- Bajo: refactor puro de presentación + helpers puros. Los componentes extraídos mantienen mismas props que el JSX inline original. Cobertura de tests no toca estos archivos directamente, pero las páginas siguen renderizando los mismos hooks/queries.
