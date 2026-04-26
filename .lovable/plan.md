## Plan: 5 Mejoras Arquitectónicas Críticas — v5.38.0

Ejecutar todas las mejoras en un solo paso, verificar con `tsc --noEmit` y actualizar changelog (minor).

---

### 🔴 Mejora 1: Refactor `ContractDetail.tsx` (Complejidad 31 → ~8)
**Problema**: Página monolítica que mezcla fetching, generación de PDF, firma electrónica y renderizado.

**Acciones**:
- Crear `src/hooks/contractDetail/useContractDetailActions.ts` — Centraliza acciones (regenerar PDF, firmar, eliminar).
- Crear `src/components/contracts/ContractPDFButton.tsx` — Encapsula generación + descarga PDF.
- Crear `src/components/contracts/SignaturePad.tsx` — Aísla la lógica de firma electrónica.
- Eliminar el `any` en línea 23 (tipar correctamente con tipos de Supabase).

---

### 🔴 Mejora 2: Refactor `DeliveryDetail.tsx` (Complejidad 28, 197 LOC → ~80 LOC)
**Problema**: Mezcla mutaciones, fetching y cards inline.

**Acciones**:
- Extraer secciones a `src/components/deliveries/`:
  - `DeliveryStatusCard.tsx`
  - `DeliveryEquipmentCard.tsx`
  - `DeliveryRouteCard.tsx`
- Crear `src/hooks/deliveryDetail/useDeliveryActions.ts` para mutaciones (completar, cancelar).

---

### 🔴 Mejora 3: Modularizar `Dashboard.tsx` (Complejidad 27)
**Problema**: Orquestación de KPIs, alertas y charts sin extracción.

**Acciones**:
- Verificar y consolidar secciones en `src/components/dashboard/`:
  - `DashboardKpiSection.tsx` (agrupa StatCards + FinancialKpiCards)
  - `DashboardAlertsSection.tsx` (agrupa AlertsRow + ExpiringContractsAlert + InsuranceAlert)
  - `DashboardChartsSection.tsx` (agrupa CashFlowChart + UtilizationCharts + FleetStatusChart)
- Resultado: Dashboard.tsx queda como orquestador de 3 secciones (~50 LOC).

---

### 🟡 Mejora 4: Tipar `src/lib/pdf/shared.ts` y eliminar `any` críticos
**Problema**: `any` en helpers PDF compartidos propaga falta de tipos a todos los generadores.

**Acciones**:
- Reemplazar `any` en `shared.ts` (líneas 48, 59) con tipos explícitos basados en `jsPDF` y opciones reales usadas.
- Corregir `any` en `BookingForm.tsx` (líneas 107-108), `PortalInvoiceDetail.tsx` (línea 86) y `ContractDetail.tsx` (línea 23).
- Corregir 3 errores `prefer-const` (`incomeStatement/header.ts` × 2, `HelpPage.tsx` × 1).

---

### 🟡 Mejora 5: Refactor `generateContractPages` (Complejidad 24)
**Problema**: Función monolítica genera todas las páginas del contrato (legal + Anexo A + Anexo B).

**Acciones**:
- Dividir `src/lib/pdf/contract/contractPage.ts` en funciones por sección:
  - `drawContractHeader()`
  - `drawClauses()` (cláusulas legales)
  - `drawSignatures()`
- Mantener `generateContractPages` como orquestador delgado (<50 LOC, complejidad <10).

---

## ✅ Verificación
1. `bunx tsc --noEmit` → 0 errores
2. `bunx eslint src --quiet` → reducir de 58 a ≤30 errores
3. Probar visualmente: Dashboard, ContractDetail (regenerar PDF + firmar), DeliveryDetail.

## 📝 Changelog
Agregar entrada **v5.38.0 (minor)** — "Refactor arquitectónico: reducción de complejidad en páginas de detalle, modularización de Dashboard y tipado estricto en generadores PDF."
