# Estado de `liftgo-diffs-lovable-arquitectura-2.md`

## Cerrados
- **DIFF 1** cron declarado (v7.204.0)
- **DIFF 2** eliminación de reconciliación client-side (v7.204.0)
- **DIFF 3** timeout 30s Facturapi (v7.204.0)
- **DIFF 4** `billing_secrets` sin lectura directa (v7.204.0)
- **DIFF 5** persister de cache reparado (v7.204.0)

## Parciales
- **DIFF 8** — Auth compartida en edge functions: `authenticateWithDeps` cubre 6 stamping/cancel functions (v7.205.0). Falta `_shared/cronAuth.ts` con comparación timing-safe para `process-cfdi-retry-queue`, `reconcile-stamping-invoices`, `generate-recurring-maintenance`.
- **DIFF 9** — Capa de datos:
  - 9a invalidaciones muertas ✅ (v7.205.0)
  - 9b `useUpdateForklift`/`useDeleteForklift` a `useEntityMutation` ✅ (v7.206.0)
  - 9c ❌ ~10 `queryKey: ["..."]` ad-hoc pendientes de migrar a factories
  - 9d ⚠️ v7.207.0 sólo unificó invalidación; falta consolidar los 5 lectores/3 namespaces de `company_settings` en un único `defineEntityQueries`
- **DIFF 11** — Triggers de auditoría en `supplier_bills`/`bank_accounts`/`bank_statement_lines` ✅ (v7.206.0). Faltan RPCs `delete_booking`/`update_booking` y soft-delete auditado para invoices draft, credit_notes draft, supplier_payments.
- **DIFF 13** — `select("*")` en `src/lib/pdf/shared.ts` y `contract/fetchers.ts` ✅ (v7.206.0). Quedan ~32 `select("*")` restantes, bulk signed URLs en `useFeedbackScreenshotUrl`, embed en `fetchInvoicePdfData`, y colapso de invalidaciones N→1 en uploads multi-archivo.

## Pendientes completos
- **DIFF 6** Romper ciclos `invoices ↔ portal` y `quotes ↔ invoices` (barrel de portal, mover `paymentIntents/*`, `paymentIntentStatus`, `downloadCfdiBlob`, `extractNonRentalLines`).
- **DIFF 7** `src/lib` deja de importar features (mover `rules/invoices.ts`, `rules/quotes.ts`; DTOs propios en `src/lib/pdf/types.ts` para contract/customerStatement/incomeStatement).
- **DIFF 10** Reglas de negocio fuera de UI: balance en `InvoiceDetailActions` desde `v_invoices_with_balance`, helper `rentalDaysInclusive`, `computeTotals` en `RentalFinancialSummary`, `toMxn` en `CollectionForecast`.
- **DIFF 12** Migraciones canónicas para `get_dashboard_stats` (×22), `get_income_statement` (×21), `create_booking` (×11) + regla en CONTRIBUTING.
- **DIFF 14** ESLint `no-restricted-imports` y `complexity`/`max-lines` a `error` con allowlist; job de coverage mínimo en CI.
- **DIFF 15** Tests de `users` (28 archivos, 0 tests), `AuthContext`, `returns`, `calendar`.
- **DIFF 16** Migrar `useProspectForm`, `InviteUserDialog`, tabs de operations a RHF+Zod+`FormField`.
- **DIFF 17** Hook `useBookingsRealtime` para calendario/Gantt y kanban de mantenimiento.
- **DIFF 18** Limpieza cosmética (9 sub-tareas: knip, `formatDateDisplay` → `formatDateMty`, `StatusBadge` central, mover `CustomerPortalRoutes`, README, `set_prospect_created_by` search_path, `useCustomerPortal` al feature portal, `createCrudHooks()`, data-testid E2E).

## Recomendación de siguiente lote (Lote C, v7.208.0)
Cerrar los parciales antes de abrir DIFFs nuevos:
1. **DIFF 8 resto** — `_shared/cronAuth.ts` timing-safe aplicado a las 3 cron functions.
2. **DIFF 9c** — migrar las ~10 `queryKey` inline a factories (`bookingKeys.all`, `forkliftKeys.all`, `quoteKeys.nextNumber`, etc.).
3. **DIFF 9d** — `companySettingsQueries.ts` con `defineEntityQueries`; los 5 lectores + 3 namespaces pasan a una sola query.
4. **DIFF 10** completo (4 sub-fixes) — bajo riesgo, alto impacto en corrección multi-moneda / NCs.

Después Lote D con DIFF 11 (RPCs transaccionales) y Lote E con DIFFs 6-7 (ciclos), que son los refactors más invasivos.

¿Aplico el Lote C propuesto (DIFF 8 resto + 9c + 9d + 10) como v7.208.0, o priorizas otro subconjunto?
