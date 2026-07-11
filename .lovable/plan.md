# Auditoría React — estado actual

## Diagnóstico

**Versión.** `react@19.2.7` y `react-dom@19.2.7` — última estable de la línea 19 (React Labs aún no promueve una 19.3/20 estable, así que estamos en el techo).

**Higiene estructural — impecable.**
- `0` usos de `React.forwardRef` (migrados en v7.12).
- `0` usos de `React.FC` / `React.FunctionComponent`.
- `0` componentes de clase, `0` PropTypes, `0` `'use client'` parásitos.
- Providers propios en la nueva sintaxis `<Context value>` de React 19.
- Routing con `lazy()` + `Suspense` por ruta, `PageFallback` tolerante a fallos.
- `19` `ErrorBoundary` distribuidos en rutas y widgets críticos.

**Pipeline moderno (v7.15–v7.16).**
- `useDeferredValue` en filtros globales (`useListFilters`).
- `useOptimistic` en Feedback.
- `useEffectEvent` nativo en `usePrefillEffect` y `usePageActions`.
- Derived state fuera de `useEffect` (patrón oficial *adjust state during render*).
- **React Compiler activo en el build de producción** (`babel-plugin-react-compiler` con `target: 19`).
- ESLint `react-compiler/react-compiler` como `warn` para detectar bail-outs.

**Lo que aún no está óptimo — 3 hallazgos.**

1. **15 warnings del Compiler.** 14 son bail-outs causados por `eslint-disable-next-line react-hooks/exhaustive-deps` que dejamos como cinturón de seguridad. Cada archivo con un disable queda excluido de la auto-memoización del Compiler. Hoy pierden optimización: `useListFilters`, `usePrefillEffect`, `pageActions`, `SearchBar`, `CustomersPage`, `useInvoicePrefill`, `useSupplierBillForm`, `SupplierBillFormDialog`, `RegisterSupplierPaymentDialog`, y los 4 tabs de Operations (`DriversTab`, `MechanicsTab`, `EquipmentModelsTab`, `MaintenancePoliciesTab`). El 15º es una impureza legítima en un test (`AuthQueryCacheSync.test.tsx`).
2. **197 llamadas a `useMemo`/`useCallback`/`memo` en `src/`.** Con Compiler activo la mayoría son redundantes, pero **no hay que borrarlas a mano**: el compilador ya las omite en producción y borrarlas manualmente sin auditoría rompería fast refresh y comportamiento en dev. Estrategia: dejarlas y priorizar sólo los archivos donde causan ruido de mantenimiento.
3. **`<Activity>` infrautilizado.** Sólo 1 import en todo el repo. Es la API estable de React 19.2 para preservar estado de UI oculta sin desmontar el árbol — ideal para nuestros drill-down sheets, tabs de Operations y modales pesados que hoy remontan `react-hook-form` cada vez que se abren.

## Plan de mejoras (Fase D + limpieza de bail-outs)

### Lote D.1 — Eliminar bail-outs del Compiler
Objetivo: bajar de 14 a ≤3 warnings de `react-compiler`.

- **`useListFilters`, `usePrefillEffect`, `pageActions`**: hoy usan `useEffectEvent` correctamente, pero conservan un `eslint-disable exhaustive-deps` por callbacks estables que el linter aún no infiere. Reemplazar el disable por refactor que ponga la dependencia real (una key primitiva) para que el linter esté conforme sin necesidad del comentario.
- **Tabs de Operations (`DriversTab`, `MechanicsTab`, `EquipmentModelsTab`, `MaintenancePoliciesTab`)**: comparten un patrón `useEffect([id]) → fetch → setState` con disable. Extraer a `useEffectEvent` para el fetch y depender sólo de `id`.
- **`SearchBar`, `CustomersPage`, `useInvoicePrefill`, `useSupplierBillForm`, `SupplierBillFormDialog`, `RegisterSupplierPaymentDialog`**: revisar caso por caso, eliminar el disable convirtiendo callbacks en `useEffectEvent` o moviendo la lógica al render cuando aplique.
- **`AuthQueryCacheSync.test.tsx`**: silenciar la regla sólo para tests (`overrides` en `eslint.config.js`) ya que la mutación es parte del setup, no del código de app.

Verificación: `bun run lint` con ≤3 warnings, `bun run test` 913/913.

### Lote D.2 — `<Activity>` en superficies pesadas
Adoptar `<Activity mode="visible|hidden">` para preservar estado (scroll, form, filtros) sin desmontar en:

- **Detail sheets con tabs** (`BookingDetailSheet`, `MaintenanceDetailPanel`, `SupplierBillDetailSheet`, `CustomerDetailSheet`): las tabs inactivas hoy se desmontan → perdemos scroll y form draft. Envolver cada tab en `<Activity mode={active ? 'visible' : 'hidden'}>`.
- **Command palette / global search** (`Ctrl+K`): al cerrar hoy pierde el query. Con `<Activity>` preservamos el input y los resultados listos para reabrir.
- **Dashboard con múltiples widgets pesados** (Recharts): ocultar los que están fuera del viewport con `<Activity mode="hidden">` cuando se colapsa una sección, en vez de condicional que remonta el chart.

Verificación: navegar entre tabs de un `BookingDetailSheet`, cambiar de tab y volver — el scroll y el formulario deben permanecer intactos. Screenshot como evidencia.

### Lote D.3 — Poda selectiva de `memo`/`useMemo`/`useCallback`
Sólo tras D.1: el Compiler ya auto-memoiza los archivos limpios, así que en esos archivos podemos borrar la memoización manual sin regresión. Alcance conservador: sólo componentes de UI puros con dependencies triviales (candidatos: `Sidebar`, `StatusBadge`, `IconButton`, `KpiTile`, `DetailRow`).

**No tocar** en este lote:
- `useMemo` sobre objetos que se pasan como dependencias de `useQuery` (React Query depende de identidad estable de `queryKey`).
- `useCallback` que se pasa como prop a componentes de terceros (Radix, dnd-kit).

Verificación: DevTools Profiler antes/después en `Dashboard` y `BookingsPage` — no debe haber más renders que la baseline.

### Fuera de alcance (para futuros sprints)
- `use()` para promises/context condicionales: hoy no tenemos flows que lo justifiquen (todo va por React Query).
- Server Components: no aplica, somos SPA con Vite.
- `useSyncExternalStore` para stores custom: no tenemos stores propios fuera de React Query y contextos ligeros.

## Detalles técnicos

- `eslint.config.js` requiere un bloque `overrides` para relajar `react-compiler/react-compiler` sólo en `src/**/*.test.tsx`.
- `Activity` es un export top-level de `react@19.2`. TypeScript ya lo reconoce con `@types/react@^19`.
- Al eliminar `useMemo`/`useCallback` en D.3, mantener los tests de rendering para atrapar regresiones sutiles de identidad (por ejemplo, `queryKey` inestable causando refetch loops).

## Verificación global al cerrar el sprint
- `bunx tsgo --noEmit` sin errores.
- `bun run lint` con ≤3 warnings (todos justificados).
- `bun run test` 913/913.
- `bun run build` completa < 60s.
- Changelog `v7.17.0` (D.1) y `v7.18.0` (D.2 + D.3).
