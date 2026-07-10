## Objetivo
Medir el rendimiento actual (post React 19) con Lighthouse, comparar contra un baseline React 18 reproducible, y atacar los cuellos de botella reales del tiempo de carga.

## Fase 1 — Preparación de mediciones

1. Build de producción local (`bun run build && bun run preview`) sobre puerto fijo.
2. Ejecutar Lighthouse vía Playwright + `lighthouse` CLI (headless Chromium ya disponible en sandbox) contra 3 rutas clave:
   - `/` (landing / login)
   - `/dashboard` (autenticado, con sesión inyectada)
   - `/reservas` (tabla densa, caso típico de uso)
3. Guardar reportes JSON+HTML en `/mnt/documents/perf/after-react19/` con métricas: LCP, FCP, TBT, CLS, TTI, bundle size, unused JS.

## Fase 2 — Baseline React 18 (comparativo)

1. Checkout temporal en worktree aislado (`/tmp/perf-baseline`) con `react@18.3.1` + `react-dom@18.3.1`.
2. Build + Lighthouse sobre las mismas 3 rutas.
3. Guardar en `/mnt/documents/perf/before-react19/`.
4. Generar tabla comparativa en `/mnt/documents/perf/COMPARISON.md` (delta por métrica y por ruta).

## Fase 3 — Análisis de bundle

1. `vite build --mode production` con `rollup-plugin-visualizer` (temporal, no se commitea).
2. Identificar top 10 chunks pesados y dependencias sospechosas (jsPDF ya lazy, revisar: recharts, facturapi client, date-fns locales, lucide-react tree-shaking).
3. Detectar imports síncronos que deberían ser `lazy()` (rutas admin, reportes, PDFs).

## Fase 4 — Optimizaciones dirigidas (solo lo que la data justifique)

Candidatos probables (priorizados por impacto esperado):

- **Route-level code splitting**: convertir a `lazy()` rutas pesadas no críticas (Reportes, Auditoría, Facturación PDF, Portal cliente si no lo está).
- **Preload LCP**: `<link rel="preload">` para logo/hero + `fetchpriority="high"`.
- **Recharts**: importar sub-módulos específicos en lugar del barrel si el visualizer lo señala.
- **Lucide-react**: verificar imports individuales (no `import * as`).
- **date-fns**: garantizar solo locale `es` importado.
- **React Query**: revisar `staleTime` en queries del dashboard para reducir refetch en navegación.
- **React 19 nativo**: usar `<title>`/`<meta>` in-component donde aplique para eliminar wrappers manuales si los hay.

Cada optimización aplicada se remide con Lighthouse antes de aceptarse.

## Fase 5 — Verificación final

1. Re-ejecutar Lighthouse en las 3 rutas post-optimización → `/mnt/documents/perf/after-optimizations/`.
2. Actualizar tabla comparativa (before-18 / after-19-baseline / after-optimized).
3. `tsgo` + `vitest run` + smoke test Playwright.
4. Changelog `v7.1.0` (minor: mejoras de rendimiento medibles) con deltas concretos.

## Detalles técnicos

- Lighthouse se instalará on-demand vía `nix run nixpkgs#lighthouse` o `bunx lighthouse`.
- Auth para rutas protegidas: sesión Supabase inyectada como en el flujo estándar de Playwright del proyecto.
- `rollup-plugin-visualizer` se agrega como `devDependency` temporal y se remueve al cerrar el sprint (o queda gated por env var).
- Sin cambios de lógica de negocio; solo carga/split/preload/imports.

## Entregables

- `/mnt/documents/perf/COMPARISON.md` con métricas antes/después.
- PR de optimizaciones acotadas y justificadas por métrica.
- Changelog `v7.1.0`.

## Fuera de alcance

- Migración a SSR/RSC.
- Cambios visuales o de UX.
- Rewrites de módulos completos.
