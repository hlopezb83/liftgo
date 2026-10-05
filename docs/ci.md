# CI: qué corre, cuándo y por qué

Principio: **cada corrida automática debe poder fallar por una razón real y
accionable**. Si un check no puede fallar por algo que importe, se elimina; si
puede escribir en producción, no corre solo.

## Dependabot: revisión semanal

`.github/dependabot.yml` revisa Bun y GitHub Actions los lunes a las 06:00,
zona `America/Monterrey`. Bun mantiene como máximo dos PR de versiones abiertos
entre todos sus grupos; Actions mantiene uno. Las alertas y actualizaciones de
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

## En cada PR y push a `main` — `ci.yml`

Dos jobs base + condicionales. Sin `schedule`. Las corridas obsoletas de la
misma rama se cancelan.

Los workflows fijan `ubuntu-24.04` para mantener el sistema operativo validado
y evitar la migración automática de `ubuntu-latest`. El job de calidad usa
`bun run lint --max-warnings=0`: tanto errores como advertencias de ESLint
bloquean la integración. Los avisos informativos de pruebas aprobadas se conservan.

| Job | Corre | Qué protege |
| --- | --- | --- |
| `quality` | siempre | ESLint, typecheck, guardrails de arquitectura, build y **smoke de arranque** |
| `tests` (matriz 1/6 … 6/6) | siempre | Suite completa de Vitest, repartida en seis shards |
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
bun run lint --max-warnings=0 && bun run typecheck && bun run arch:check
bun run knip                    # archivos/dependencias sin uso (no corre en CI)
bun run test:coverage
bun run build && bun run test:e2e:smoke
bun run test:functions          # tests Deno offline
bun run knip:deep               # exports/tipos sin uso (informativo)
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
