# Auditoría arquitectónica v6.2 (read-only)

## Estado de salud

| Métrica | Resultado |
|---|---|
| ESLint | **0 warnings, 0 errores** |
| Tests | **48/48 PASS** |
| Type safety (`any` / `!` / `as X`) | 0 violaciones fuera de tipos generados |
| Archivos >150 LOC (excl. UI/types) | **19** |
| Hooks >80 LOC (Power of 10) | **20** |
| Knip — exports muertos | 1 (`canPromptPickup`) |

El proyecto está **arquitectónicamente sano**. Las siete oleadas v6.0.x–v6.1.7 cerraron la deuda crítica. Lo que queda son refinamientos de **ubicación** y **encapsulamiento de límites de feature**, no defectos.

---

## Hallazgos clave

### 1. Lógica de dominio en `src/hooks/` que debería vivir en su feature
Cuatro hooks son claramente "dueños" de una feature, pero viven en el barril global:

| Hook | Feature dueña | Importadores cross-feature |
|---|---|---|
| `src/hooks/useProspects.ts` (123 LOC) | `crm` | 10 archivos, **todos en crm/customers** |
| `src/hooks/usePayments.ts` (103 LOC) | `invoices` | 3 archivos, todos en `invoices` |
| `src/hooks/useUserManual.ts` (106 LOC) | `help` | 1 archivo en `help` |
| `src/hooks/useDocuments.ts` | compartido (`damage` + 2 componentes globales) | mixto — **mantener en `src/hooks`** |

Esto contradice la regla "Domain Hooks" del memory (hooks granulares por feature).

### 2. Hooks que exceden el límite de 80 LOC (Power of 10)
20 hooks lo violan. Los 5 más severos:

- `useForklifts.ts` (155) — query + 4 mutations, separar en `useForkliftMutations`
- `useOperatingExpenses.ts` (149) — query + filtros + agregaciones
- `useBookings.ts` (139)
- `usePartsInventory.ts` (136)
- `useActivityMetrics.ts` (130)

### 3. Archivos >150 LOC (regla "≤150 LOC")
19 candidatos. Los 6 que vale la pena dividir:

- `CRMPage.tsx` (182) — extraer `CRMPageHeader` + `CRMKanbanGrid`
- `Fleet.tsx` (179) — extraer `FleetFiltersBar`
- `AssignForkliftsCard.tsx` (178)
- `MaintenancePoliciesTab.tsx` (178) — formulario inline largo
- `SupplierFormDialog.tsx` (171) — split en `SupplierFormFields`
- `BookingActions.tsx` (166) — múltiples diálogos inline

Los `IncomeStatementTable.tsx` (189) y `ProfitabilityByModelReport.tsx` (182) son tablas grandes pero coherentes; **no tocar**.

### 4. Acoplamiento cross-feature alto
Top 5 features que importan de otras: `reports` (15), `invoices` (15), `quotes` (13), `operations` (13), `bookings` (10). Es aceptable porque la mayoría son tipos compartidos (`Customer`, `Forklift`), pero indica que faltan **barriles públicos** (`features/<x>/index.ts`) que documenten qué es API pública vs interno.

### 5. Knip — código muerto
- `canPromptPickup` en `deliveryDetailHelpers.ts:41` no se usa.
- `knip.json` tiene 7 entradas redundantes/obsoletas.

### 6. Estructura `src/lib/`
Está limpia y bien segmentada (`domain/`, `forms/`, `pdf/`, `constants/`). **No requiere acción.**

### 7. `src/components/` raíz
26 componentes verdaderamente compartidos (DataTable, MobileCardList, PageHeader, etc.). Todos justificados. **No mover.**

---

## Plan de acción priorizado (de crítico a opcional)

### Crítico (alto ROI, bajo riesgo)
1. **Mover hooks de dominio a su feature**
   - `useProspects.ts` → `src/features/crm/hooks/useProspects.ts`
   - `usePayments.ts` → `src/features/invoices/hooks/usePayments.ts`
   - `useUserManual.ts` → `src/features/help/hooks/useUserManual.ts`
   - Actualizar ~14 imports. `useDocuments` se queda (compartido real).

2. **Eliminar export muerto** `canPromptPickup` y limpiar `knip.json` (7 hints).

### Alto valor
3. **Dividir hooks >120 LOC** siguiendo el patrón ya usado en `useBookingFormLogic`:
   - `useForklifts` → `useForkliftsQuery` + `useForkliftMutations`
   - `useOperatingExpenses` → query / filters / aggregations
   - `useBookings` → query + mutations
   - `usePartsInventory` → query + mutations
   - `useProspects` (tras mover) → query + mutations

4. **Dividir 6 archivos UI >150 LOC** mencionados arriba en sub-componentes presentacionales puros. Patrón idéntico a v6.1.5/6.

### Mejora estructural
5. **Crear barriles públicos por feature** (`src/features/<x>/index.ts`) que re-exporten solo los tipos/hooks/componentes que otras features pueden usar. Permite detectar imports "internos" rotos y reducir el acoplamiento medido.

6. **Convención de nombres** para `lib/` por feature: hoy coexisten `*Helpers.ts`, `*Utils.ts`, `*Builder.ts`. Estandarizar a `*Helpers.ts` (puros) y `*Builder.ts` (efectos como PDF).

### Opcional
7. **Migrar a alias de barrel imports** dentro de cada feature (`@/features/crm` en vez de paths profundos) una vez existan los `index.ts` del paso 5.

8. **Considerar mover** `src/pages/AuthPage.tsx` + `src/pages/auth/` a `src/features/auth/` para coherencia (única feature fuera de `features/`).

9. **Documentar la regla "domain hooks"** en `architecture.md` con ejemplos del antes/después del paso 1, para prevenir regresiones.

---

## Verificación tras implementación
- `npx eslint src` → 0 warnings
- `bunx vitest run` → 48/48 PASS
- `npx knip` → 0 exports muertos
- Agregar entrada `v6.2.0` (minor — reorganización notable) al changelog.

## Riesgo
**Bajo.** Pasos 1–4 son mecánicos (mover archivo + actualizar imports + split presentacional). Pasos 5–9 son aditivos.
