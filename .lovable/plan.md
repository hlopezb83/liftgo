## Auditoría completada — 4 ejes

Lancé 4 sub-agentes que evaluaron CI/CD, calidad de código, gaps de testing y seguridad del backend. Los hallazgos completos están en mi turno anterior; este plan los consolida y prioriza por **ROI (impacto ÷ esfuerzo)**.

### Veredicto general

- **Base sólida**: cero `!` non-null, cero `: any`, 100% de `useEffect` con cleanup, CORS por allowlist, `has_role` + `search_path` consistente, sin archivos >500 LOC.
- **3 fugas críticas** (CI roto silenciosamente, RPCs E2E expuestas a `authenticated`, `company_settings` legible por `anon`).
- **Cobertura ornamental**: thresholds Vitest (functions=8%) con margen real de 0.55pp — el gate no protege.
- **Deuda extendida pero predecible**: 20+ componentes >150 LOC, 8 `catch (e)` sin `unknown`, 10+ casts `as`, formateo de moneda duplicado.

---

## Lote 1 — Fixes urgentes de CI y seguridad (1-2h, bloqueantes)

Sin esto el CI está mintiendo y hay superficie de ataque viva.

1. **Versiones de actions inexistentes** en `.github/workflows/ci.yml`:
   - `actions/checkout@v6` → `@v4`
   - `actions/upload-artifact@v7` → `@v4`
   - `mikepenz/action-junit-report@v6` → `@v5`
2. **Revocar EXECUTE** de RPCs E2E a `authenticated` (`e2e_seed_scenario`, `e2e_teardown`, `purge_e2e_data`) → migración SQL; conservar `service_role`.
3. **Restringir `company_settings`** a `authenticated` y exponer solo `{name, logo_url}` vía RPC `get_company_branding` para pantallas pre-auth (RFC y régimen fiscal hoy son públicos).
4. **`generate-recurring-maintenance`**: reemplazar `authHeader.includes(serviceKey)` por un `CRON_SECRET` dedicado comparado estrictamente.
5. **Revocar GRANTs** implícitos en `billing_secrets` (`REVOKE ALL ... FROM PUBLIC, anon, authenticated`).
6. **`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "1"`** en `env:` del workflow.

---

## Lote 2 — Coverage real: dominio puro (4-6h, +5pp coverage)

Antes de subir thresholds, hay que tener margen real. Funciones puras = máximo ROI.

1. Tests unitarios de `src/lib/domain/rentalCalculation.ts` (mezclas día/semana/mes, edge cases).
2. Tests de `src/lib/domain/invoiceTotals.ts` (descuentos, NaN, overflow).
3. Tests de `src/features/invoices/lib/syncInvoiceStatus.ts` (estados paid/partial/sent/reversal con mock supabase).
4. Smoke snapshots de `src/lib/pdf/documents/{QuoteDocument,InvoiceDocument,IncomeStatementDocument}.tsx` (hoy 0% en 17 archivos PDF).
5. Subir thresholds de Vitest a `lines:20 / branches:18 / functions:15 / statements:20` con margen ≥5pp medido.

---

## Lote 3 — Higiene de código (3-4h, deuda mecánica)

Fixes mecánicos de bajo riesgo, alto ROI de mantenibilidad.

1. **Tipar 8 `catch (e)` como `unknown`** en: `useSupplierRepMutations`, `PortalStatement`, `SupplierFormDialog`, `usePaymentHistoryColumns`, `useDownloadInvoiceXml`, `InvoiceCreditNotesCard`, `useSetPasswordForm`, `captureScreenshot`.
2. **Refactor `useBreadcrumbEntityLabel.ts`**: eliminar 10+ casts `as`/`as never` con union discriminada.
3. **Unificar `formatCurrency` → `nCurrency`**: deprecar el primero con re-export, evitar locales divergentes.
4. **Mover magic numbers** a `src/lib/constants.ts`: `MAX_RECORDS_FETCH = 500`, `STALL_TIMEOUT_MS`, `BREADCRUMB_STALE_MS`.
5. **Eliminar dead code** confirmado por knip: `insuranceAlertKeys`, `exportIncomeStatementPdf`, tipos huérfanos.
6. **Reactivar `@typescript-eslint/no-unused-vars`** como `warn` en `eslint.config.js`.

