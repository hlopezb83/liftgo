# Plan: Migrar todas las llamadas existentes a `notifyError` / `notifyWarning`

## Contexto

En `6.14.9` restauramos el sistema de "Ver detalles" en errores y lo cableamos globalmente en `AppProviders` (TanStack Query). Esto ya cubre **automáticamente** todos los errores de queries/mutaciones que no manejen su propio `onError`.

Sin embargo, el código aún tiene:
- **120 llamadas** a `toast.error(...)` en **74 archivos**
- **3 llamadas** a `toast.warning(...)` en 3 archivos
- (106 `toast.success` se mantienen como están — no son errores)

Estas llamadas locales **ganan** sobre el handler global y por lo tanto **no muestran botón "Ver detalles"**. El objetivo es migrarlas para que todos los errores tengan reporte estructurado.

## Estrategia

Migrar en **3 olas** ordenadas por riesgo, no todo de golpe. Cada ola = 1 commit + entrada de changelog.

### Ola 1 — Mutations/hooks de dominio (alto valor, bajo riesgo)
Hooks que ya tienen `onError` con `toast.error(err.message)`. Son los más útiles porque suelen ser errores de Supabase/RPC con códigos traducibles.

Archivos (≈45):
- `src/features/users/hooks/**` (useToggleStatus, useResetPassword, useInviteUser, useUserMutations)
- `src/features/bookings/hooks/**` (useBookingMutations, useBookingExtensions, useBookingActionsLogic)
- `src/features/expenses/hooks/expenseMutations/**`
- `src/features/maintenance/hooks/maintenance/**`
- `src/features/invoices/hooks/invoices/**` (useStampCfdi, useCancelCfdi, useInvoices, useCollectionNotes, useGenerateRecurringInvoices, useInvoicePdfDownload)
- `src/features/quotes/hooks/**`
- `src/features/fleet/hooks/**`
- `src/features/crm/hooks/**`
- `src/features/customers/hooks/**`
- `src/features/damage/hooks/**`
- `src/features/returns/hooks/**`
- `src/features/deliveries/hooks/**`
- `src/features/suppliers/hooks/**`
- `src/features/feedback/hooks/**`
- `src/features/contracts/hooks/**`
- `src/features/inventory/hooks/**`
- `src/features/help/hooks/**`
- `src/features/changelog/hooks/**`
- `src/features/audit/hooks/**`
- `src/features/company-settings/hooks/**`

Reemplazo típico:
```ts
// antes
onError: (err) => toast.error(err.message)
// después
onError: (error) => notifyError({ error, phase: "mutation", context: { hook: "useX" } })
```

Y agregar `meta: { silent: true }` al `useMutation` para evitar doble toast desde el handler global.

### Ola 2 — Componentes con validaciones síncronas / acciones puntuales
Validaciones de formulario, errores de archivo, PDFs, etc. (≈25 archivos):
- `src/features/operations/components/operations/*Tab.tsx`
- `src/features/customers/components/customers/CsfDropzone.tsx`
- `src/features/invoices/components/invoices/RecordPaymentDialog.tsx`
- `src/features/invoices/components/invoice-detail/EditPaymentDialog.tsx`
- `src/features/maintenance/components/maintenance/MaintenancePartsSection.tsx`
- `src/features/bookings/components/bookings/PostBookingPolicyDialog.tsx`
- `src/features/contracts/components/contracts/ContractPDFButton.tsx`
- `src/features/changelog/components/changelog/ChangelogEntryCard.tsx`
- `src/features/reports/components/reports/IncomeStatementReport.tsx`
- `src/features/suppliers/components/suppliers/SupplierFormDialog.tsx`
- `src/components/DragDropImageUploader.tsx`
- `src/layouts/sidebar/ChangePasswordDialog.tsx`
- Páginas: `RolePermissionsPage`, `ForkliftDetail`, `CustomerDetailPage`, `AuthPage`, `PortalLogin`
- Hooks UI: `useReportDamageForm`, `useContractFormLogic`, `useInvoiceFormLogic`, `useReturnInspectionDialog`, `useForkliftFormSubmit`, `quoteFormValidation`

Para validaciones puras de UI (ej. "Selecciona un cliente"), usar `notifyWarning` en lugar de `notifyError` cuando aplique.

### Ola 3 — Casos especiales
- `toast.warning` (3 llamadas) → `notifyWarning`
- Revisar `useUserManual.ts`, `useAuditLogs.ts` y cualquier toast dentro de `try/catch` con lógica compuesta
- Verificar que `ErrorDetailsDialog.tsx` y `appFeedback.ts` se excluyen (son internos del sistema)

## Detalles técnicos

### Codemod asistido
Para acelerar, usar un script Node/ripgrep que detecte patrones simples:

```text
PATRÓN A → onError: (err) => toast.error(err.message)
REEMPLAZO → onError: (error) => notifyError({ error, phase: "mutation" })

PATRÓN B → toast.error(`...${err.message}`)
REEMPLAZO → notifyError({ error: err, message: `...` })

PATRÓN C → toast.error("mensaje fijo")
REEMPLAZO → notifyError({ message: "mensaje fijo", phase: "ui" })
```

El codemod hace el reemplazo + añade import de `notifyError`. Cada archivo se revisa manualmente antes de commit.

### Convención `meta: { silent: true }`
Cualquier `useMutation` que defina su propio `onError` con `notifyError` debe llevar `meta: { silent: true }` para que el handler global no dispare un segundo toast. Documentarlo en un comentario JSDoc en `appFeedback.ts`.

### Verificación
1. `npm run lint` limpio
2. `knip` sin nuevos huérfanos
3. `rg "toast\.error" src` → solo debe quedar `appFeedback.ts` y `ErrorDetailsDialog.tsx`
4. Smoke test manual:
   - Forzar error 400 en eliminar usuario → ver detalles ✓
   - Validar cotización vacía → warning con detalles ✓
   - Error en RPC de booking → ver SQL/código ✓

### Changelog
Una entrada **minor `6.15.0`** al final (no patch por ola), con resumen:
> Migrado el sistema de notificaciones a `notifyError/notifyWarning` en 74 archivos. Todos los errores ahora tienen botón "Ver detalles" con reporte estructurado (stack, contexto, código Postgres traducido).

## Fuera de alcance

- Migrar `toast.success` (no requieren reporte de error)
- Refactorizar mensajes de error en sí (solo cambiar el wrapper)
- Investigar la causa raíz del `400 Failed to delete user` (tarea separada)

## Entregables

- 3 commits (uno por ola) + changelog `6.15.0`
- Script de codemod descartable en `/tmp` (no se versiona)
- 0 llamadas residuales a `toast.error/warning` fuera del sistema de feedback
