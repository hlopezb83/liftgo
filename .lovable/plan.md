
## Verificación previa (contra HEAD)

- **DIFF 1** (cash-flow → `v_invoices_with_balance`): **ya aplicado en v7.217.1**. Se omite.
- **DIFF 4** (search_path en `set_prospect_created_by`, `set_delivery_number`, `set_inspection_number`, `bump_version_optimistic`): **ya aplicado** en `20260408004410` y `20260721151311`. Se omite.
- **DIFF 2** (`delete_booking`): existe la RPC (`20260723233144`) pero sin guardas de FK ni protección del `status_logs` — pendiente real.
- **DIFF 3** (timeouts Facturapi): 5 handlers (stamp-credit-note, stamp-payment-complement, cancel-cfdi, cancel-payment-complement, cancel-credit-note, refresh-cancellation-status, validate-receptor-tax-info) sin timeout — pendiente real.
- **DIFF 12** (triggers activity duplicados): confirmado, `log_activity_*` y `activity_*` disparan el mismo `log_activity()` sobre las mismas tablas — pendiente.
- **DIFF 8** (invalidar `public_branding`): confirmado que existe la query y no se incluye en `COMPANY_SETTINGS_INVALIDATION_KEYS`.
- Barrels (`invoices`, `bookings`, `feedback`) no exportan sus `lib/queryKeys` / `rentalDays` / `feedbackMessages` → pendiente.

## Plan — v7.218.0 (dos olas)

### Ola 1 — Blockers y Altos (Bloques 1+2 del reporte)

1. **DIFF 2 · `delete_booking` con guardas de FK y `status_logs` atómico**
   - Migración nueva que reescribe la función: pre-valida existencia de rows en `invoice_bookings`, `invoices`, `contracts`, `deliveries`, `return_inspections`, `damage_records` y aborta con `P0001` claro antes que 23503.
   - `INSERT` a `status_logs` sólo cuando `GET DIAGNOSTICS ROW_COUNT > 0` del UPDATE a `forklifts`.
   - Mantener grants existentes.

2. **DIFF 3 · Timeouts en las 7 llamadas Facturapi**
   - `_shared/facturapi/client.ts`: añadir `cancelInvoiceWithSignal` y `retrieveInvoiceWithSignal`.
   - `_shared/facturapi/withTimeout.ts`: añadir `sdkCallWithTimeout` (race genérico con `AbortController` + `FacturapiTimeoutError`).
   - Envolver las 7 llamadas (stamp-credit-note, stamp-payment-complement, cancel-cfdi, cancel-payment-complement, cancel-credit-note, refresh-cancellation-status, validate-receptor-tax-info) siguiendo la política ya usada en `stamp-cfdi`: en timeout devolver 504 `{ code: "TIMEOUT", transient: true }` y **no** revertir estado local a `error`.

3. **DIFF 5 · `scripts/arch-check.sh` sin verde falso**
   - `command -v rg` obligatorio (exit 1 con mensaje).
   - Quitar `|| true` que enmascara ausencia de `rg` en G4 y G5.
   - Borrar excepción muerta de `AuthPage` en G4.

4. **DIFF 6 · Barrels públicos + guards ESLint**
   - Añadir a los barrels: `invoices/lib/queryKeys`, `bookings/lib/queryKeys`, `bookings/lib/rentalDays`, `feedback/lib/feedbackMessages`.
   - Migrar deep-imports listados al barrel (quotes, portal, accounts-payable, calendar, forms/fields).
   - `eslint.config.js`: fusionar patrón cross-feature en el bloque supabase, subir cross-feature a `error`, marcar `formatDateDisplay`/`formatDateRange` como `error` en el bloque de íconos (congela 151 callsites — migración post-release), borrar excepción muerta de `AuthPage`.

### Ola 2 — Medios y quick-wins seleccionados

5. **DIFF 7 · `isPayable` NC-aware** en `src/lib/rules/invoices.ts` + tests (`InvoiceLike.balance`).
6. **DIFF 8 · Invalidar `publicBrandingQueries.keys.all`** en `COMPANY_SETTINGS_INVALIDATION_KEYS`.
7. **DIFF 11 · Índices** `idx_bookings_forklift_status`, `idx_invoices_status_due`.
8. **DIFF 12 · Deduplicar triggers** `log_activity_{bookings,invoices,maintenance_logs}` (conservar `activity_*`).
9. **DIFF 17 · RLS `supplier_bank_accounts`**: `SELECT` sólo `admin`/`administrativo` (rol `contador` no existe en este proyecto — se omite).
10. **DIFF 14 · Query-keys literales** `useUserRole`, `useProfitByModelReport` → factories.
11. **DIFF 15 · Fields compartidos al barrel** (CustomerField, SupplierField, CsfDropzone).
12. **Quick wins L3/L4/L7**: borrar grupo `jspdf` de `CHUNK_GROUPS`, `loading="lazy" decoding="async"` en galerías, dejar de re-exportar páginas en `feedback/index.ts`.

**Fuera de este PR** (justificados):
- DIFF 4 (ya aplicado), DIFF 1 (ya aplicado en v7.217.1).
- DIFF 9 (xlsx lazy), DIFF 10 (botón "Actualizar" calendario), DIFF 13/16 (tests adicionales), L1/L2/L5/L6/L8 → post-release (roadmap del reporte).

### Cierre
- Bump a **v7.218.0**, entrada en `public/changelog.json` + `public/changelog/v7.218.0.json`, `public/version.json`.
- Validación: `bun run lint` + `bun run test` + `bash scripts/arch-check.sh` verdes; probar manualmente `/flujo-de-caja`, eliminar reserva con factura (P0001) vs cancelada limpia.
