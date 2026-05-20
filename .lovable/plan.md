
# Auditoría arquitectónica — LiftGo ERP vs `architecture.md`

Alcance: revisión estática del código contra las 21 secciones de `architecture.md`. Se evalúan §4 (estructura), §5 (patrones), §6 (seguridad), §17 (anti-patrones), §18 (Power of 10), §19 (tamaños), §20 (dependencias).

**Veredicto general:** la base está **muy alineada** con la doctrina. Las tres fases recientes (Customer/Forklift/Invoice → RHF+Zod) cerraron la deuda mayor de §20.4. Lo que queda son focos puntuales, no estructurales.

---

## 1. Hallazgos por severidad

### 🔴 Altas (violan §17 anti-patrones explícitos)

| # | Hallazgo | Archivo | Regla violada |
|---|---|---|---|
| H1 | `confirm()` nativo para reabrir deal del CRM | `src/features/crm/pages/CRMClosedPage.tsx:89` | §17: prohibido `confirm()`/`alert()` — usar `AlertDialog` shadcn |

### 🟡 Medias (deuda §20 y §19 documentada)

| # | Hallazgo | Detalle | Regla |
|---|---|---|---|
| M1 | `file-saver` aún consumido por 5 generadores PDF | `contractPdfBuilder`, `quote/build`, `invoices/lib/pdf/build`, `incomeStatement`, `customerStatement` (`docs/dependency-audit.md` lo daba como "0 consumidores" porque el audit no detecta `import("file-saver")` dinámicos) | §20.7: candidato a retiro (cubierto por `URL.createObjectURL`) y desactualización del audit script |
| M2 | `html2canvas` (1.4MB) usado solo en `captureScreenshot` para feedback | `src/features/feedback/lib/captureScreenshot.ts` | §20.2: dep pesada por 1 consumidor; mantener pero documentar |
| M3 | 6 hooks > 80 LOC sin dividir | `useInvoicePrefill` (156), `useInvoiceFormLogic` (121), `useQuotePrefill` (120), `useOperatingExpenseMutations` (116), `useUserMutations` (114), `useMaintenanceForm` (111) | §19: hooks ≤ 80 LOC |
| M4 | 17 componentes > 150 LOC | top: `DeliveryFormDialog` (199), `ProfitabilityByModelReport` (198), `IncomeStatementTable` (189), `CustomerFormSections` (182), `ExpenseFormDialog` (159), `RentalLineItems` (157), `EditableLineItemsTable` (155), 10 más entre 152–162 | §19: componentes ≤ 150 LOC (algunos califican como excepción tabla densa/PDF) |
| M5 | Tipos sin uso exportados | 9 tipos: `CfdiLineItem`, `MaintenanceFormShape`, `ReturnInspectionFormState`, `SortingState`/`RowSelectionState`/`PaginationState`/`TanstackTable`/`Row`/`LiftgoColumnMeta` (knip) | §10 Power of 10 / higiene |
| M6 | Exports muertos | `liftgoSortingFnUnknown`, `useServerLiftgoTable`, `FEEDBACK_INTERNAL_MODULES`, `FEEDBACK_PORTAL_MODULES` + duplicado `liftgoSortingFn` (knip) | Higiene |

### 🟢 Bajas (mejora continua)

| # | Hallazgo | Acción |
|---|---|---|
| L1 | `src/hooks/useFormState.ts` aparece en `docs/dependency-audit.md` como pendiente de migrar a RHF | Archivo ya **no existe** — el audit doc está desactualizado |
| L2 | Anti-patrones de tipo (`any`, `!`, `as casual`) — **sin hallazgos** salvo `as` legítimo en límites | Mantener |
| L3 | `console.log`, `alert` — **sin hallazgos** | Mantener |
| L4 | Componentes consumiendo Supabase directo: solo `AuthPage.tsx` (legítimo: auth flow) | Mantener |

---

## 2. Plan de remediación (3 olas)

### Ola A — Alta prioridad (sesión corta, ~1 patch)

1. **H1**: reemplazar `confirm()` en `CRMClosedPage` por `AlertDialog` reusable. Patrón ya usado en `useDialogState`.
2. **M5 + M6**: eliminar exports/tipos muertos detectados por knip (lista exacta arriba). Verificar con `bunx knip` que queda en cero.
3. Changelog → `6.7.2` (patch) "Higiene: AlertDialog en CRM + limpieza de exports muertos".

### Ola B — Refactor de hooks/componentes oversized (1 minor)

Sólo los que **no** califican como excepción §19 (tablas densas/PDF):

- **`useInvoicePrefill` (156 LOC)** → dividir en `buildValuesFromExisting`, `buildValuesFromQuote` (helpers puros en `lib/`) + `useInvoicePrefill` ≤60 LOC orquestador.
- **`useQuotePrefill` (120 LOC)** → mismo patrón.
- **`useInvoiceFormLogic` (121 LOC)** → extraer `useInvoiceTotals(form)` y `useInvoiceSelectHandlers(form, …)` ya previsto en `.lovable/plan.md` paso 2.
- **`useOperatingExpenseMutations` / `useUserMutations` / `useMaintenanceForm`** → dividir `*Mutations.ts` por intención (create/update/delete) o extraer builders.
- **Componentes**: priorizar `DeliveryFormDialog` y `ExpenseFormDialog` (forms, no tablas). El resto (`*Report*`, `IncomeStatementTable`, `RentalLineItems`, `SaleLineItems`, `EditableLineItemsTable`) son **tablas densas** → marcar formalmente como excepción §19.4.1 con comentario `// arch:excepción §19 (tabla densa)`.
- Changelog → `6.8.0` (minor).

