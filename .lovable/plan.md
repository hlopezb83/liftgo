# Grupo C arquitectura — pendientes tras v7.212.0

Estado real verificado:
- C1 ✅ (v7.211/212, ciclos rotos)
- C2 ❌ 6 archivos en `src/lib/pdf|rules` importan `@/features`
- C3 ❌ 6 edge functions con auth inline (delete-user, toggle-user-status, invite-customer, invite-user, generate-invoice-pdf, generate-recurring-maintenance)
- C4 ❌ 9 `queryKey: ["..."]` literales + `company_settings` leída con 9 namespaces distintos
- C5 ❌ RPCs `delete_booking` / soft-delete financiero
- C6 ❌ 15 `select("*")` restantes
- C7 ❌ headers canónicos en las 4 funciones más redefinidas
- C8 ❌ tests de users/auth/returns/calendar
- C9 ❌ 3 formularios divergentes → RHF+zod
- C10 (opcional, no lo tomo salvo aprobación)
- C11 ❌ 55 archivos con `formatDateDisplay` + cosméticos

## Plan de entrega (4 lotes, uno por versión)

### Lote D — v7.213.0 · C2 completo
Objetivo: `src/lib` deja de importar `@/features`.

1. Nuevo `src/lib/pdf/types.ts` con DTOs puros: `ContractPdfData`, `StatementPdfData`, `IncomeStatementPdfData`.
2. Los 6 archivos PDF (`contract/data-templates.ts`, `contract/fetchers.ts`, `documents/CustomerStatementDocument.tsx`, `documents/IncomeStatementDocument.tsx`, `customerStatement.tsx`, `incomeStatement.tsx`) sólo consumen DTOs de `./types` — se elimina todo `import … from "@/features/…"`.
3. `contract/fetchers.ts` (hook de datos con dependencias de features) se mueve a `src/features/contracts/lib/contractPdfFetchers.ts`; los callers mapean modelo → DTO antes de invocar renderers.
4. `src/lib/rules/invoices.ts`: confirmar que `computeInvoiceFlags` lee balance desde `v_invoices_with_balance` (NC-aware). Si calcula `total − paid` inline, corregir.

Aceptación: `rg "@/features" src/lib --glob='!**/__tests__/**' -l` → 0.

### Lote E — v7.214.0 · C3 + C4
1. **C3**: migrar las 6 edge functions a `_shared/auth.ts::requireServiceOrRole` y `_shared/cronAuth.ts` (para `generate-recurring-maintenance`). Borrar el bloque copiado (~25 líneas) en cada una.
2. **C4.1**: reemplazar los 9 `queryKey: ["..."]` literales por las factories `createEntityKeys` correspondientes.
3. **C4.2**: crear `src/features/settings/lib/companySettingsQueries.ts` con `companySettingsKeys` + `defineEntityQueries` y hooks derivados (`useFiscalSettings`, `useBillingSettings`). Migrar los 9 lectores a la query única.
4. **C4.3**: verificar `computeInvoiceFlags` (queda cubierto por Lote D si aplica).

Aceptación: `rg 'getClaims' supabase/functions --glob='!_shared/**' --glob='!**/*_test.ts'` → 0; `rg 'queryKey: \["' src/features --glob='!**/queryKeys*'` → 0; una sola query de `company_settings` visible en DevTools.

### Lote F — v7.215.0 · C6 + C11 cosmético + C7
1. **C6**: para cada uno de los 15 `select("*")`, definir `<ENTITY>_COLUMNS` en el `queryKeys/lib` del feature y `.returns<T>()`. Priorizar `company_settings`, `billing_secrets`, `profiles`, luego `invoices`, `bookings`, `forklifts`.
2. **C11.1**: renombrar `formatDateDisplay` → `formatDateMty` en los 55 archivos; añadir a `no-restricted-imports` el alias legacy para que no vuelva a crecer.
3. **C11.2-6**: borrar archivos muertos reportados por knip (CardListSkeleton, FormSkeleton, DetailLayout, ListToolbar), actualizar README (React 19 + Vite 8), `SET search_path = public` en `set_prospect_created_by`, mover `useCustomerPortal` a portal y `CustomerPortalRoutes` a `src/routes/`, unificar `FeedbackStatusBadge`/`RepBadge` en `StatusBadge`.
4. **C7**: añadir header canónico (tag + razón) a las migraciones de `get_dashboard_stats`, `get_income_statement`, `create_booking`, `get_portal_invoices`; añadir regla en `CLAUDE.md`.

Aceptación: `rg 'select\("\*"\)' src/` → 0 o allowlist justificada; `bunx knip` sin unused files; build verde.

### Lote G — v7.216.0 · C5 + C8 + C9
1. **C5**: RPC `delete_booking(uuid)` con `FOR UPDATE`, validación de estado (`draft/cancelled`), log en `booking_status_logs`, liberación de unidad si no hay otra renta activa. Añadir `deleted_at` (si falta) a `invoices`, `credit_notes`, `supplier_payments` + RPC `delete_*` con `audit_log` y exclusión en vistas/RPCs.
2. **C8**: tests nuevos en `features/users` (hooks de roles/permisos), `features/auth` (AuthContext + guards), `features/returns` (early return, idempotencia, validación temporal), `features/calendar` (mapeo de eventos/rangos). Plantilla: tests de dinero/fiscal.
3. **C9**: migrar `useProspectForm`, `InviteUserDialog` y tabs de operations al patrón RHF + zod + FormField. Schema de prospecto con `z.string().email()` real y regex compartidas de `lib/schemas/common.ts`.

Aceptación: tests verdes (incluye nuevos); eliminar booking en borrador libera unidad y registra audit; formularios validan email real.

### Fuera de alcance
- C10 (realtime en calendar/kanban) — sólo si se aprueba explícitamente por costo de sockets.

## Cierre por lote
Cada lote termina con: bump de versión, entrada en `public/changelog.json` + detalle en `public/changelog/v7.X.Y.json`, `bun run lint` + `bunx tsgo` + `vitest` verdes, y `bunx knip --include files,dependencies,binaries --reporter compact` sin regresiones.
