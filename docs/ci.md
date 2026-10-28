# CI: qué corre, cuándo y por qué

Principio: **cada corrida automática debe poder fallar por una razón real y
accionable**. Si un check no puede fallar por algo que importe, se elimina; si
puede escribir en producción, no corre solo.

## Dependabot: revisión semanal

`.github/dependabot.yml` revisa Bun, Deno y GitHub Actions los lunes a las 06:00,
zona `America/Monterrey`. Bun mantiene como máximo dos PR de versiones abiertos
entre todos sus grupos; Deno y Actions mantienen uno cada uno. Las alertas y actualizaciones de
seguridad están habilitadas en GitHub y no esperan esta revisión semanal.

Los grupos de versiones menores y parches reúnen seis familias: React y sus
tipos; TanStack Query con persistencia y Devtools; Router/Start; Sentry;
Tailwind con sus plugins; y Vitest con cobertura. Table y Virtual no pertenecen
al grupo Query. Las versiones mayores se revisan en PR individuales.

Las demás dependencias se separan en `maintenance-tools` y
`maintenance-frontend`. Se usan patrones por nombre porque compilación y UI
no coinciden siempre con `dependencies` y `devDependencies`. Dependabot asigna
cada paquete al primer grupo coincidente: primero familias, después herramientas
y al final frontend. Al añadir una herramienta, incluir su patrón para evitar
que caiga en frontend.

Agrupar reúne actualizaciones disponibles; no obliga a que todos los paquetes
cambien ni tengan la misma versión. CI comprueba la compatibilidad del conjunto.
La configuración no habilita fusiones automáticas ni cambia versiones instaladas.

### Dependencias de funciones Cloud

Dependabot Deno lee `supabase/functions/deno.json` y regenera `deno.lock`.
El manifiesto declara Facturapi, Sentry Deno y `@std/assert`; el código y sus
pruebas usan esos aliases, por lo que cambiar una versión en el manifiesto sí
afecta al grafo ejecutado. No mantener versiones literales duplicadas en `.ts`.
Las versiones menores y parches comparten el grupo `deno-maintenance`.