### Ola C — Doctrina §20 (1 patch)

- **M1**: actualizar `scripts/dependency_audit.py` para detectar `import("file-saver")` dinámicos; reflejar los 5 consumidores reales en `docs/dependency-audit.md`. Decidir: ¿retirar `file-saver` y consolidar en helper `downloadBlob(name, blob)` que use `URL.createObjectURL`? Recomendado **sí**: retira 1 dep y centraliza descarga.
- **L1**: regenerar `docs/dependency-audit.md` para eliminar referencia a `useFormState` (archivo ya borrado) y reflejar el estado post-Fase 3 (Customer/Forklift/Invoice migrados).
- **M2**: documentar `html2canvas` como dep aceptada en `§20.4` (única forma sensata de capturar viewport del usuario en feedback) o evaluar `modern-screenshot` (≈10× más liviano).
- Changelog → `6.7.3` o consolidar con Ola A.

---

## 3. Detalles técnicos por hallazgo

### H1 — `CRMClosedPage.tsx` línea 89
```tsx
if (!confirm(`¿Reabrir deal con ${p.company_name}? …`)) return;
```
Reemplazo: estado local `reopenTarget: Prospect | null` + `<AlertDialog>` con `AlertDialogAction onClick={() => doReopen(reopenTarget)}`. Mismo patrón que `useDialogState` ya usado en 4 pantallas.

### M1 — `file-saver` real footprint
5 sitios usan `import("file-saver")` dinámico:
```
contractPdfBuilder.tsx:13
lib/pdf/quote/build.tsx:48
invoices/lib/pdf/build.tsx:34
lib/pdf/incomeStatement.tsx:22
lib/pdf/customerStatement.tsx:18
```
Cada uno hace `saveAs(blob, filename)`. Centralizar en `src/lib/downloadBlob.ts` (≤15 LOC), retirar dep, actualizar §20.4.

### M3 — desglose de hooks oversized
- `useInvoicePrefill.ts (156)`: dos `useEffect` paralelos que duplican shape-building. Extraer `mapExistingToValues()` y `mapQuoteToValues()` a `src/features/invoices/lib/invoiceFormBuilders.ts`.
- `useInvoiceFormLogic.ts (121)`: ya está en `.lovable/plan.md §2`; sólo aplicar.

### M4 — tabla densa vs verdadero oversized
Marcar como excepción §19 (comentario obligatorio):
- `*Report*.tsx`, `IncomeStatementTable.tsx`, `auditTrailConstants.tsx`, `RentalLineItems`, `SaleLineItems`, `EditableLineItemsTable`, `CustomerFormSections`, `CustomersPage`, `InvoicesPage`, `Fleet`, `ReturnInspectionPage`, `OperatingExpensesPage`, `DeliveryDetail`.

Refactor real:
- `DeliveryFormDialog.tsx (199)` → extraer `<DeliveryHeaderFields>`, `<DeliverySignatureFields>`.
- `ExpenseFormDialog.tsx (159)` → extraer `<ExpenseLineFields>`.

### M5/M6 — limpieza knip
Eliminar:
```
sorting.ts → liftgoSortingFnUnknown + alias duplicado
useServerLiftgoTable.ts → función completa (cero consumidores)
constants.ts → FEEDBACK_INTERNAL_MODULES, FEEDBACK_PORTAL_MODULES
types.ts (dataTable v2) → 6 tipos sin uso
EditableLineItemsTable.tsx → tipo CfdiLineItem
MaintenanceFormDialog.tsx → MaintenanceFormShape
ReturnInspectionDialog.tsx → ReturnInspectionFormState
```

---

## 4. Lo que ya está bien (no tocar)

- §4 estructura por features: cumplida 100%.
- §5.1 separación páginas/hooks/componentes: cumplida; sólo `AuthPage` toca Supabase directo (legítimo).
- §6 RLS + `has_role` + roles separados: alineado.
- §7 routing sin nested wildcards: alineado.
- §15 testing: 20+ tests Invoice + flujos críticos.
- §16 changelog: política aplicada en cada PR reciente (6.7.0, 6.7.0-alpha.1, .2, 6.7.1).
- §18 Power of 10: 0 `any`/`!`/`alert`/`console.log` en producción.
- §20 stack canónico: RHF+Zod, TanStack Query/Table, react-pdf, sonner, currency.js, lucide, date-fns — todo en uso.

---

## 5. Resumen para ejecutar

Si apruebas el plan, **propongo arrancar por Ola A** (1 hallazgo alto + limpieza knip + changelog patch) en una sola pasada, y dejar Olas B y C como minors separados para mantener PRs revisables.
