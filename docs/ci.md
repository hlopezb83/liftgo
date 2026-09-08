# CI: qué corre, cuándo y por qué

Principio: **cada corrida automática debe poder fallar por una razón real y
accionable**. Si un check no puede fallar por algo que importe, se elimina; si
puede escribir en producción, no corre solo.

## En cada PR y push a `main` — `ci.yml`

Dos jobs base + condicionales. Sin `schedule`. Las corridas obsoletas de la
misma rama se cancelan.

| Job | Corre | Qué protege |
| --- | --- | --- |
| `quality` | siempre | ESLint, typecheck, guardrails de arquitectura, build y **smoke de arranque** |
| `tests` | siempre | Suite completa de Vitest **con umbrales de cobertura** |
| `deno-functions` | si cambió `supabase/functions/**` | `deno fmt`, `deno lint` y tests unitarios **sin red** |
| `supabase-lint` | si cambiaron migraciones | GRANT / RLS / POLICY / `search_path` en las migraciones del diff |
| `dependency-review` | solo PR | CVEs altos y licencias no permitidas |
| `actionlint` | solo PR | YAML de workflows |

No hay job agregador: branch protection lista los jobs requeridos directamente.
Un `ci-success` que solo relee resultados añade un runner y un punto de fallo
propio sin poder detectar nada.

Knip **no corre en CI**: no puede fallar por una regresión funcional y su
señal (archivos y dependencias sin uso) se revisa en local con `bun run knip`.

### Smoke de arranque

`playwright.smoke.config.ts` + `tests/smoke/app-boot.spec.ts`. Sirve el `dist/`
real con `wrangler dev` (el mismo empaquetado que se publica). Es el único
check que detecta fallos de empaquetado, como el `__name is not defined` que
rompía toda la app.

No se limita a cargar: **interactúa**. En `/` (acceso de empleados) alterna
mostrar/ocultar contraseña y cambia el formulario a "restablecer contraseña" y
de vuelta; en `/portal/login` hace lo equivalente. Eso ejercita hidratación,
manejadores de eventos y re-render — un `pageerror` al hidratar deja la página
visible pero muerta, y una prueba que solo hace `goto` no lo ve.

Aislamiento: el spec **aborta toda petición que salga del origen de la app**.
No se mockea nada de la aplicación (sus scripts y assets se ejecutan tal cual
salen del bundle); simplemente no hay salida a internet, así que es imposible
que toque un backend real. El build usa `VITE_SUPABASE_URL=http://127.0.0.1:54321`
a propósito. El filtro de ruido de consola se acota a ese destino y a errores
de transporte; cualquier otro error de consola o de página falla la prueba.

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

## E2E completas: fuera de GitHub Actions

Las E2E **escriben** en la base (siembran, activan `allow_e2e_seed` y purgan) y
el proyecto Supabase de la app es **producción**. No hay workflow para ellas:
un workflow que existe termina disparándose. Se corren a mano, contra un
backend aislado, cuando exista uno provisionado.

Defensa en profundidad — `tests/e2e/fixtures/productionGuard.ts`:

- `resolveEnvValue(name)` es la **única** resolución de configuración
  (proceso → `.env` → `.env.local`) y `apiAuth` la consume. Antes cada módulo
  leía por su cuenta, así que el valor auditado y el usado podían diferir.
- `collectConfiguredTargets()` audita **todas** las procedencias, no solo la que
  gana: una variable local inofensiva ya no puede tapar un `.env` productivo.
- Se ejecuta antes del login, del seed y de la purga. Exige
  `E2E_ISOLATED_BACKEND=1`, destino presente y host local (escape remoto
  explícito, y aun así la lista negra manda).
- Cubierto por `src/test/e2eProductionGuard.test.ts` (12 casos, sobre un
  directorio temporal con su propio `.env`).

## Base de datos — `rls-db-tests.yml`

Levanta un Supabase local efímero, aplica todas las migraciones desde cero y
corre las suites RLS en modo estricto.

Los smoke SQL **también bloquean**. Eran `continue-on-error` por la sospecha de
que asumían datos de staging; con la base creada desde las migraciones las 42
suites pasan, así que un rojo aquí es una regresión real. Con eso sobraban el
wrapper `check-selfcontained-smoke.py` y la lista `selfcontained.txt`, ambos
retirados: una excepción que no excluye nada es solo mantenimiento.

## Seguridad y monitoreo

| Workflow | Cuándo | Nota |
| --- | --- | --- |
| `gitleaks.yml` | PR, push, manual | Sin cron: un secreto solo entra por push o PR. Permiso `contents: read` |
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
- `e2e-on-demand.yml` → las E2E escriben en producción; no debe existir el botón.
- `ci-success` → agregador que no puede detectar nada por sí mismo.
- Knip en CI, `scripts/extract-rls-junit.py` y los publicadores de JUnit del job
  `tests` → señal informativa, no un gate.
- `scripts/check-selfcontained-smoke.py` + `supabase/tests/selfcontained.txt` →
  el paso completo ya es bloqueante.
- Cron semanal de `ci.yml`, `gitleaks.yml`; `codeql` en cada push.

## Comandos locales equivalentes

```bash
bun run lint && bun run typecheck && bun run arch:check
bun run knip                    # archivos/dependencias sin uso (no corre en CI)
bun run test:coverage
bun run build && bun run test:e2e:smoke
bun run test:functions          # tests Deno offline
bun run knip:deep               # exports/tipos sin uso (informativo)
```
