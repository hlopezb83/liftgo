# 5 mejoras arquitectónicas de alto impacto (v5.42.0)

## Diagnóstico

Estado actual: **0 errores TS, 0 errores ESLint, 45 warnings**. La arquitectura base es sólida (Page → Hook → UI, RLS, RPCs, PDF modular). Los warnings restantes se concentran en **páginas-detalle con lógica de acciones inline** y **diálogos-formulario monolíticos**, lo que rompe el patrón ya establecido en el resto del código.

## Top 5 mejoras (ejecutables en 1 paso)

### 1. `ContractDetail.tsx` — complejidad 27 (la más alta del proyecto)
- **Problema:** mezcla fetch, estados de firma, generación PDF, eliminación y navegación en una sola función.
- **Acción:** extraer a `src/hooks/contractDetail/useContractDetailLogic.ts` (estados + handlers de firma/PDF/delete). La página queda como contenedor puro.

### 2. `Dashboard.tsx` — complejidad 25
- **Problema:** orquesta KPIs, alertas, charts y navegación condicional por rol con lógica inline.
- **Acción:** extraer la composición de secciones y el filtrado por permisos a `src/hooks/dashboard/useDashboardSections.ts`. La página renderiza una lista declarativa.

### 3. `BookingForm.tsx` — complejidad 24
- **Problema:** existe `useBookingFormLogic` parcial, pero la página retiene cálculos de fechas/costos y manejo de errores de rangos.
- **Acción:** consolidar estado derivado (validaciones de rango, cálculo de costo, prefill) en el hook existente. Extraer `BookingPeriodSection.tsx` para fechas + costo.

### 4. `ProspectFormDialog.tsx` — complejidad 20
- **Problema:** el diálogo combina formulario CRM + acciones de cierre de deal + creación de cotización vinculada.
- **Acción:** completar migración a `ProspectCloseDealActions.tsx` (ya existe parcial) y mover validaciones a `useProspectForm.ts`.

### 5. `routes.tsx` — warning de fast-refresh
- **Problema:** exporta componentes lazy y la constante `appRoutes` en el mismo archivo, rompiendo HMR.
- **Acción:** mover `appRoutes` y `PageFallback` a `src/lib/routes-config.ts`. `routes.tsx` re-exporta para compatibilidad.

## Verificación final
- `npx tsc --noEmit` → 0 errores
- `npx eslint` → 0 errores, ≤ 38 warnings (reducción de ~7)
- Actualizar `public/changelog.json` a **v5.42.0** (minor)
- Sin cambios de UI ni de comportamiento visible al usuario

## Fuera de alcance (futuro)
- `GanttChart` (176 líneas) y `MaintenancePage` (212 líneas) — requieren rediseño de UI.
- `drawPremiumTable` y `calculateRentalCost` — lógica matemática estable; refactor con riesgo > beneficio.