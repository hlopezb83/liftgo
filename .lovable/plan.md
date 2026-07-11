## Auditoría de React — Estado actual

### Versión
- `react` / `react-dom` / `@types/react`: **19.2.7** (última estable de la línea 19; la 19.2 salió en oct-2026 y trae `<Activity>`, `useEffectEvent`, `cacheSignal`).
- `vite` 5.4.21 · `@vitejs/plugin-react-swc` (SWC, sin Babel).
- `@tanstack/react-query` 5.101, `react-hook-form` 7.81, `react-router-dom` 6.
- ESLint 9 + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` + `eslint-plugin-react-compiler` (instalado, regla en `off`).

### ¿Está limpia? Sí, muy limpia
Señales positivas:
- **0 `React.forwardRef`** en todo `src/` — Lote 1 de la modernización a 19 completado.
- **0 `React.FC`**, **0 `PropTypes`**, **0 lifecycles de clase**, **0 `'use client'`** parásitos.
- Routing con `lazy()` + `Suspense` por ruta, `PageFallback` con timeout de 10s, `RouteErrorBoundary` en cada Route → el árbol es split de verdad.
- Providers propios ya migrados a la sintaxis `<Context value={…}>` de React 19.
- APIs concurrentes ya en uso: `useDeferredValue` en `useListFilters` (7 pantallas), `useOptimistic` en Feedback.
- `useSyncExternalStore` presente (1 store externo). `React.memo` usado en apenas 13 archivos: uso responsable, no cargo-cult.
- Helper `usePrefillEffect` para centralizar el único `exhaustive-deps` disable del proyecto.
- Vite dedupe `react`/`react-dom`, chunking manual, visualizer bajo `ANALYZE=1`.

### Anti-patrones remanentes (menores, no bloqueantes)
1. `useEffect(() => setPage(1), [filter, ...])` en `ChangelogPage` y `useEffect(() => setSelected(new Set(eligibleIds)), [eligibleIds])` en `RecurringInvoicesPreviewDialog` — clásico "derived state" que se puede reemplazar por `useMemo` + `key`.
2. `useCallback`/`useMemo` "por defecto" en algunos hooks (`useDashboardSections`, `useStatementRows`, `useListPage`) — con React Compiler activo dejan de ser necesarios.
3. `React Compiler` está instalado pero **desactivado** porque el pipeline usa SWC. Migrar a `@vitejs/plugin-react` (Babel) permitiría prender el compilador y borrar la mayoría de los `useMemo`/`useCallback` manuales.

### ¿Es top of the line? Con dos movimientos, sí.

---

## Propuesta de mejora — Auditoría React (Lote 5)

Alcance quirúrgico, sin cambios de comportamiento visibles al usuario.

### Fase A — Activar React Compiler (opt-in)
1. Añadir plugin Babel como pipeline paralelo al SWC actual: mantener `@vitejs/plugin-react-swc` para HMR/dev y encender `babel-plugin-react-compiler` sólo en build de producción vía `@vitejs/plugin-react` en un `defineConfig` condicional. Alternativa más simple: swap completo a `@vitejs/plugin-react` y medir HMR.
2. Configurar el compilador en modo **annotation-only** (`compilationMode: "annotation"`) para arrancar: sólo compila archivos con `"use memo"` en la cabecera. Riesgo cero.
3. Prender `react-compiler/react-compiler: "warn"` en ESLint globalmente para detectar violaciones (mutaciones, refs mal usadas).
4. Piloto: anotar 3 hooks calientes (`useDashboardSections`, `useListFilters`, `useStatementRows`) y verificar que el bundle no crece y los tests pasan.

**Beneficio**: cuando movamos a `compilationMode: "infer"`, podemos borrar la mayoría de `useMemo`/`useCallback` manuales del proyecto (estimado 150-250 LOC).

### Fase B — Eliminar "derived state" con `useEffect`
1. `ChangelogPage`: reemplazar el efecto que resetea `page` a 1 por `useMemo` que deriva la página o por `key={filter+categoryFilter+search}` en el subárbol paginado.
2. `RecurringInvoicesPreviewDialog`: reemplazar el efecto que rehidrata `selected` cuando cambia `eligibleIds` por `useMemo` + un `Set` local sin `useState`, o por `key={eligibleIds.join()}` en el subárbol.
3. Barrido con `rg` para detectar el patrón `useEffect(() => { setX(...) }, [prop])` en el resto del proyecto.

### Fase C — Adoptar `useEffectEvent` de React 19.2
1. Reemplazar `usePrefillEffect` (que hoy usa un `ref` manual como polyfill) por el nuevo `useEffectEvent` estable en 19.2.
2. Eliminar el único `eslint-disable react-hooks/exhaustive-deps` del proyecto, contenido en ese helper.
3. Auditar `usePageActions` — su `ref.current = actions` es otro caso claro para `useEffectEvent`.

### Fase D — Ajustes finos
1. `useSyncExternalStore` review: confirmar que `getServerSnapshot` está tipado, no genera flash de hidratación.
2. Revisar los 13 archivos con `React.memo`: dejarlo sólo donde el profiler muestra beneficio; con React Compiler la mayoría se vuelven redundantes.
3. Considerar `<Activity mode="hidden">` (nuevo en 19.2) para el sheet lateral de detalles: mantiene state cuando el sheet se cierra sin desmontarlo, evitando refetch al reabrir.

### Verificación por fase
- `tsgo` (typecheck) OK, `bun run lint` 0 warnings, `bun run test` verde (913 tests hoy).
- Bundle diff con `ANALYZE=1 bun run build` antes/después de Fase A.
- Smoke manual: login, dashboard, factura, cotización, sheet de feedback.

### Detalle técnico condensado
- **Compiler**: `compilationMode: "annotation"` → `"infer"` con `panicThreshold: "none"`. Chequeo con `react-compiler-runtime` en dev.
- **`<Activity>`**: `import { unstable_Activity as Activity } from "react"` (aún prefijado unstable_ en 19.2). Alternativa segura: dejar para 19.3.
- **`useEffectEvent`**: `import { experimental_useEffectEvent as useEffectEvent } from "react"` — check final del nombre en 19.2 antes de mergear.

### Fuera de alcance
- No tocar shadcn/ui (`src/components/ui/**` ya está en ignore de ESLint).
- No migrar a Server Components / Next.js — este es un SPA client-side, no aplica.
- No cambiar React Query, React Hook Form ni React Router.
- No modificar Edge Functions.

### Salida esperada
- Reporte de LOC borradas por el compilador.
- 1 changelog `v7.15.0` (Compiler + fases B/C) o hasta `v7.18.0` si preferimos entregar fase por fase.
