

# Análisis de Refactorización — LiftGo ERP

## Contexto General
He realizado una auditoría completa del código después de múltiples ajustes recientes. El proyecto mantiene una arquitectura sólida pero presenta varias oportunidades de refactorización para mejorar mantenibilidad, performance y consistencia.

---

## Oportunidades de Refactorización Identificadas

### 1. **Consolidación de Patrones de Lista (PRIORIDAD ALTA)**

**Problema:**
- BookingsPage, InvoicesPage, QuotesPage, ContractsPage, CustomersPage, Fleet y MaintenancePage repiten el mismo patrón: `useListFilters` + `useSort` + `usePagination` + `useIsMobile`
- Ya existe `useListPage` hook que combina esta lógica, pero solo se usa en ReturnInspectionPage y MaintenancePage parcialmente

**Solución:**
- Migrar todas las páginas de lista para usar `useListPage` consistentemente
- Eliminar imports redundantes de `useSort`, `usePagination`, `useListFilters`, `useIsMobile` en páginas que puedan usar `useListPage`

**Impacto:**
- Reduce ~20-30 líneas de boilerplate por página (7-8 páginas afectadas)
- Mejora mantenibilidad: cambios en lógica de paginación solo requieren modificar 1 hook

---

### 2. **Extracción de Lógica de Diálogos de Estado (PRIORIDAD MEDIA)**

**Problema:**
- MaintenancePage, BookingActions, y otras páginas manejan diálogos con estado local (`dialogOpen`, formularios, etc.)
- Patrón repetido: `useState(false)` para diálogos + `reset()` + `setDialogOpen`

**Solución:**
- Crear hook `useDialogState<T>(initialForm)` que retorne:
  ```ts
  {
    open, 
    openDialog, 
    closeDialog, 
    form, 
    setField, 
    resetForm
  }
  ```
- Consolidar lógica de apertura/cierre/reset en un solo lugar

**Impacto:**
- Reduce ~5-8 líneas por diálogo
- Elimina errores comunes (olvidar reset al cerrar)

---

### 3. **Optimización de Memoización en Dashboard (PRIORIDAD BAJA)**

**Problema:**
- Dashboard.tsx tiene 8 `useMemo` diferentes para transformar `stats` (pieData, agingBuckets, maintenanceAlerts, etc.)
- Muchos son mapeos triviales que no necesitan memoización

**Solución:**
- Consolidar transformaciones simples en una sola
- Solo memoizar cálculos costosos (agingBuckets, pieData)
- Ejemplo:
  ```ts
  const dashboardData = useMemo(() => ({
    pieData: [...],
    agingBuckets: [...],
    statCards: [...]
  }), [stats, counts, outstandingRevenue]);
  ```

**Impacto:**
- Reduce complejidad cognitiva
- Mejora legibilidad (1 bloque en vez de 8)

---

### 4. **Centralización de Exports CSV (PRIORIDAD BAJA)**

**Problema:**
- Fleet, MaintenancePage, CustomersPage, InvoicesPage repiten inline `.map()` complejos para `exportToCsv`
- Lógica de mapeo dispersa en componentes UI

**Solución:**
- Crear funciones helper en `src/lib/exportHelpers.ts`:
  ```ts
  export const exportForklifts = (data: Forklift[]) => 
    exportToCsv("flota.csv", data.map(f => ({...})));
  
  export const exportMaintenanceLogs = (logs: MaintenanceLog[], forkliftMap: Map) =>
    exportToCsv("mantenimiento.csv", logs.map(l => ({...})));
  ```

**Impacto:**
- Reutilizable en reportes
- Testeable independientemente
- Separa lógica de negocio de UI

---

### 5. **Estandarización de Manejo de Errores en Hooks (PRIORIDAD MEDIA)**

**Problema:**
- `useBookings`, `useCreateBooking`, etc. usan imports dinámicos inconsistentes para toast:
  ```ts
  import("@/hooks/use-toast").then(({ toast }) => ...)
  ```
- Algunos usan `sonner` directamente, otros usan `@/hooks/use-toast`

