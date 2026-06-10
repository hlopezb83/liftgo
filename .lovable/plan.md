# Auditoría de arquitectura LiftGo — Reporte y plan de mejora

**Alcance:** `src/` (~58k LOC, 29 features, 203 hooks, 391 componentes) + `tests/`.
**Método:** 2 sub-agentes paralelos + análisis directo (lint, knip, rg, wc).
**Veredicto general:** Arquitectura **sólida** (features bien delimitadas, 0 `any`/`!`/`as`, naming consistente, lint en 0 errores). Los problemas son **localizados** y se concentran en 3 features: `invoices`, `accounts-payable` y `bank-reconciliation`.

---

## Hallazgos por categoría

### 🔴 CRÍTICO — Violación de capas `lib/` → `features/` (6 archivos)
`src/lib/` debe ser la capa más baja, sin dependencias hacia dominios. Hoy importa de `features/`:

| Archivo `lib/` | Importa de `features/` |
|---|---|
| `src/lib/constants.ts` | `users/hooks/useUserRole` (type `AppRole`) |
| `src/lib/ui/AuthSnapshotSync.tsx` | `users/hooks/useUserRole` (**runtime hook**) |
| `src/lib/domain/invoiceHelpers.ts` | `fleet/hooks/forklifts/useForklifts` (type `Forklift`) |
| `src/lib/pdf/customerStatement.tsx` | `customers/hooks/.../useCustomerSummary` |
| `src/lib/pdf/documents/CustomerStatementDocument.tsx` | idem |
| `src/lib/pdf/contract/fetchers.ts` | `contracts/hooks/useContractTemplates` + llamadas Supabase directas |

**Riesgo:** dependencia circular latente, rompe tree-shaking, cualquier regla ESLint de capas tumbaría el build.

---

### 🟠 ALTO — Componentes que importan `supabase` directo (acoplamiento UI ↔ datos)
6 componentes hacen llamadas a Supabase Storage / Functions / DB en el cuerpo del JSX:

| Componente | Llamada |
|---|---|
| `invoices/.../InvoicePaymentSummary.tsx` (225 LOC) | `functions.invoke("download-cfdi")` |
| `invoices/.../InvoiceCreditNotesCard.tsx` (174 LOC) | `functions.invoke("download-cfdi")` |
| `invoices/.../PaymentIntentsSection.tsx` | `storage.createSignedUrl("payment-proofs")` |
| `invoices/.../InvoicePDFButton.tsx` | `functions.invoke("download-cfdi")` |
| `accounts-payable/.../SupplierPaymentRow.tsx` | `storage.createSignedUrl` + `window.prompt`/`window.confirm` |
| `bank-reconciliation/.../ManualMatchPicker.tsx` | dos `supabase.from()` en `useEffect` manual con flag `cancelled` |

**Riesgo:** imposible testear sin mock de red, sin caché de React Query, sin estados loading/error consistentes.

---

### 🟠 ALTO — Duplicación de la descarga CFDI/REP en 3 lugares
Mismo patrón (`functions.invoke("download-cfdi")` → blob → anchor click → revoke) repetido en `InvoicePDFButton.tsx`, `InvoicePaymentSummary.tsx`, `InvoiceCreditNotesCard.tsx`. Cualquier cambio (auth, error handling) requiere 3 ediciones.

---

### 🟠 ALTO — Hooks/funciones que violan Power-of-10 (>80 LOC)
| Archivo | LOC | Problema |
|---|---|---|
| `portal/hooks/usePortalExtras.ts` | 225 | Empaqueta 6 hooks independientes |
| `invoices/.../useInvoiceDetailActions.ts` | 160 | Mezcla diálogos, stamp, XML download, transición de status, delete |
| `bookings/hooks/useBookingActionsLogic.ts` | 102 | `handleStatusChange` con 3 awaits anidados |
| `invoices/.../useInvoiceFormLogic.ts` | 108 | Agrega 9 sub-hooks |
| `invoices/.../useCreditNotes.ts` | 121 | `useCreateCreditNote` ejecuta 3 ops secuenciales sin transacción (riesgo de corrupción si falla el stamp) |

