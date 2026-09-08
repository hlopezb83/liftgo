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
| `tests` (matriz 1/2 y 2/2) | siempre | Suite completa de Vitest, repartida en dos shards |
| `tests-merge` | siempre | Une los blobs y aplica los **umbrales de cobertura** |
| `deno-functions` | si cambió `supabase/functions/**` | `deno fmt`, `deno lint` y tests unitarios **sin red** |
| `supabase-lint` | si cambiaron migraciones | GRANT / RLS / POLICY / `search_path` en las migraciones del diff |
| `dependency-review` | solo PR | CVEs altos y licencias no permitidas |
| `actionlint` | push y PR si cambió `.github/**`, o manual | YAML de workflows |

No hay job agregador. `main` **no tiene branch protection ni checks requeridos**
hoy: los resultados se leen en la propia corrida. Un `ci-success` que solo relee
resultados añade un runner y un punto de fallo propio sin poder detectar nada.

El job `changes` (detector de rutas) necesita `pull-requests: read` además del
`contents: read` heredado: sin ese permiso `dorny/paths-filter` recibe 403 en
`pull_request` y los jobs condicionales se quedan sin señal. `actionlint` usa
`reporter: local` y `filter_mode: nofilter` porque publicar un check exigiría
`checks: write` y filtrar por líneas añadidas oculta errores que el propio
cambio provoca en el resto del archivo. `dependency-review` fija
`comment-summary-in-pr: never` para no requerir permisos de escritura.

Los cambios de `public/changelog.json` y `public/changelog/**` **no** están en
`paths-ignore`: su validación vive ahora en el build, así que un cambio solo ahí
tiene que correr CI.


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

Tras cada flujo hay una **recarga** con una interacción nueva (escribir en el
campo de contraseña), que ejercita una segunda hidratación.

Aislamiento: el spec **aborta toda petición cuyo `URL.origin` no sea
exactamente el de la app** (antes bastaba con que la URL empezara por el
origen). No se mockea nada de la aplicación —sus scripts y assets se ejecutan
tal cual salen del bundle—; simplemente no hay salida a internet. Los service
workers están bloqueados para que ninguna respuesta venga de caché.

El build y el preview reciben configuración **ficticia explícita**
(`SUPABASE_URL`, `VITE_SUPABASE_URL=http://127.0.0.1:54321`,
`VITE_SUPABASE_PROJECT_ID=smoke-placeholder`, clave placeholder), `SMOKE_BASE_URL`
remoto se rechaza y `reuseExistingServer` está siempre en `false`. Con
`SMOKE_REUSE_BUILD=1` se inspecciona `dist/` antes de arrancar: si contiene un
ref productivo o le falta el destino ficticio, la corrida aborta.

El filtro de ruido de consola vive en `tests/smoke/consoleNoise.ts`. El texto
del error de transporte de Chromium (`Failed to load resource: net::ERR_*`) no
incluye la URL, así que la atribución se toma de `ConsoleMessage.location().url`
y se correlaciona con las URLs exactas que el propio spec abortó. Solo eso se
ignora: un asset del **propio origen** con el mismo texto, un error sin URL
atribuible, una URL externa que la prueba no bloqueó y cualquier error que no
sea de transporte (`Failed to fetch`, Supabase, React/hidratación) fallan.
Cubierto por `src/test/smokeConsoleNoise.test.ts`.



### Vitest en 2 shards + merge

`tests` es una matriz de dos runners (`fail-fast: false`). Cada uno corre su
mitad con `--shard=N/2 --coverage` y `VITEST_SHARD_BLOB=1` (acotado a ese step),
lo que activa el reporter `blob` y desactiva los umbrales parciales: un shard
ve solo una porción del código, así que medir cobertura ahí sería falso. Nunca
se usa `--changed` ni `--passWithNoTests`: PR, push y manual corren igual.

Cada shard sube `.vitest-reports/` como artifact propio
(`vitest-blob-1` / `vitest-blob-2`, `include-hidden-files: true`,
`if-no-files-found: error`, 1 día). `tests-merge` descarga ambos por nombre
explícito —si falta uno, el job falla— y corre `vitest --merge-reports
--coverage` **sin** `VITEST_SHARD_BLOB`, de modo que los umbrales globales y
por directorio se evalúan sobre la cobertura consolidada. No se reejecuta la
suite ni se promedian porcentajes. El artifact final sigue siendo `reports/`
(7 días).

Tradeoff: menos espera de reloj a cambio de más tiempo acumulado de runners
(dos instalaciones de dependencias y un job extra de merge). La magnitud real
se mide comparando corridas de CI, no se estima aquí.


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
- `collectConfiguredTargets()` audita el valor **efectivo** de cada clave, con
  la misma precedencia que usa el cliente. Sobreescribir la MISMA clave a un
  backend local sí gana (si no, el `.env` versionado, que apunta a producción,
  haría inusable el flujo local); pero cada clave se audita por separado, así
  que un `E2E_SUPABASE_URL` local **no** tapa un `VITE_SUPABASE_URL` productivo.
- `apiAuth` revalida además la URL ya resuelta (`assertUrlNotProduction`) justo
  antes de crear el cliente.
- Se ejecuta antes del login, del seed y de la purga. Exige
  `E2E_ISOLATED_BACKEND=1`, destino presente y host local (escape remoto
  explícito, y aun así la lista negra manda).
- Cubierto por `src/test/e2eProductionGuard.test.ts` (18 casos, sobre un
  directorio temporal con su propio `.env`, sin red).


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
| `gitleaks.yml` | PR, push, manual | Sin cron: un secreto solo entra por push o PR. Permiso `contents: read`; `GITLEAKS_ENABLE_COMMENTS` fijado a `"false"` (su default es `true` y pediría `pull-requests: write`), reporte en el resumen |
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

## Versión y artefactos de release (nota de mantenimiento)

El trabajo sobre CI **no** publica release. Se retiró la entrada y el archivo
`public/changelog/v8.2.0.json` que este trabajo había añadido y se restauraron
los artefactos de release al estado de referencia: `package.json` en `7.420.0`
y `public/changelog.json` / `public/version.json` en `8.1.0`. Esa discrepancia
entre `package.version` y el changelog es **previa** y se deja tal cual: no se
resuelve inventando un release. Los cambios de CI se documentan solo aquí, no
en el changelog de la app.
