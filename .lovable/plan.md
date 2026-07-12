# Auditoría: Vite 8, plugin-react 6, ESLint 10, react-hooks 7, @types/node 26, tailwind-merge 3

## Veredicto general

**Nivel profesional: sí.** Stack en la última mayor de cada herramienta (excepto TS 7 y react-day-picker 10, ambos diferidos con justificación). Config de Vite competente (sourcemaps Sentry, `manualChunks` explícito, `optimizeDeps.include`, `target: es2022`, `dedupe`, `reportCompressedSize: false`). ESLint 10 con overrides temáticos (guardrails de imports, monetaria, hooks/páginas, registry de íconos). Zero-warning en CI.

**No es top-of-the-line todavía.** Hay 6 gaps concretos, principalmente deuda que quedó tras la migración de Lote 2 (react-hooks 7).

---

## Hallazgos y correcciones propuestas

### 1. `react-hooks/*` experimentales desactivadas globalmente — ALTA

Tras subir a v7, se apagaron 10 reglas nuevas (`refs`, `set-state-in-effect`, `purity`, `immutability`, `preserve-manual-memoization`, `set-state-in-render`, `gating`, `incompatible-library`, `static-components`, `use-memo`) para mantener 0 warnings. Es la parte más valiosa de v7 y hoy está muda.

**Fix**: activar las 10 como `warn` en un archivo `eslint.config.js` aparte, correr `bun run lint`, capturar el volumen y triagear por lotes (arrancar por `set-state-in-effect` y `refs` que suelen ser bugs reales). Registrar el conteo inicial en un TODO en el config.

### 2. `ecmaVersion: 2020` desalineado con `build.target: es2022` — MEDIA

ESLint parsea como 2020 pero Vite emite 2022. Sintaxis moderna válida (top-level await, `.at()`, `#private`) puede pasar sin lint. 

**Fix**: subir `languageOptions.ecmaVersion` a `2022` en `eslint.config.js`.

### 3. `@types/node` 26 sin runtime alineado — MEDIA

`engines.node: >=24` y `.nvmrc: 24`, pero los tipos son de Node 26. Puede exponer APIs no disponibles en CI/local.

**Fix**: bajar a `@types/node@24` (alineado con runtime) o subir `.nvmrc`/`engines` y CI a Node 26.

### 4. `tailwind-merge@3` sin verificar tokens custom — MEDIA

v3 rescribió el generador de reglas. Nuestro `cn()` usa clases con `[var(--...)]` y `hsl(var(--...))`. No hay test que confirme que merge sigue resolviendo colisiones correctamente en clases tokenizadas.

**Fix**: agregar 4-5 unit tests en `src/lib/__tests__/utils.cn.test.ts` cubriendo: colisión `bg-[hsl(var(--primary))]` vs `bg-transparent`, tamaños arbitrarios, variantes responsive, `data-[state=open]:...`.

### 5. `@vitejs/plugin-react@6` — configuración mínima — BAJA

v6 soporta `include`/`exclude` explícitos y `babel.parserOpts` finos. Hoy sólo pasamos el compiler plugin.

**Fix**: agregar `include: /\.(jsx|tsx)$/` para evitar transformar `.ts` puros (ahorra ~5% del tiempo de dev startup en proyectos medianos como el nuestro).

### 6. `vite@8` — dos oportunidades menores — BAJA

- `build.cssMinify: 'lightningcss'` no está seteado (Vite 8 lo soporta nativo y comprime ~15% más que esbuild en Tailwind v4).
- `server.warmup.clientFiles` no está configurado. Warmup de `src/App.tsx`, `src/main.tsx` y `src/layouts/AppSidebar.tsx` acelera el primer render en dev.

**Fix**: agregar ambos al `vite.config.ts`.

### 7. Overrides + resolutions duplicados — TRIVIAL

`package.json` tiene `overrides` **y** `resolutions` para `zod-validation-error`. Bun respeta ambos pero el legado (`resolutions` es yarn) confunde.

**Fix**: eliminar `resolutions`, dejar sólo `overrides`.

---

## Fuera de alcance (ya diferido con nota)

- `react-day-picker@10` — rewrite de `classNames`/`Chevron`, alto riesgo visual.
- `typescript@7` — ecosistema (tsgo, typescript-eslint) no listo.
- `jsdom` pinned a 26.1.0 — bloqueado por `react-pdf`.

---

## Plan de ejecución

**Fase A — Alineación (30 min)**

1. Subir `ecmaVersion` a 2022 (#2).
2. Bajar `@types/node` a 24 (#3).
3. Limpiar `resolutions` duplicado (#7).
4. Agregar `include` a plugin-react (#5), `cssMinify: 'lightningcss'` y `warmup.clientFiles` (#6).

**Fase B — Tests de `cn` (20 min)**
5. Crear `src/lib/__tests__/utils.cn.test.ts` con 5 casos representativos (#4).

**Fase C — react-hooks 7 completo (tiempo variable)**
6. Reactivar las 10 reglas como `warn`, correr lint, publicar changelog con el conteo y un plan de triaje por lote.

**Verificación**: `bun run lint`, `bun run typecheck`, `bunx vitest run`, `bun run build`. Publicar `v7.44.0`.

## Detalle técnico

- `plugin-react@6` con `include: /\.(jsx|tsx)$/` requiere confirmar que ningún `.ts` contiene JSX (si lo hay, renombrarlo o mantener el filtro por defecto).
- `set-state-in-effect` puede generar decenas de warnings en formularios controlados; el plan es **capturar el número**, no arreglar todo en una sola pasada.
- `lightningcss` como minificador CSS sólo requiere el flag; Vite 8 ya lo trae bundleado.

## Pregunta

¿Ejecuto A + B en un solo commit (`v7.44.0`) y dejo C para una sesión dedicada, o prefieres las tres fases seguidas? ejecuta las 3 fases.