`backfillStampSnapshot` (47 LOC, 4 niveles de anidación) y `useEffect` con `fetch` manual de `ManualMatchPicker` son los peores ofensores de complejidad.

---

### 🟡 MEDIO — Dead code con recursos vivos
- `accounts-payable/hooks/usePaymentBatches.ts` — hook **con suscripción Supabase activa**, **0 consumidores** (knip + rg). Fuga de recurso real.
- `accounts-payable/hooks/useSupplierBillMutations.ts::useUpdateSupplierBill` — export sin uso.
- `src/lib/pdf/incomeStatement.tsx::exportIncomeStatementPdf` — exportador PDF nunca importado.
- `src/lib/domain/errorCatalog.ts::getMessage`, `src/lib/ui/appFeedback.ts::notifySuccess`, `quotes/utils/saleLines.ts::parseSaleDescription` — exports muertos.

---

### 🟡 MEDIO — Valores hardcodeados que deberían ser constantes
- `"MXN"` literal en 10+ archivos en lugar de `DEFAULT_CURRENCY` en `lib/constants.ts`.
- Strings de status (`"pending" | "confirmed" | "completed" | "cancelled"`) duplicados en 8+ archivos sin enum tipado en `lib/domain/statuses.ts`.
- Role `"admin"` comparado por `===` en 6 componentes en lugar de `ROLES.ADMIN`.
- `toLocaleString("es-MX", { style:"currency" })` en 3 componentes en lugar de `formatCurrency()`.
- `STATUS_LABELS` / `MOTIVES` / `MOTIVE_LABELS` declarados inline en componentes en lugar de `<feature>/lib/`.

---

### 🟡 MEDIO — Estructura
- `features/operations/` no tiene `hooks/` ni `lib/` (la lógica se filtra a `components/`).
- `features/quotes/utils/` debería ser `lib/` por consistencia con las otras 28 features.
- `features/audit/hooks/activityMetricsTypes.ts` y `features/operations/components/.../maintenancePolicyFormTypes.ts` son archivos de tipos puros mal ubicados.
- `CustomerPortalRoutes.tsx` importa **eager** todas las páginas del portal (sin `lazy`/`Suspense`), penalizando el bundle de usuarios no-customer.
- `MyReportsPage` y `LeaderboardPage` de `features/feedback/` están inyectados dentro del portal — viola aislamiento de features.

---

### 🟢 BIEN
- Naming kebab/PascalCase consistente; 28/29 features siguen el patrón `{pages, components, hooks, lib}`.
- Cero `any`, `!`, `as` en todo `src/`.
- Lint: 0 errores (34 warnings de complejidad, deuda menor).
- Tipos generados de Supabase aislados en `integrations/`, no se editan.
- Tests RLS, Vitest y E2E activos en CI con artifacts.

---

## Plan de refactor (10 lotes, ordenados por impacto)

### **Lote 1 — Romper acoplamiento `lib/` → `features/`** 🔴
Invertir las 6 dependencias críticas:
- Mover `AppRole` → `src/lib/domain/roles.ts`.
- Mover tipos `Forklift`, `CustomerSummary`, `ContractClause`, `ChecklistSection`, `ReportData` → `src/lib/domain/*Types.ts`.
- `AuthSnapshotSync.tsx`: aceptar `role` como prop o reubicar en `features/users/`.
- `lib/pdf/contract/fetchers.ts`: mover las queries Supabase a `features/contracts/hooks/useContractPdfData.ts`, dejar `lib/pdf/contract/` puro.

### **Lote 2 — Eliminar dead code con recursos vivos** 🟠
Borrar `usePaymentBatches` (suscripción huérfana), `useUpdateSupplierBill`, `exportIncomeStatementPdf`, `getMessage`, `notifySuccess`, `parseSaleDescription`. Validar con `knip` después de cada borrado.

