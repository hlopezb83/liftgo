## Acciones de GitHub pendientes

En el último run de CI (`logs_73952299441.zip`) hubo **4 jobs**. Solo arreglé uno:

| Job | Estado en el run | Causa |
|---|---|---|
| `quality` (Lint, Knip, Tests, Build) | falló | 2 errores `no-unsafe-finally` → **fixed v6.69.1** |
| `edge-functions` (Deno smoke tests) | **falló** | `deno fmt --check`: 4 archivos sin formatear |
| `rls` (RLS contract tests) | **saltado** | depende de `quality` |
| `e2e` (Playwright sharded) | **saltado** | depende de `quality` |

`rls` y `e2e` correrán automáticamente cuando `quality` pase verde, pero `edge-functions` sigue rojo por su propio motivo.

## Plan

### 1. Fix `deno fmt --check` (job `edge-functions`)

Reformatear los 4 archivos detectados por el step `Deno fmt --check`:

```text
supabase/functions/cancel-cfdi/handler.ts
supabase/functions/cancel-cfdi/handler_test.ts
supabase/functions/refresh-cancellation-status/handler.ts
supabase/functions/refresh-cancellation-status/handler_test.ts
```

Ejecutar `cd supabase/functions && deno fmt` localmente para que aplique exactamente el mismo formato que el check de CI (line-length, ordenación de imports, etc.). Verificar después con `deno fmt --check` que termine en exit 0.

Los diffs mostrados en el log son cosméticos:
- Imports multi-línea expandidos (`{ a, b }` → bloque con un import por línea cuando excede ancho).
- Objects literales partidos en varias líneas.
- Operadores ternarios reformateados.

No hay cambios de lógica.

### 2. Validar los steps de `quality` que no se alcanzaron

El run anterior falló en ESLint, así que **typecheck, knip, vitest+coverage y build nunca corrieron** en CI. Antes de declarar el job verde, correr localmente en paralelo:

```bash
bunx tsc --noEmit -p tsconfig.app.json
bunx knip --include files,dependencies,binaries --reporter compact
bun run test --coverage
bun run build
```

Si algún paso falla, arreglarlo en el mismo commit que el fmt para no consumir otro run de CI.

### 3. Confirmar que `rls` y `e2e` arrancan

Con `quality` verde, ambos jobs dejan de saltar. No tocamos su configuración — solo verificar en el siguiente push.

### 4. Changelog

Entrada **v6.69.2 (patch)** en `public/changelog.json` + `public/changelog/v6.69.2.json` describiendo el fix de Deno fmt y los validations locales.

## Detalles técnicos

- El step `Deno fmt --check` en `.github/workflows/ci.yml` corre `cd supabase/functions && deno fmt --check` y rompe el job si hay cualquier archivo no formateado — es un gate duro.
- Los 4 archivos son recientes (relacionados con cancelación de CFDI / refresh de estatus SAT), probablemente editados sin pasar `deno fmt` antes de pushear.
- No hay riesgo de regresión: `deno fmt` solo cambia whitespace/orden de imports, nunca semántica.
- El job `edge-functions` no depende de nada, así que el fix lo desbloquea inmediatamente.

## Fuera de alcance

- No agregar nuevos workflows ni jobs.
- No tocar la lógica de los handlers de Edge Functions.
- No modificar la configuración de sharding de Playwright ni los seeds (ya pasaron review en turnos previos).
