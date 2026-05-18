# Auditoría arquitectónica v6.3 (read-only)

## Veredicto: codebase sano

| Métrica | Resultado |
|---|---|
| ESLint | **0 warnings, 0 errores** |
| Tests | **48/48 PASS** |
| `any` / `!` / `as X` fuera de tipos generados | **0** |
| Knip — exports muertos | **0** |
| Archivos >150 LOC (excl. UI/types) | **20** (todos 150-189, ninguno crítico) |
| Hooks >80 LOC | **24** |
| Pages fuera de `src/features/` | **0** (NotFound es el único en `src/pages/`) |

Las oleadas v6.0.x–v6.2.2 cerraron toda la deuda crítica. No hay misplacement obvio, ni acoplamiento severo, ni lógica fuera de lugar. Lo que queda son **refinamientos incrementales**, no defectos.

---

## Hallazgos

### 1. Hooks que exceden 80 LOC (Power of 10)
24 hooks. Los 8 más relevantes para dividir en `*Query` + `*Mutations` o extraer lógica:

| Hook | LOC | Estrategia sugerida |
|---|---|---|
| `useActivityMetrics.ts` | 130 | Extraer agregaciones a `activityMetricsCalculators.ts` |
| `useProspectForm.ts` | 127 | Extraer validación a `prospectFormSchema.ts` |
| `quoteFormHelpers.ts` | 126 | Ya es helper puro; dividir por concern (lineItems vs totals) |
| `useInvoiceFormLogic.ts` | 122 | Separar submit + state |
| `useCompanySettings.ts` | 122 | Query + mutations |
| `useQuotePrefill.ts` | 120 | Extraer mapeo line_items a helper |
| `useInvoicePrefill.ts` | 120 | Idem |
| `useQuoteBookingCreator.ts` | 119 | Extraer side-effects (audit, recurring) |

**Hooks legítimamente largos** (no dividir): `use-toast.ts` (186) es shadcn upstream, no tocar.

### 2. Archivos UI 150-189 LOC
20 archivos en el rango 150-189. Solo **3 vale la pena dividir** por densidad de responsabilidades; el resto son tablas/PDFs coherentes:

- `MaintenancePoliciesTab.tsx` (178) — formulario inline largo, extraer `MaintenancePolicyForm.tsx`
- `CustomersPage.tsx` (165) — mezcla filtros + tabla + diálogos, extraer `CustomersToolbar.tsx`
- `FeedbackFormDialog.tsx` (162) — extraer `FeedbackFormFields.tsx`

**No tocar** (cohesivos): `IncomeStatementTable`, `ProfitabilityByModelReport`, todos los `pdf/*` (lógica jsPDF secuencial), `auditTrailConstants` (constantes).

### 3. `src/hooks/` root
12 archivos. Todos son **genuinamente compartidos** (UI/layout hooks: `usePagination`, `useListPage`, `useDialogState`, `useDocuments`, etc.). **No mover ninguno.**

### 4. Lo que NO encontré (estado sano)
- ✅ Ninguna feature fuera de `src/features/` (solo `NotFound` en `src/pages/`).
- ✅ Cero violaciones de tipo (`any`/`!`/`as`).
- ✅ Cero exports muertos (knip limpio).
- ✅ Convención `*Helpers.ts` / `*Builder.ts` aplicada uniformemente.
- ✅ Sin lógica de negocio en componentes UI (separación clara mantenida en v6.1.x).
- ✅ RLS + RPCs siguen el patrón `SET search_path = public`.

---

## Plan priorizado (de crítico a opcional)

### Alto valor (recomendado)
1. **Dividir los 3 hooks más severos** (>120 LOC) extrayendo helpers/schemas puros:
   - `useActivityMetrics` → extraer `activityMetricsCalculators.ts`
   - `useProspectForm` → extraer `prospectFormSchema.ts`
   - `useInvoiceFormLogic` → separar submit en hook propio

2. **Dividir 3 archivos UI** mencionados arriba en sub-componentes:
   - `MaintenancePoliciesTab` → `MaintenancePolicyForm`
   - `CustomersPage` → `CustomersToolbar`
   - `FeedbackFormDialog` → `FeedbackFormFields`

### Valor medio
3. **Normalizar hooks de prefill** (`useQuotePrefill`, `useInvoicePrefill`) extrayendo el mapeo de `line_items` a un helper compartido en `src/lib/domain/lineItemsMapper.ts` — elimina ~40 LOC duplicados.

4. **Dividir `useCompanySettings` y `useQuoteBookingCreator`** siguiendo el patrón query/mutations ya establecido en `useForklifts`/`useBookings`.

### Opcional / cosmético
5. **Mover `NotFound.tsx`** a `src/features/system/pages/` o documentar `src/pages/` como reservado para páginas globales del sistema. Decisión de bajo impacto.

6. **Crear barriles públicos por feature** (`src/features/<x>/index.ts`) — paso aplazado de v6.2. Aditivo, sin riesgo, pero requiere disciplina futura para mantener.

7. **Documentar reglas de tamaño** (≤150 LOC componentes, ≤80 hooks) en `architecture.md` §19 con criterios de excepción (tablas/PDFs cohesivos) para evitar refactors innecesarios futuros.

---

## Verificación tras implementación
- `npx eslint src` → 0 warnings
- `bunx vitest run` → 48/48 PASS
- `npx knip` → 0 dead exports
- Cada paso obtiene su entrada en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json`.

## Riesgo
**Muy bajo.** Los pasos 1-4 son mecánicos (extracción de helpers/sub-componentes con el patrón ya aplicado en 6 oleadas previas). 5-7 son aditivos.

## Recomendación
Ejecutar **pasos 1, 2 y 3** como v6.3.0 (minor). Pasos 4-7 quedan como backlog opcional ya que el codebase no muestra fricción real en su estado actual.