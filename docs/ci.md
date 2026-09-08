# CI: qué corre, cuándo y por qué

Principio: **cada corrida automática debe poder fallar por una razón real y
accionable**. Si un check no puede fallar por algo que importe, se elimina; si
puede escribir en producción, no corre solo.

## En cada PR y push a `main` — `ci.yml`

Dos jobs base + condicionales. Sin `schedule`. Las corridas obsoletas de la
misma rama se cancelan.

| Job | Corre | Qué protege |
| --- | --- | --- |
| `quality` | siempre | ESLint, typecheck, guardrails de arquitectura, Knip (solo lo bloqueante), build y **smoke de arranque** |
| `tests` | siempre | Suite completa de Vitest **con umbrales de cobertura** |
| `deno-functions` | si cambió `supabase/functions/**` | `deno fmt`, `deno lint` y tests unitarios **sin red** |
| `supabase-lint` | si cambiaron migraciones | GRANT / RLS / POLICY / `search_path` en las migraciones del diff |
| `dependency-review` | solo PR | CVEs altos y licencias no permitidas |
| `actionlint` | solo PR | YAML de workflows |
| `ci-success` | siempre | Gate único para branch protection |

### Smoke de arranque

`playwright.smoke.config.ts` + `tests/smoke/app-boot.spec.ts`. Sirve el `dist/`
real con `wrangler dev` y abre las rutas públicas verificando que no haya
errores de página ni de consola. Es el único check que detecta fallos de
empaquetado, como el `__name is not defined` que rompía toda la app.

El build de CI usa `VITE_SUPABASE_URL=http://127.0.0.1:54321` **a propósito**:
el CI no recibe ni necesita secretos de producción. Los errores de red hacia
ese destino inexistente se filtran en el spec; cualquier otro error falla.

### Vitest en un solo runner

Antes: 3 shards + un job de merge, y en PRs solo `--changed` (sin gate de
cobertura). Ahora un runner corre la suite completa siempre. Menos
orquestación, mismo tiempo de reloj y los umbrales aplican en **todos** los PRs.

### Tests Deno: offline vs remotos

`scripts/deno-test-selection.sh` separa los dos grupos por un criterio
verificable: importar `_shared/test-helpers.ts` (el cliente HTTP compartido).

- **offline** (~255 tests): unitarios y de handler. Es lo que corre en CI, sin
  `--allow-net` salvo el bind local que hace `Deno.serve` al importar un
  `index.ts`.
- **remotos** (18): smoke que hacen HTTP contra funciones ya desplegadas. No son
  cobertura de CI. Correrlos exige un backend real, y el de la app es
  producción.

## Bajo demanda — `e2e-on-demand.yml`

Las E2E **escriben** en la base (siembran, activan `allow_e2e_seed` y purgan).
El proyecto Supabase de la app es **producción**, así que este workflow solo se
lanza a mano, pide confirmación escrita y exige los secrets `E2E_SUPABASE_*`.

Precondición pendiente: **no existe todavía un backend aislado provisionado**.
Sin él el workflow falla diciéndolo, en vez de saltarse tests y reportar verde.

Defensa en profundidad: `tests/e2e/fixtures/productionGuard.ts` repite las
comprobaciones dentro del proceso, antes del login, del seed y de la purga.
Audita variables de entorno **y** el `.env` del repo (que apunta a producción y
era el atajo por donde se colaba el destino real).

## Base de datos — `rls-db-tests.yml`

Levanta un Supabase local efímero, aplica todas las migraciones desde cero y
corre las suites RLS en modo estricto. Los smoke SQL siguen siendo informativos
porque muchos asumen datos que no existen en una base nueva; los que ya son
autocontenidos (fixtures propias + `ROLLBACK`) están listados en
`supabase/tests/selfcontained.txt` y **sí bloquean** el job. Migrar un smoke a
esa lista requiere volverlo autocontenido primero.

## Seguridad y monitoreo

| Workflow | Cuándo | Nota |
| --- | --- | --- |
| `gitleaks.yml` | PR, push, manual | Sin cron: un secreto solo entra por push o PR |
| `codeql.yml` | Semanal (lunes 12:00 UTC), manual | Fuera del camino crítico del PR |
| `prod-smoke.yml` | Cada hora (minuto 17), manual | Dos peticiones de **lectura**; abre issue en fallo |

El minuto 17 evita la congestión del minuto 0 en GitHub Actions, que retrasaba
o saltaba corridas.

## Changelog y versión

`scripts/gen-version.mjs` corre en `predev`/`prebuild` y genera
`public/version.json` desde `public/changelog.json`. Valida semver, fecha,
título, duplicados y orden descendente (`scripts/changelog-entry.mjs`) y
**falla el build** si algo no cuadra; antes escribía `version: "unknown"` en
silencio. La validación está cubierta por `src/test/changelogEntry.test.ts`, así
que el gate vive en `tests`, no en un workflow aparte.

Validación extendida a mano: `bun run changelog:check`.

## Retirados

- `changelog-check.yml`, `scripts/check-version.mjs` → cubierto por el prebuild
  y una prueba unitaria.
- `lighthouse.yml`, `lighthouserc.json`, `scripts/lighthouse-baseline.sh` →
  auditaba producción semanalmente contra umbrales que nadie ajustaba.
- `bundle-size.yml` → medía sin presupuesto que pudiera romperse.
- Cron semanal de `ci.yml`, `gitleaks.yml`; `codeql` en cada push.

## Comandos locales equivalentes

```bash
bun run lint && bun run typecheck && bun run arch:check && bun run knip
bun run test:coverage
bun run build && bun run test:e2e:smoke
bun run test:functions          # tests Deno offline
bun run knip:deep               # exports/tipos sin uso (informativo)
```