### **Lote 3 — Extraer helper único `downloadCfdiBlob()`** 🟠
Crear `src/lib/pdf/downloadCfdi.ts` y reemplazar las 3 duplicaciones en `InvoicePDFButton`, `InvoicePaymentSummary`, `InvoiceCreditNotesCard`. Eliminar import de `supabase` en estos componentes.

### **Lote 4 — Extraer helper `openStorageFile(bucket, path)`** 🟠
Centralizar `createSignedUrl + window.open` en `src/lib/storage/openSignedUrl.ts`. Reemplazar uso en `PaymentIntentsSection` y `SupplierPaymentRow`. Reemplazar `window.prompt`/`window.confirm` con `AlertDialog` controlado.

### **Lote 5 — Convertir `ManualMatchPicker` a `useQuery`** 🟠
Crear `useManualMatchCandidates(kind)` con React Query; el componente queda como render puro. Elimina race conditions, agrega caché y loading state.

### **Lote 6 — Romper `useInvoiceDetailActions.ts` (160 LOC)** 🟠
Dividir en:
- `useStampInvoiceFlow` (con `backfillStampSnapshot` como pure fn en `lib/`).
- `useDownloadInvoiceXml`.
- `useInvoiceDetailActions` queda como orquestador ≤80 LOC.
Extraer `STATUS_LABELS` a `src/lib/constants.ts` (eliminando duplicado).

### **Lote 7 — Romper `usePortalExtras.ts` (225 LOC)** 🟠
Dividir en `usePortalQuotes.ts`, `usePortalPaymentIntents.ts`, `usePortalCollectionAccount.ts`. Cada uno ≤80 LOC.

### **Lote 8 — Constantes de dominio centralizadas** 🟡
Crear:
- `src/lib/domain/statuses.ts` — enums tipados de booking/invoice/quote status.
- `src/lib/constants.ts::DEFAULT_CURRENCY = "MXN"` + `ROLES.ADMIN`.
- `features/invoices/lib/creditNoteConstants.ts` — mover `MOTIVES` y `MOTIVE_LABELS`.
- `features/bookings/lib/bookingStatusMachine.ts` — mover `getValidTransitions`.

Reemplazar 25+ literales en componentes.

### **Lote 9 — Atomizar `useCreateCreditNote`** 🟡
Crear RPC/edge function que reciba `{ invoice_id, motive, items }` y haga `next_number + insert + stamp` en una sola transacción. Riesgo actual: nota de crédito en estado `draft` con número consumido si falla el stamp.

### **Lote 10 — Limpieza estructural + lazy portal** 🟡
- `features/quotes/utils/` → `lib/`.
- Crear `features/operations/{hooks,lib}/` y mover tipos/lógica.
- Mover `activityMetricsTypes.ts` y `maintenancePolicyFormTypes.ts` a `lib/`.
- `CustomerPortalRoutes`: convertir todas las páginas a `lazy()` con `<Suspense>`.
- Mover `MyReportsPage`/`LeaderboardPage` fuera del portal.
- Reducir páginas >150 LOC (`CuentasPorPagarPage`, `CRMClosedPage`, `SupplierBillFormDialog`) extrayendo columnas y subcomponentes.

---

## Resumen ejecutivo

| Severidad | Hallazgos | Lotes propuestos |
|---|---|---|
| CRÍTICO | 1 (capas) | Lote 1 |
| ALTO | 7 (acoplamiento, hooks gigantes, duplicación) | Lotes 2–7 |
| MEDIO | ~20 (constantes, atomicidad, estructura) | Lotes 8–10 |
| BAJO | 6 (renombres, JSDoc) | Opcional |

**Recomendación:** ejecutar los lotes 1–3 antes de cualquier nueva feature. Los lotes 4–7 pueden agendarse uno por sprint. Los lotes 8–10 son housekeeping ideal para días lentos.

**Sin cambios aplicados todavía.** Aprueba el plan (o pídeme priorizar/recortar lotes) y arranco con el Lote 1.
