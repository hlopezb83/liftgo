# Actualizar GitHub Actions tras la migración a TanStack Start

## Diagnóstico (verificado contra el repo actual)

La migración a TanStack Start (v8.0.0) dejó varios workflows apuntando a archivos y rutas del stack anterior (Vite SPA). Hallazgos reales:

1. **Job `typecheck` roto (ci.yml)**: corre `bunx tsc --noEmit -p tsconfig.app.json`, pero `tsconfig.app.json` ya no existe — solo hay `tsconfig.json`. Este job fallaría en rojo en el próximo push/PR.
2. **Knip roto (knip.json)**: la entrada `index.html` ya no existe, y faltan las nuevas entradas del framework (`src/router.tsx`, `src/start.ts`, `src/server.ts`). El job blocker de knip marcaría archivos vivos como huérfanos.
3. **bundle-size.yml mide `dist/assets/`**: el build SSR ya no garantiza esa estructura (el cliente puede salir en `.output/public` o `dist/client`). Hay que verificar la salida real y ajustar la ruta de medición.
4. **E2E con build reutilizado (ci.yml + playwright.config.ts)**: el job `build` sube `dist/` y las E2E lo sirven con `bun run preview`. Hay que confirmar dónde queda el build servible de TanStack Start y ajustar artifact, cache `ci-dist-*` y el comando de preview si cambió.
5. **Filtro de rutas con entrada muerta (ci.yml)**: `paths-filter` lista `index.html` (ya no existe). Sin romper nada, pero es basura que conviene limpiar.

No requieren cambios: `codeql.yml`, `gitleaks.yml`, `lighthouse.yml`, `prod-smoke.yml`, `changelog-check.yml`, `rls-db-tests.yml`, `actionlint`, `dependency-review` y la acción compuesta `setup-bun-project` — ninguna referencia al stack viejo.

## Cambios propuestos (mínimos, YAGNI)

### 1. ci.yml
- `typecheck`: cambiar a `bun run typecheck` (usa `tsc --noEmit` sobre el `tsconfig.json` actual).
- `changes` (paths-filter): quitar `index.html` del filtro `app`.
- Job `build` y job `e2e`: tras correr `bun run build` localmente, ajustar la ruta del artifact/cache al directorio real de salida si ya no es `dist/`. Si TanStack Start expone un servidor SSR, cambiar el webServer de E2E_REUSE_BUILD en `playwright.config.ts` al comando que lo sirva (p. ej. `bun run preview` si sigue funcionando, o el start del output SSR), manteniendo puerto 4173.

### 2. knip.json
- Reemplazar `index.html` en `entry` por `src/router.tsx`, `src/start.ts` y `src/server.ts`.
- Validar con `bunx knip --include files,dependencies,binaries --reporter compact` que el job blocker queda en verde (puede requerir añadir a `ignore` algún archivo nuevo solo-alcanzable-por-framework, como `src/routeTree.gen.ts`).

### 3. bundle-size.yml
- Ajustar la medición al directorio real de assets del cliente (`find <dir> -name '*.js' -o -name '*.css'`), según lo que produzca el build SSR. Misma lógica de cache y umbrales (5% warn / 10% fail), sin rediseñar.

### 4. Verificación
- Ejecutar localmente: `bun run typecheck`, `bunx knip ...`, `bun run build` (para confirmar el directorio de salida) y `bash scripts/arch-check.sh`.
- Confirmar que `playwright.config.ts` levanta la app en 4173 con el build reutilizado.
- No se tocan secrets, cron, ni los workflows de seguridad/monitoreo.

### 5. Changelog
- Entrada patch (v8.0.1) en `public/changelog.json` + `public/changelog/v8.0.1.json`, y `node scripts/gen-version.mjs`.

## Fuera de alcance (queda igual)
- Los 7 `index_test.ts` Deno de las funciones ya migradas a server functions: su retiro del CI Deno va con la limpieza diferida de esas funciones, cuando confirmes desactivarlas.
- Cualquier rediseño de pipelines, matrices o umbrales.