Los imports HTTPS de `esm.sh` y `deno.land` siguen con revisión manual:
el [updater oficial Deno](https://github.com/dependabot/dependabot-core/tree/main/deno)
admite fuentes `npm:` y `jsr:`, pero todavía no HTTPS. Declarar una copia de una
versión sin usarla en el código no proporciona cobertura real.

Lovable Cloud resolvió los aliases del manifiesto global desde `_shared` en una
prueba temporal de `parse-csf` el 2026-10-05. OPTIONS respondió 200 y confirmó
constructor Facturapi disponible y Sentry 10.76.0. La prueba se retiró y la
función original se volvió a desplegar. Esta elección corresponde al empaquetado
comprobado de Cloud; volver a validarla si cambia el sistema de despliegue.

La primera actualización de Dependabot fijó `@std/assert` en `1.0.19` y regeneró
el lock en formato 5, conservando todas las versiones resueltas y sus hashes.
Una edición del manifiesto seguida de `deno install --frozen=false` con CLI
2.9.7 también genera ese formato. El 2026-10-05 se comprobó formato 5 en el
empaquetador de Cloud: `parse-csf` arrancó y OPTIONS confirmó ambos imports
desde `_shared`. Después se restauraron los archivos y el despliegue originales.
El formato del lock admitido por el empaquetador y la compatibilidad de los SDK
con el runtime de ejecución son comprobaciones distintas; no cambiar sólo el
número del lock.
Sentry Deno >=11 queda ignorado hasta comprobar un runtime Cloud >=2.8.3.
El SDK del frontend tiene su propio ciclo y no comparte esta restricción.
Este bloque configura actualizaciones de versión; los controles de seguridad
se verifican por separado.

## En cada PR y push a `main` — `ci.yml`

Dos jobs base + condicionales. Sin `schedule`. Las corridas obsoletas de la
misma rama se cancelan.

Los workflows fijan `ubuntu-24.04` para mantener el sistema operativo validado
y evitar la migración automática de `ubuntu-latest`. El job de calidad usa
`bun run lint --max-warnings=0`: tanto errores como advertencias de ESLint
bloquean la integración. Los avisos informativos de pruebas aprobadas se conservan.

| Job | Corre | Qué protege |
| --- | --- | --- |
| `quality` | siempre | ESLint, typecheck, guardrails de arquitectura, build, **smoke de arranque**, **20 escenarios móviles offline** y **24 escenarios de Nueva factura** |
| `tests` (matriz 1/6 … 6/6) | siempre | Suite completa de Vitest, repartida en seis shards |
| `tests-merge` | siempre | Une los blobs y aplica los **umbrales de cobertura** |
| `deno-functions` | si cambió `supabase/functions/**` | `deno fmt`, `deno lint` y tests unitarios **sin red** |
| `supabase-lint` | si cambiaron migraciones | GRANT / RLS / POLICY / `search_path` en las migraciones del diff |
| `dependency-review` | solo PR | CVEs altos y licencias no permitidas |
| `actionlint` | push y PR si cambió `.github/**`, o manual | YAML de workflows |

La aceptación de Nueva factura se ejecuta después de móvil con
`bunx playwright test --config playwright.invoice-ui.config.ts` y
`SMOKE_REUSE_BUILD=1`. Reutiliza el build ficticio validado y cubre escritorio de
1440px y móviles de 360/390px, ocho escenarios por viewport. El interceptor
bloquea mutaciones, endpoints no enumerados y red externa; no guarda ni timbra
facturas. Ver [su cobertura y límites](../tests/invoice-ui/README.md).

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
señal (archivos, dependencias, exports y tipos sin uso) se revisa en local con
`bun run knip`. La configuración y sus excepciones se explican en
[architecture-guardrails.md](./architecture-guardrails.md#revisión-de-código-sin-uso-con-knip).

### Integridad de los guardrails y pruebas de navegador

`quality` prueba los controles mismos antes de usarlos: identidad de release,
configuración efectiva de ESLint, fronteras de imports, procedencia de blobs y
alcance del proyecto TypeScript de navegador. Los sentinelas negativos deben
rechazar entradas deliberadamente incorrectas; no sustituyen lint, typecheck,
build ni ejecución de pruebas.

`tsconfig.browser-tests.json` incluye `tests/e2e/**/*.ts`: los 17 specs actuales,
su setup, teardown y fixtures, además de smoke, móvil y A/B. El contrato compara
las raíces del proyecto con todos los archivos E2E y comprueba semánticamente
una asignación incompatible inyectada en memoria en un spec antes excluido.
Ese sentinela no carga dependencias ni ejecuta el spec; el paso separado
`typecheck:browser-tests` comprueba el grafo completo. Ninguna de estas
comprobaciones inicia Playwright ni operaciones de red, datos o fiscales.

### Procedencia de los seis blobs de Vitest

Cada shard genera `blob.json` en un directorio nuevo de `RUNNER_TEMP` creado con
`mktemp`, sin consumir `.vitest-reports/` del checkout. El reporter exige una
ruta explícita cuando `VITEST_SHARD_BLOB=1`. Tras la ejecución se sella un
manifiesto con repositorio, ID e intento de corrida, commit, versión de Vitest,
shard/total y SHA-256 de los bytes. El artifact sólo admite ese blob y su
manifiesto; el nombre también identifica corrida e intento.

Para reintentar esta corrida se debe elegir **Re-run all jobs** en GitHub Actions.
**Re-run failed jobs** o reejecutar sólo el merge no vuelve a producir los shards
que ya estaban verdes: sus artifacts pertenecen al intento anterior y se rechazan
intencionalmente. No renombrar artifacts antiguos ni omitir la validación para
hacer pasar un reintento parcial; generar nuevamente los seis shards.

El merge descarga seis artifacts nominales en seis subdirectorios aislados.
`scripts/vitest-blob-provenance.mjs` rechaza faltantes, sobrantes, symlinks,
procedencias distintas, hashes incorrectos y un destino contaminado. Sólo
tras validar todo copia exactamente seis blobs a otro directorio vacío que
Vitest consume explícitamente. Los manifiestos nunca se pasan al lector de
Vitest. Un shard fallido conserva diagnóstico, pero impide ejecutar el merge.

`.vitest-reports/` está ignorado y no contiene artifacts versionados. El reporte
histórico retirado sigue recuperable en Git. Esta limpieza evita mezclar
conteos o diagnósticos entre corridas; no se atribuye inflación porcentual de
cobertura al blob antiguo, que no incluía cobertura. Los umbrales se mantienen
sin cambios y se aplican únicamente al merge completo.

### Smoke de arranque

`playwright.smoke.config.ts` + `tests/smoke/app-boot.spec.ts`. Sirve el `dist/`
real con `wrangler dev` (el mismo empaquetado que se publica). Es el único
check que detecta fallos de empaquetado, como el `__name is not defined` que
rompía toda la app.

Nitro genera `dist/server/wrangler.json`, incluida la entrada `main` y el binding
`ASSETS`, y registra esa salida en `.wrangler/deploy/config.json`. El archivo raíz
`wrangler.jsonc` conserva el nombre, la fecha de compatibilidad y `keep_names`,
sin duplicar las rutas que Nitro reemplaza. `bun run preview` requiere un build
previo; el smoke comprueba esta configuración real.

No se limita a cargar: **interactúa**. En `/` (acceso de empleados) alterna
mostrar/ocultar contraseña y cambia el formulario a "restablecer contraseña" y
de vuelta; en `/portal/login` hace lo equivalente. Eso ejercita hidratación,
manejadores de eventos y re-render — un `pageerror` al hidratar deja la página
visible pero muerta, y una prueba que solo hace `goto` no lo ve.

Tras cada flujo hay una **recarga** con una interacción nueva (escribir en el
campo de contraseña), que ejercita una segunda hidratación.

Aislamiento: el spec **sólo permite GET/HEAD de documentos públicos y assets
permitidos del origen exacto**. Aborta APIs del propio origen, red externa y
WebSockets; no sigue redirecciones. No se mockea nada de la aplicación: sus
scripts y assets se ejecutan tal cual salen del bundle. Los service workers
están bloqueados para que ninguna respuesta venga de caché.

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



### Aceptación móvil del build real

`playwright.mobile.config.ts` añade 16 escenarios (ocho por viewport 360/390px)
al mismo job `quality`, después del smoke. Reutiliza el build ficticio, sin otro
build ni backend: acceso, listas operativas con tarjetas no vacías, menú,
Atrás/Adelante, navegación rápida y filtros con cierre/reapertura y foco.
El build de CI y el guard de reuso usan el mismo marcador `smoke-placeholder`;
no se debilita la comprobación de referencias productivas.

Las respuestas interceptadas son sintéticas y sólo permiten lecturas conocidas;
mutaciones, endpoints desconocidos, HTTP externo y websockets se bloquean.
El artifact `mobile-acceptance-artifacts` guarda reporte y evidencia durante
siete días, también al fallar. Véase [el contrato móvil](../tests/mobile/README.md).
No certifica RLS, integración real, dispositivo físico, teclado virtual ni iOS.

### Vitest en 6 shards + merge

`tests` es una matriz de seis runners (`fail-fast: false`). Cada uno corre su
porción con `--shard=N/6 --coverage` y `VITEST_SHARD_BLOB=1` (acotado a ese
step), lo que activa el reporter `blob` y desactiva los umbrales parciales: un
shard ve solo una porción del código, así que medir cobertura ahí sería falso.
Nunca se usa `--changed` ni `--passWithNoTests`: PR, push y manual corren igual.
El paralelismo interno de Vitest dentro de cada runner no se toca.

Cada shard sube `.vitest-reports/` como artifact propio
(`vitest-blob-1` … `vitest-blob-6`, `include-hidden-files: true`,
`if-no-files-found: error`, 1 día). `tests-merge` descarga los seis por
nombre explícito —si falta uno, el job falla— y corre `vitest --merge-reports
--coverage` **sin** `VITEST_SHARD_BLOB`, de modo que los umbrales globales y
por directorio se evalúan sobre la cobertura consolidada. No se reejecuta la
suite ni se promedian porcentajes. El artifact final sigue siendo `reports/`
(7 días).

Tradeoff: menos espera de reloj a cambio de más tiempo acumulado de runners
(seis instalaciones de dependencias y un job extra de merge). La magnitud real
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

## E2E heredadas: ejecución manual aislada

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

### Servicios levantados

El job habla con la base **solo** por `DB_URL`/`psql` (y `drizzle-kit`): no usa
la API REST ni el gateway. Por eso `supabase start` levanta únicamente
**Postgres + auth (gotrue)**, con `kong` y `postgrest` excluidos junto al resto
de servicios. `gotrue` **no** se excluye: migraciones y suites RLS dependen del
schema `auth` (`auth.users`, `auth.uid()`).

Justo después del arranque, y antes de aplicar Drizzle, un paso comprueba que
existan `auth.users` y `auth.uid()`. Si faltan, el job falla ahí: así un
arranque incompleto no se confunde con una regresión SQL.

El paso "Start Supabase" imprime su duración en el log y en el resumen del run
para poder compararla con la referencia previa (run `35543605857`: ~3m20s en
ese paso, 4m55s de job). Si excluir `kong`/`postgrest` rompiera el arranque o no
diera mejora material, se revierte esa exclusión.


Los smoke y RLS usan ON_ERROR_STOP=1; los errores esperados se capturan dentro
del bloque SQL. El ejecutor también rechaza errores SQL en la salida y conserva
la etiqueta FALLO de aserciones legadas. Sus regresiones se prueban antes de
arrancar la BD.

Los smoke SQL **también bloquean**. Eran `continue-on-error` por la sospecha de
que asumían datos de staging; con la base creada desde las migraciones las suites
pasan, así que un rojo aquí es una regresión real. Con eso sobraban el
wrapper `check-selfcontained-smoke.py` y la lista `selfcontained.txt`, ambos
retirados: una excepción que no excluye nada es solo mantenimiento.

### Disparadores acotados

Los cambios de `supabase/functions/**` **no** levantan Supabase completo: las
Edge Functions ya se validan con `deno-functions` (deno fmt/lint y tests
unitarios offline) y el CI principal (lint/typecheck/build/smoke). El workflow
solo se dispara cuando cambia algo que afecta SQL/RLS:

- `supabase/migrations/**`, `supabase/tests/**`, `supabase/config.toml`
- `drizzle/migrations/**`
- `scripts/run_sql_suites.py`, `scripts/patch_legacy_migrations.py`,
  `scripts/check-drizzle-journal.ts`
- `.github/workflows/rls-db-tests.yml`

Cuando el workflow se dispara, ninguna suite se reduce: corren todas las suites
RLS en modo estricto, los smoke SQL bloqueantes, el arranque sobre una base vacía
con todas las migraciones y la validación del journal Drizzle.

## Seguridad y monitoreo

| Workflow | Cuándo | Nota |
| --- | --- | --- |
| `gitleaks.yml` | PR, push, manual | Sin cron: un secreto solo entra por push o PR. Permiso `contents: read`; `GITLEAKS_ENABLE_COMMENTS` fijado a `"false"` (su default es `true` y pediría `pull-requests: write`), reporte en el resumen |
| `codeql.yml` | Semanal (lunes 12:00 UTC), manual | JavaScript/TypeScript, GitHub Actions y Python en tres jobs paralelos; fuera del camino crítico del PR |
| `prod-smoke.yml` | Cada hora (minuto 17), manual | Lecturas HTTP + UI pública sin sesión; abre issue en fallo |

### Smoke de la interfaz publicada (MEJ-006)

`prod-smoke.yml` conserva HEAD `/`, GET `/version.json`, horario y permisos.
Añade `playwright.prod-smoke.config.ts`, que ejecuta únicamente
`tests/smoke/app-boot.spec.ts` contra `https://liftgo.lovable.app`. No compila,
publica ni importa el setup/teardown autenticado. El contexto empieza vacío,
no acepta descargas y bloquea service workers y WebSockets.

Reutiliza carga, hidratación, recarga, mostrar/ocultar contraseña y cambio local
a recuperación, sin enviar formularios. El portal también navega a acceso de
empleados y vuelve con Atrás. Detecta errores de página/consola, HTTP fallidos,
redirecciones de recursos y HTML servido como JavaScript/CSS. Comprueba que
`version.json` coincide con el release del bundle ejecutado, no con `main` ni
con las dependencias del checkout: un despliegue anterior coherente puede pasar.
No es una comprobación de rollback, RLS, login ni operaciones de negocio.

La guarda compartida `tests/smoke/readOnlyApp.ts` sólo permite GET/HEAD de
las rutas públicas y assets enumerados del origen exacto, sin query strings.
Aborta APIs incluso del mismo origen y toda red externa (incluidos fuentes y
telemetría); nunca conecta WebSockets. Cada lectura se hace sin seguir
redirecciones y entrega la respuesta real sin reemplazar datos. Un intento de
API del propio origen falla la prueba. Sólo los GET de tipo script a las URLs
exactas `https://liftgo.lovable.app/~flock.js` y
`https://liftgo.lovable.app/__l5e/events.4d3abd1f6b7321c2.js`, inyectadas por el
hosting para analítica, se clasifican como abortos esperados; no se descargan
ni se sirven. Se compara literalmente la URL que entrega Playwright, que el
navegador puede haber normalizado desde el HTML. El clasificador no admite
queries, credenciales, variantes de esa URL ni otros orígenes; únicamente
ignora el fragmento. Su mensaje exacto
`Failed to load resource: net::ERR_FAILED` se ignora sólo con URL atribuida y
registro de ese aborto en la misma ejecución. Cualquier otro recurso del
propio origen, método/tipo de petición o error sigue fallando. Las reglas,
interceptación y atribución se comprueban offline en
`src/test/smokeReadOnlyPolicy.test.ts`, `src/test/smokeConsoleNoise.test.ts` y
`src/test/smokeHostingScriptNoise.test.ts`.

No usa credenciales, estado de sesión, secretos, datos reales ni permisos nuevos.
Los fallos conservan trace/captura durante tres días en `prod-smoke-artifacts`
y usan el issue existente de `prod-smoke`. Para ejecutarlo manualmente:
`bunx playwright test --config playwright.prod-smoke.config.ts`.

El minuto 17 evita la congestión del minuto 0 en GitHub Actions, que retrasaba
o saltaba corridas.

CodeQL analiza los workflows y los scripts Python sin ejecutar los scripts ni
instalar las dependencias de la aplicación. El job existente de JavaScript/
TypeScript conserva su identidad; el job `analyze-tooling` usa una matriz para
Actions y Python con `fail-fast: false`, de modo que un fallo no cancela el otro
análisis. Cada lenguaje publica una categoría estable `/language:<lenguaje>`.

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
bun run lint --max-warnings=0 && bun run typecheck && bun run arch:check
bun run knip                    # archivos, dependencias, exports y tipos sin uso (local)
bun run test:coverage
bun run build && bun run test:e2e:smoke
bun run test:functions          # tests Deno offline
bun run knip:deep               # incluye exports de entradas (informativo)
bun run test:ci-tools           # restricciones del diagnóstico PostgreSQL (offline)
```

## Versión y artefactos de release

Los cambios de CI se documentan aquí. No añaden una versión ficticia ni cambian
los artefactos de release de la aplicación.

## Herramienta de CI (nota de mantenimiento)

GitHub Actions instala Bun 1.4.2 y Node 24 vía `.github/actions/setup-bun-project`
con `bun install --frozen-lockfile`. El pin exacto de Bun se actualiza mediante un
lote validado en CI (no Dependabot). Las suites completas, cobertura, build real y
smoke se ejecutan únicamente en GitHub Actions.


## Optimización medida · 2026-10-01

Muestra: los dos últimos CI y RLS aprobados; dos A/B aprobados sin reintento.
Se comparan duraciones de jobs/steps, no sólo updated_at del workflow (que puede
incluir colas, checks adicionales y reintentos). Referencias: [CI](https://github.com/hlopezb83/liftgo/actions/runs/36944374652), [RLS](https://github.com/hlopezb83/liftgo/actions/runs/36944374706) y [A/B](https://github.com/hlopezb83/liftgo/actions/runs/36944374794).

| Carril | Antes, muestra | Decisión |
| --- | --- | --- |
| Vitest, shard más lento | 160–166 s + merge 45–48 s | Seis shards, suite completa y seis blobs obligatorios |
| Calidad | 143–165 s | Conservar lint, tipos, arquitectura, build y smoke real |
| RLS | 261–275 s; pruebas SQL ~10 s | Un runner; quitar reset duplicado de 31–32 s |
| A/B | 322–329 s; pruebas 29–31 s | Un runner; quitar reset duplicado de 43–49 s y restaurar Chromium |

El arranque de la CLI 2.34.0 sobre un volumen nuevo ya inicializa los schemas y
aplica el historial. Véase [StartDatabase y SetupLocalDatabase](https://github.com/supabase/cli/blob/v2.34.0/internal/db/start/start.go).
scripts/ci_database.py exige GitHub Actions y el DB_URL loopback exacto,
rechaza volúmenes/contenedores previos, deshabilita el seed sólo en el checkout
del runner y compara todas las versiones aplicadas con los archivos. No restaura
snapshots ni cachea datos. Drizzle sigue aplicándose desde su journal oficial.
Los smoke SQL no intentan ejecutarse si falló la preparación o Drizzle.

Se retira --debug del arranque exitoso: una sola corrida RLS emitía 13.2 millones
de caracteres y 36,147 paquetes PostgreSQL de diagnóstico. La CLI conserva sus
errores normales y logs de servicios no saludables; RLS mantiene el diagnóstico
Docker en fallo. Los errores SQL y reportes bloqueantes siguen visibles.

La caché de Bun ahora se restaura en consumidores; sólo quality guarda una clave
ausente, inmediatamente después de instalar. Se elimina la caché de Vite de
475 bytes (sin prebundle útil) y el caché externo de CLI cuya ruta no usa la
action actual. Chromium se comparte entre quality y A/B por versión de Playwright;
las dependencias del sistema se instalan en cada runner. No se cachea node_modules
ni se omite bun install --frozen-lockfile.

No se aumentan shards de RLS o A/B: repetir ~160 s de bootstrap para repartir
10–30 s de pruebas empeora el costo y aporta poco. Tampoco se paralelizan suites
SQL sobre una misma BD: comparten locks y fixtures. Los siete workflows actuales
se conservan; seguridad, monitoreo y restore manual tienen propósitos distintos.

El análisis IA de GitHub es una integración dinámica, no un YAML del repositorio.
Los errores HTTP 402 corresponden a cuota agotada y no se corrigen quitando
CodeQL, Gitleaks o dependency-review.

Los tiempos posteriores y minutos acumulados de runners deben contrastarse con
esta muestra. Seis shards suman dos instalaciones/runners; si no reducen la espera
por colas o desbalance, se vuelve a cuatro. El número de pruebas y los umbrales
de cobertura se conservan.

## Gate de recorridos y layout (auditoría de tests, 2026-10-03)

El workflow multi-tenant-ab reutiliza la BD/API/Auth/Storage local temporal.
Ahora ejecuta transiciones reales, además de aislamiento: aceptación y conversión
UI de una cotización nueva, guardado RPC de factura y sus relaciones; entrega y
devolución por las RPC oficiales; pago parcial y final por UI con persistencia;
portal de plataforma con raíz autorizado y admin de empresa rechazado.
La creación inicial de la cotización y la factura del recorrido comercial usa
la API real; no se presenta como cobertura de sus formularios completos.

La matriz A/B prueba ambos sentidos. Lecturas vacías requieren error=null y
controles propios positivos; escrituras negativas exigen el contrato esperado
por permisos. Storage también verifica contenido y existencia para el dueño.

Se crean identidades desechables locales de ventas, administración y mecánica.
Las regresiones heredadas de roles, precarga y conciliación corren en el proyecto
legacy-regressions, contra el mismo backend temporal. Ningún caso obligatorio
se omite por falta de credenciales, cotizaciones o candidatos. Los fixtures
bancarios crean su propio pago y factura, y verifican limpieza por ID/scope.

Layout se mide con Chromium a 390, 768 y 1440 px: desbordamiento horizontal,
modal y toast dentro del viewport, y acciones alcanzables sin overlays. Los
screenshots al fallar son diagnóstico, no baselines visuales pixel a pixel.
Las pruebas de navegador tienen typecheck propio y reglas Playwright en ESLint.
Los filtros incluyen consultas de customers usadas por portal, AuthContext,
caché y módulos consumidos por estos recorridos.

Cobertura consolidada: mínimos globales L48/S47/F38/B42; dominio
L95/S94/F92/B85; facturación L81/S80/F88/B73; cuentas por pagar
L85/S84/F94/B74. La base observada fue 49.73% global y 96.79% dominio.
No se calcula un mínimo global a partir de un shard individual.

En el carril manual heredado, ningún shard ejecuta la purga global. Esperar
TODOS los procesos y ejecutar una vez E2E_FINAL_CLEANUP=1 bun scripts/cleanup-e2e.ts
con la configuración del backend aislado. Login, purga o apagado del seed fallidos
hacen fallar ese paso; no se toma el mayor índice como último en terminar.
La limpieza por scope sigue activa durante cada prueba.

## Advertencias de empaquetado

Revisión del 5 de octubre de 2026, con Vite 8.3.2, Rolldown 1.2.11,
Nitro 3.0.260603-beta, React PDF 4.6.1 y Wrangler 4.147.0:

- `Some chunks are larger than 500 kB`: el renderer de PDF ronda 1.2 MB sin
  comprimir y se importa sólo al descargar documentos. Mantener la carga
  diferida; dividir ese motor únicamente para ocultar el aviso no reduce sus
  bytes totales ni prueba una mejora de rendimiento.
- `IMPORT_IS_UNDEFINED` en `@react-pdf/font`: su ruta para archivos del sistema
  llama a `fontkit.open`, que la distribución browser no exporta. LiftGo usa
  las fuentes estándar Helvetica y no registra archivos locales. Si se añaden
  fuentes, usar URLs o datos compatibles con el navegador y probar un PDF real.
- `MODULE_LEVEL_DIRECTIVE`, `inlineDynamicImports` y el nombre de grupo sin
  `debugName` provienen del empaquetado SSR de dependencias/Nitro. Conservar
  los diagnósticos y validar el arranque; no editar `node_modules`, agregar
  filtros generales ni modificar el orden de ejecución sólo para silenciarlos.
- El reporte de stdout/stderr `EPIPE` de Wrangler está cerrado por
  [Cloudflare #15323](https://github.com/cloudflare/workers-sdk/pull/15323).
  La versión 4.147.0 ya registra sus handlers en el CLI. Esto no garantiza
  que todos los errores de procesos o red sean equivalentes: ante un nuevo
  fallo, conservar el log, distinguir Wrangler de workerd y comprobar que
  el servidor realmente siga atendiendo peticiones.

Las advertencias anteriores no sustituyen la validación de errores de página,
hidratación, descargas o rendimiento. El límite de chunks y los demás avisos
se mantienen activos.


### Replay Drizzle efímero y recibos target-bound revisados

Los gates RLS y A/B validan primero el journal canónico (`migrations:check`).
`ci-drizzle-replay.mjs prepare` genera una copia temporal aislada del historial y
registra explícitamente la exclusión del recibo `0108_control0108_verified_release`.
Este bloque DO verifica el estado concreto del destino liberado (incluidos ACL y
ledger de su preflight), no define esquema funcional portable para una BD vacía.
Sólo se reconoce su identidad exacta: idx 108, when 1792440638110 y SHA-256
`ce97a5bcebbcf5f5671861c4d74ed33b3c930710e9f99ded7441a7daf5ec89eb`.
Cualquier deriva de esta identidad aborta; no existe una exclusión genérica de
controles ni una opción para deshabilitar verificaciones.

Además se admite, únicamente cuando lo genere el runner oficial, el recibo
opcional `0110_control0109_verified_release`: idx 110, breakpoints true y SHA-256
`3e99b978f260dedd927dd1104b84b5af74ee524b3d78dff0acd9446c2df2e13f`.
El timestamp todavía no existe antes de esa generación: debe satisfacer las
reglas canónicas de entero seguro positivo y orden estrictamente creciente, y
su valor observado queda ligado al manifest. Una deriva posterior invalida el
replay preparado. Su ausencia no bloquea el historial anterior; otra migración
en idx 110 sigue ejecutándose, nunca se omite por nombre o prefijo. Bytes
modificados, identidad distinta o una copia duplicada del recibo se rechazan.
La migración funcional 0109 se conserva íntegra y debe figurar en el ledger de CI.
El fixture SQL bajo `scripts/tests/fixtures` sólo prueba este reconocimiento;
no se agrega el recibo a migraciones ni se ejecuta desde el fixture.

`drizzle.ci.config.ts` consume únicamente esa copia validada y rechaza destinos
distintos del PostgreSQL local efímero de CI. Todas las migraciones funcionales
conservan sus bytes y orden canónico. Tras `drizzle-kit migrate`, `verify` compara
el ledger real completo (hash y timestamp) contra el replay; no inserta ni simula
filas aplicadas para los recibos excluidos. El diagnóstico en fallo consume la misma copia,
valida el prefijo aplicado y revierte siempre su transacción.

El SQL, snapshots, journal y configuración productivos permanecen intactos. Las
suites SQL/RLS y A/B siguen ejecutándose completas después del gate de ledger.
Cada recibo conserva su verificación propia en el destino autorizado; CI no
pretende certificar ni reconstruir ese estado productivo.