---

## Lote 4 — Refactor de god components (1-2 días, calidad estructural)

Top archivos que violan Power of 10 (componentes ≤150, hooks ≤80) con mayor blast radius.

1. `ListPageLayout.tsx` (251 LOC) → extraer `ListPageFiltersBar`, `ListPageEmptyState`.
2. `RecordPaymentDialog.tsx` (213) + `RegisterSupplierPaymentDialog.tsx` (195) → compartir `usePaymentFormBase`.
3. `SupplierBillDetailSheet.tsx` (204) → `BillAmountsCard` + `BillActionsBar`.
4. `CRMClosedPage.tsx` (210) → extraer `closedColumns.tsx` + `useReopenProspect`.
5. Hooks oversize: `useHotkeys` (108), `usePullToRefresh` (96), `useListPage` (96), `useListFilters` (90), `useProspectForm` (104).
6. **Centralizar query keys**: tabla `forklifts` se consulta desde 6 hooks distintos sin queryKey canónico → crear `src/lib/queryKeys.ts`.

---

## Lote 5 — Coverage estratégico: CFDI + RLS + E2E (3-5 días, blindaje fiscal)

Áreas de mayor riesgo legal/financiero hoy sin tests.

1. **Hooks CFDI** (0% hoy): `useCancelCfdi`, `useStampCfdi`, `usePaymentComplement`, `useCreditNoteMutations`.
2. **Hooks pagos a proveedores**: `useRegisterSupplierPayment`, `useBillApprovalMutations`.
3. **RLS tests faltantes**: `payments`, `credit_notes`, `supplier_bills`, `supplier_payments`, `bank_statement_lines`, `role_permissions` (este último crítico contra escalada).
4. **Deno tests** faltantes para edge functions: `stamp-payment-complement`, `cancel-credit-note`, `refresh-cancellation-status`, `generate-recurring-maintenance`.
5. **E2E críticos faltantes**:
   - `cfdi-cancel.spec.ts` (motivos 02/03)
   - `payment-complement.spec.ts` (PPD end-to-end)
   - `full-chain.spec.ts` (quote → booking → invoice → pago)
   - `credit-note.spec.ts`

---

## Detalles técnicos

**Pipeline E2E duplica el build**: `playwright.config.ts` corre `bun run build && bun run preview` en cada shard. Plan futuro (no en este lote): subir `dist/` como artifact desde `quality` y descargarlo en `e2e` para ahorrar 6-8 min de pipeline.

**Pre-commit hooks**: no incluidos aquí pero candidatos a Lote 6 con Lefthook (`tsc --noEmit` + `eslint` sobre staged).

**Dependabot + dependency-review**: el proyecto maneja CFDI/SAT; recomendable añadir `.github/dependabot.yml` y `actions/dependency-review-action@v4` en un lote independiente.

**Cosas que NO hay que tocar** (auditadas y correctas): CORS allowlist, `has_role` pattern, `requireAdmin`/`requireRole` shared, generación de contraseñas con rejection sampling, rate limits hardened, storage policies, validación de roles con enum.

---

## Orden sugerido de ejecución

```text
Lote 1 (1-2h)  ──▶ desbloquea CI confiable + cierra fugas
Lote 2 (4-6h)  ──▶ da margen real al coverage gate
Lote 3 (3-4h)  ──▶ higiene mecánica de bajo riesgo
Lote 4 (1-2d)  ──▶ refactor estructural
Lote 5 (3-5d)  ──▶ blindaje CFDI + RLS + E2E
```

Cada lote termina con su entrada en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json` siguiendo la convención del proyecto.

¿Avanzo con el **Lote 1 completo** (urgente, todo en una pasada) o prefieres revisar/ajustar la priorización antes?