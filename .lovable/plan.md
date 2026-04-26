## Plan: 5 Mejoras Arquitectónicas — v5.39.0

Ejecutables en un solo paso. Objetivo: reducir errores ESLint de **48 → ≤20**, eliminar `any` en tests y modularizar las páginas restantes >240 LOC.

---

### 🔴 Mejora 1: Tipar mocks de Supabase en tests (elimina ~13 errores `any`)
**Problema**: `src/test/paymentFlow.test.ts`, `invoiceFlow.test.ts`, `bookingFlow.test.ts`, `exportCsv.test.ts` y `pages/__tests__/InvoicesPage.test.tsx` usan `any` para los mocks del cliente Supabase.

**Acciones**:
- Crear `src/test/helpers/mockSupabase.ts` con un tipo `MockSupabaseQuery<T>` reutilizable (basado en `PostgrestQueryBuilder`) y un factory `createSupabaseMock()`.
- Reemplazar todos los `any` en archivos de tests por el tipo helper.

---

### 🔴 Mejora 2: Modularizar `SuppliersPage.tsx` (264 LOC) e `InventoryPage.tsx` (246 LOC)
**Problema**: Ambas páginas mezclan tabla + diálogo de creación/edición + filtros + acciones de eliminación inline.

**Acciones**:
- Crear `src/components/suppliers/SupplierFormDialog.tsx` y `src/components/suppliers/SupplierDeleteDialog.tsx`.
- Crear `src/components/inventory/PartFormDialog.tsx` y `src/components/inventory/PartDeleteDialog.tsx` (PartDetailSheet ya existe).
- Las páginas quedan como orquestadores (~120 LOC) enfocados en data fetching + composición.

---

### 🟡 Mejora 3: Dividir `contractSections.ts` (159 LOC) por sección
**Problema**: Después del refactor v5.38.0, este archivo agrupa 4 funciones de dibujo independientes que cumplen propósitos distintos (header, declaraciones, cláusulas, firmas).

**Acciones**:
- Crear `src/lib/pdf/contract/sections/` con: `header.ts`, `declarations.ts`, `clauses.ts`, `signatures.ts`.
- Mantener `contractSections.ts` como barrel export para no romper imports.

---

### 🟡 Mejora 4: Tipar `checklistPage.ts` y `pagarePage.ts`
**Problema**: Los anexos del contrato (Anexo A: Checklist, Pagaré) quedaron sin el mismo tratamiento de tipado estricto que recibió `shared.ts` y `contractSections.ts`.

**Acciones**:
- Reemplazar `any` por tipos `jsPDF` y por las interfaces ya disponibles en `fetchers.ts` (`ContractData`, etc.).
- Definir tipo `ChecklistItem` y `PagareData` explícitos.

---

### 🟢 Mejora 5: Tipar hooks genéricos (`useListPage`, `useListFilters`, `useSort`, `useAuditLogs`)
**Problema**: Hooks reutilizables en toda la app usan `any` en sus parámetros genéricos, propagando pérdida de tipos a cada consumidor.

**Acciones**:
- Reemplazar `any` por `unknown` o por generics restringidos (`<T extends Record<string, unknown>>`).
- Revisar consumidores y ajustar firmas según necesidad (cambio invisible en runtime).

---

## ✅ Verificación
1. `bunx tsc --noEmit` → 0 errores
2. `bunx eslint src --quiet` → reducir de **48 → ≤20** errores
3. Probar visualmente: SuppliersPage, InventoryPage (CRUD), generación de PDF de contrato (con anexos).

## 📝 Changelog
Agregar entrada **v5.39.0 (minor)** — "Tipado estricto en tests y hooks genéricos, modularización de Suppliers/Inventory, división del módulo PDF de contratos por sección."