**Solución:**
- Estandarizar en `sonner` (ya está implementado)
- Eliminar dynamic imports de toast
- Usar `toast.error()` directamente en `onError` de mutations

**Impacto:**
- Comportamiento consistente de errores
- Elimina código innecesario

---

### 6. **Simplificación de BookingActions (PRIORIDAD BAJA)**

**Problema:**
- BookingActions.tsx tiene lógica compleja de preview de costos, extensiones, cancelaciones
- 184 líneas con múltiples estados locales

**Solución:**
- Extraer sub-componentes:
  - `ExtendBookingDialog` (líneas 164-180)
  - `DeleteBookingDialog` (AlertDialog repetido 2 veces)
- Mover lógica de preview a hook `useBookingCostPreview`

**Impacto:**
- Reduce complejidad de BookingActions a ~80 líneas
- Reutilizable (DeleteBookingDialog se repite)

---

### 7. **Type Safety en InvoiceForm CFDI (PRIORIDAD BAJA)**

**Problema:**
- `initialCfdi` objeto usa string literals sin type guard
- Campos como `formaPago`, `metodoPago` deberían tener tipos más estrictos

**Solución:**
- Crear types en `src/lib/satCatalogs.ts`:
  ```ts
  export type FormaPago = "01" | "02" | "03" | "04" | ...;
  export type MetodoPago = "PUE" | "PPD" | "PIP";
  ```
- Usar en `initialCfdi` y `CfdiFieldsCard`

**Impacto:**
- Previene valores inválidos en runtime
- Autocomplete mejorado

---

### 8. **Consolidación de Mapeo de Forklifts (PRIORIDAD BAJA - YA IMPLEMENTADO)**

**Nota:**
- `useForkliftMap` ya existe y es una buena abstracción
- MaintenancePage, ReturnInspectionPage, DeliveriesPage ya lo usan
- ✅ No requiere acción adicional

---

## Resumen de Prioridades

| # | Oportunidad | Prioridad | Esfuerzo | ROI |
|---|-------------|-----------|----------|-----|
| 1 | Consolidar `useListPage` | ALTA | 4h | Alto - Afecta 8 páginas |
| 2 | Hook `useDialogState` | MEDIA | 2h | Medio - Mejora DX |
| 5 | Estandarizar error handling | MEDIA | 1h | Alto - Consistencia |
| 6 | Simplificar BookingActions | BAJA | 2h | Medio - Legibilidad |
| 3 | Optimizar memoización Dashboard | BAJA | 1h | Bajo - Micro-optimización |
| 4 | Centralizar exports CSV | BAJA | 1.5h | Bajo - Nice to have |
| 7 | Type safety CFDI | BAJA | 1h | Bajo - Prevención |

---

## Recomendación

### Refactorización Mínima (Solo Prioridad ALTA):
- **Consolidar `useListPage`** en todas las páginas de lista
- **Tiempo estimado:** 4 horas
- **Beneficio:** Reducción significativa de código duplicado, mantenimiento más fácil

### Refactorización Completa (ALTA + MEDIA):
- Incluye también error handling y `useDialogState`
- **Tiempo estimado:** 7 horas
- **Beneficio:** Código más robusto, DX mejorado, menos errores

### Sin Refactorización:
El código actual es **funcional y mantenible**. No hay problemas críticos que bloqueen nuevas features. Las oportunidades identificadas son mejoras incrementales, no fixes urgentes.

---

## Notas Positivas (No Requieren Refactor)

✅ **Arquitectura de componentes:** Modularización excelente (ForkliftDetail, InvoiceDetail con sub-componentes)  
✅ **Type safety:** Uso correcto de tipos de Supabase, `src/types/rental.ts` bien estructurado  
✅ **Hooks de dominio:** `useForklifts`, `useBookings`, etc. bien organizados  
✅ **Constantes centralizadas:** `src/lib/constants.ts` previene magic strings  
✅ **Form handling:** `useFormState` + Zod schemas es un patrón sólido  
✅ **Error boundaries:** Implementados correctamente en `App.tsx`  

