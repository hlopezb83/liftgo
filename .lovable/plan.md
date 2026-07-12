
# Auditoría e implementación de Vite

## Auditoría de uso actual

- `vite@8.1.4` (última estable), `@vitejs/plugin-react@6.0.3` (última), `vitest@4.1.10` (última). Sin métodos deprecated ni versiones atrasadas.
- Única superficie configurable: `vite.config.ts` (138 líneas), muy bien tuneado en pases anteriores:
  - `server.warmup` con 4 rutas críticas.
  - `plugins`: React (Oxc) + Babel(React Compiler target 19) + `componentTagger` en dev + `visualizer` bajo `ANALYZE=1` + `sentryVitePlugin` sólo cuando hay token.
  - `resolve.dedupe` para React.
  - `optimizeDeps.include` de deps de primer render.
  - `build`: target `es2022`, `sourcemap: true`, `cssMinify: "lightningcss"`, `reportCompressedSize: false`, `manualChunks` por grupos (recharts, radix, react-pdf, jspdf, xlsx, date-fns, icons, vendor).
- Uso en el código:
  - `import.meta.env` en 4 puntos (DEV flag + `VITE_SUPABASE_*`). Correcto.
  - `import.meta.glob` / `import.meta.hot`: no se usan (no aplica; plugin-react gestiona HMR).
  - `src/vite-env.d.ts` con `/// <reference types="vite/client" />`. Correcto.
- `package.json`: `"vite": 8` y `"@vitejs/plugin-react": 6` son major-only (sin caret ni minor), un descuido menor de higiene.

**Conclusión**: la implementación ya está al día. Los ajustes son pulido fino, no rescate. Todos son low-risk y respetan el runtime del ERP.

## Ajustes propuestos (sin cambios de comportamiento observable)

### 1. Pin semántico de versiones

Cambiar en `package.json`:

```diff
-    "vite": 8,
+    "vite": "^8.1.4",
-    "@vitejs/plugin-react": 6,
+    "@vitejs/plugin-react": "^6.0.3",
```

Reproducibilidad y updates explícitos vía Renovate/Dependabot.

### 2. Limpieza post-migración a react-router v8

Ya no queda ni un `import` de `react-router-dom` en `src/**` y la dependencia se removió del `package.json`. Sin embargo `vite.config.ts` sigue mencionándolo:

- `optimizeDeps.include`: eliminar `"react-router-dom"`.
- `CHUNK_GROUPS.vendor.match`: eliminar `"/react-router-dom/"`.

Efecto: menos ruido de config; el pre-bundling de deps deja de intentar resolver un paquete inexistente (advertencia silenciosa que hoy se ignora).

### 3. `warmup.clientFiles` actualizado

Tras la migración al Data Router, `src/App.tsx` quedó reducido a ~10 líneas y ya no es "caliente". Reemplazarlo por `src/routes/router.tsx`, que es el nuevo punto de arranque real donde vive `createBrowserRouter`.

### 4. `css.transformer: "lightningcss"` — pipeline unificado

Hoy sólo se minifica con LightningCSS (`cssMinify: "lightningcss"`). Vite 8 permite usar LightningCSS también como transformer completo:

```ts
css: {
  transformer: "lightningcss",
  lightningcss: { targets: { chrome: 111, safari: 16 << 16 | 4, firefox: 128 } },
},
```

Con Tailwind v4 (que ya emite CSS moderno) esto acelera la fase de CSS ~10-15% en cold build y unifica el pipeline (mismo motor para parse, transform y minify).

### 5. `build.modulePreload: { polyfill: false }`

Target `es2022` implica navegadores que soportan `<link rel="modulepreload">` nativo (Safari 16.4+, Chrome 111+, Firefox 128+). Deshabilitar el polyfill ahorra ~1.5 KB inline en el HTML de entrada y simplifica el head.

### 6. `esbuild.drop` para producción

Añadir:

```ts
esbuild: {
  drop: mode === "production" ? ["debugger"] : [],
},
```

Elimina cualquier `debugger;` que se cuele en prod. Se deja `console` fuera del drop porque Sentry captura `console.error` como breadcrumbs — dropear consola reduciría visibilidad de errores en producción.

### 7. `build.chunkSizeWarningLimit: 800`

Con `react-pdf` (~1.5 MB pre-gzip) y `recharts` (~500 KB) en chunks vendor dedicados, el warning default (500 KB) es ruido en cada build. Subirlo a 800 mantiene la utilidad como detector de regresiones sin falsos positivos.

### 8. Eliminar cast innecesario en `plugins`

`defineConfig` infiere el tipo del array después de `.filter(Boolean)`. En Vite 8 `PluginOption` acepta `false | null | undefined`, así que `as import("vite").PluginOption[]` es redundante. Se elimina el cast y se importa el tipo si se necesita en algún punto (no debería).

## Fuera de alcance (decidido)

- **`rolldown-vite`** (Rolldown como bundler de producción): opt-in experimental; incompatibilidades conocidas con `rollup-plugin-visualizer` y matices con `@sentry/vite-plugin`. Se mantiene Vite 8 sobre Rollup estable.
- **`experimental.hmrPartialAccept`**: útil para bundles con miles de módulos por chunk; `warmup` + `manualChunks` ya dan HMR suficientemente rápido.
- **Environment API / SSR / `ssr.noExternal`**: no aplica (SPA client-side).
- **`assetsInlineLimit`**: valor default (4 KB) sigue siendo correcto para logos y sprites.
- **Vitest**: `vitest@4.1.10` ya está en la última y su config vive en `vite.config.ts` implícitamente. Sin cambios.
- **Actualizaciones mayores**: Vite 9 no existe; no hay migración pendiente.

## Entregables

1. `vite.config.ts` refactorizado con los 6 ajustes técnicos (2–8, sin el pin).
2. `package.json` con pines semánticos (`^8.1.4`, `^6.0.3`).
3. Entrada de changelog **v7.52.0** (minor: pulido de config + limpieza post RR-v8).
4. Verificación:
   - `tsgo --noEmit`, `bun lint`, `bun test` (suite completa).
   - `bun run build` y comparación de tamaños vs baseline (cambios esperados: -~1.5 KB polyfill en entry HTML, misma o menor CSS gzipped).
   - `ANALYZE=1 bun run build` para confirmar que la agrupación de chunks se mantiene idéntica.

## Estimación

2 archivos tocados (`vite.config.ts`, `package.json`) + changelog. Cero cambios de código de aplicación. Sin cambios visibles en runtime salvo builds ~10-15% más rápidos en la fase CSS y HTML de entrada ligeramente menor.
