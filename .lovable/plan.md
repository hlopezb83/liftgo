# Auditoría Vite 7 — LiftGo

## Veredicto

**Implementación limpia y moderna (8.5/10).** Está en la última mayor (Vite 7.3 + `@vitejs/plugin-react` 5), con React Compiler en build de producción, `manualChunks` semánticos, lazy imports en rutas y `rollup-plugin-visualizer` bajo flag. No es "top of the line" todavía por 5 huecos concretos, todos accionables.

## Lo que está bien

- Vite 7 y `@vitejs/plugin-react` 5 al día; sin plugins obsoletos.
- React Compiler activo en build, desactivado en Vitest (correcto — no aporta en jsdom/happy-dom).
- `manualChunks` por dominio (recharts, radix, react-pdf, jspdf, xlsx, date-fns, icons, vendor) — mejor que el default.
- `dedupe: ["react", "react-dom"]` previene doble instancia con Vite 7.
- HMR overlay off (consistente con Sentry como fuente de verdad).
- `main.tsx` maneja `vite:preloadError` con reload-once → resuelve chunks stale tras deploy.
- ANALYZE=1 opcional evita costo en build normal.
- `lovable-tagger` solo en `mode === "development"`.

## Huecos detectados

### 1. Falta Sentry sourcemaps en build de producción `[alto valor]`
`@sentry/vite-plugin@5.4.0` está en devDependencies pero **no se usa en `vite.config.ts`**. Sentry recibe stack traces minificadas → los errores en producción son casi ilegibles. Es el hueco más importante dado que ya pagás Sentry (`@sentry/react` 10.65).

### 2. Fuentes cargadas por `<link rel="stylesheet">` bloqueante
`index.html` línea 9 hace `<link rel="stylesheet" ...fonts.googleapis.com...>` sin `media="print" onload` ni preload del woff2. Bloquea FCP ~150-300ms. Ya hay `preconnect`, falta el patrón non-blocking.

### 3. `build.target` implícito (baseline "widely available")
Vite 7 cambió el default a `baseline-widely-available` (Safari 15.4+, Chrome 107+). No está declarado, así que cualquiera que abra `vite.config.ts` no sabe qué se compila. Debería ser explícito.

### 4. `optimizeDeps.include` no está afinado
Deps grandes que sí se usan en la primera pantalla (`@tanstack/react-query`, `react-router`, `sonner`, `date-fns`, `zod`) no están pre-bundleadas explícitamente. El primer `vite dev` frío hace muchos "new dependency detected" y recarga. Costo dev, no prod.

### 5. `manualChunks` como función tiene un false-positive
`/react/` matchea también `react-dom`, `react-router`, `react-hook-form`, `@tanstack/react-query`, `react-day-picker`, etc. La intención era aislar `react` core, pero el orden actual funciona por casualidad (react-dom se captura antes en `vendor`). Frágil ante el próximo edit.

### 6. Sin `build.reportCompressedSize: false`
Cada build calcula gzip de cada asset — suma 3-5s en CI. Con `visualizer` ya bajo flag, esto es puro overhead.

### 7. `postcss.config.js` con `autoprefixer` explícito
Tailwind v4 + `@tailwindcss/postcss` ya incluye autoprefixing vía Lightning CSS. `autoprefixer` en el pipeline es redundante y suma un paso PostCSS extra.

### 8. `preview` sin puerto/host fijo
`bun run preview` no hereda `server.host/port`. Menor, pero rompe QA reproducible.

## Plan de mejora propuesto (por lote)

### Lote A — Alto impacto (30 min)
1. **Sentry sourcemaps**: agregar `sentryVitePlugin` al final del array de plugins, gated por `process.env.SENTRY_AUTH_TOKEN` para no romper builds locales/CI sin secret.
2. **Fonts non-blocking**: cambiar `<link rel="stylesheet">` a `<link rel="preload" as="style" onload="this.rel='stylesheet'">` + `<noscript>` fallback.
3. **Explicit `build.target`**: declarar `build: { target: "es2022" }` (o `baseline-widely-available`) con comentario.

### Lote B — Higiene DX (20 min)
4. **`optimizeDeps.include`**: listar las 6-8 deps críticas de first paint.
5. **`manualChunks` robusto**: reemplazar `/react/` por match exacto `react/`+`scheduler/` y reordenar para que `vendor` sea el fallback explícito.
6. **`build.reportCompressedSize: false`** con nota en config.
7. **`preview: { host: "::", port: 8080 }`** para paridad con `server`.

### Lote C — Simplificación (10 min)
8. Quitar `autoprefixer` de `postcss.config.js` y de devDependencies (Tailwind v4 lo cubre).

## Detalles técnicos

Diff aproximado de `vite.config.ts` tras Lotes A+B:

```ts
plugins: [
  react({ babel: { plugins: [["babel-plugin-react-compiler", { target: "19" }]] } }),
  mode === "development" && componentTagger(),
  process.env.ANALYZE === "1" && visualizer({ ... }),
  process.env.SENTRY_AUTH_TOKEN && sentryVitePlugin({
    org: "liftgo",
    project: "liftgo-web",
    authToken: process.env.SENTRY_AUTH_TOKEN,
    sourcemaps: { assets: "./dist/**" },
  }),
].filter(Boolean),
build: {
  target: "es2022",              // Safari 16.4+, Chrome 111+, Firefox 128+
  sourcemap: true,               // requerido por Sentry, gzip lo compensa
  reportCompressedSize: false,
  rollupOptions: { output: { manualChunks: (id) => { ... } } },
},
optimizeDeps: {
  include: [
    "react", "react-dom", "react-router", "react-router-dom",
    "@tanstack/react-query", "sonner", "date-fns", "zod",
  ],
},
preview: { host: "::", port: 8080 },
```

## Fuera de alcance (mencionado pero no ejecutado)
- No migro a **Rolldown** (`rolldown-vite`): sigue en beta, incompatible con `@vitejs/plugin-react` 5 y con `manualChunks` como función.
- No toco `vitest.config.ts` (ya es óptimo: happy-dom por default, sin compiler).
- No agrego CSP nonces vía Vite: eso vive en el edge/hosting.

## Verificación post-cambio
- `bun run build` — comparar tamaño de `dist/` y tiempo vs baseline (41s / 296 KB vendor).
- `bunx vitest run` — 992/992 tests verdes.
- Deploy preview y forzar error para confirmar que Sentry muestra stack con líneas de fuente.
- Changelog `v7.39.0` (minor: sourcemaps + fonts non-blocking) o `v7.38.1` (patch) según se acuerde.

## Decisión pendiente
¿Ejecuto los tres lotes en un solo PR (60 min, un solo changelog `v7.39.0`) o los separo? Mi recomendación es **todo junto** — son cambios ortogonales y bajos de riesgo, y el mayor valor (Sentry sourcemaps) no rinde solo sin el resto de la limpieza.
